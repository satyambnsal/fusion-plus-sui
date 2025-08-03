
import WebSocket from 'ws';
import { ethereumConfig, provider, SOCKET_EVENTS, SUI_CHAIN_ID, SUI_CONFIG, suiClient } from '../config';
import { Address, CrossChainOrder, DstImmutablesComplement, Extension, HashLock, EscrowFactory as InchEscrowFactory, } from '@1inch/cross-chain-sdk';
import { ethers } from 'ethers';
import { Resolver as EthereumResolverContract } from '../lib/resolver.js';
import { EscrowFactory } from '../lib/EscrowFactory.js';
import { db } from '../relayer/db/index.js';
import { claimFunds, findCoinsOfType, fundSrcEscrow, getBalance } from '../lib/sui-handlers.js';
import { sleep } from 'bun';
import { uint8ArrayToHex } from '@1inch/byte-utils';
import { Wallet } from '../lib/wallet.js';
import { getEthereumTokenBalance } from '../lib/utils.js';


const ws = new WebSocket('ws://localhost:3004');

const ethereumResolverWallet = new Wallet(ethereumConfig.resolverPk, provider);
const resolverContract = new EthereumResolverContract(ethereumConfig.resolverContractAddress, SUI_CONFIG.RESOLVER_PROXY_ADDRESS)
const ethereumFactory = new EscrowFactory(provider, ethereumConfig.escrowFactoryContractAddress);

console.log('######### Resolver 1: This resolver only fill order initiated from SUI blockchain')

ws.on('open', () => {
  console.log('Connected to relayer WebSocket server');
});



ws.on('message', async (data: any) => {
  const message = JSON.parse(data);
  if (message.event === SOCKET_EVENTS.NEW_ORDER) {

    const { order, signature, srcChainId, extension, secretHash } = message.data;
    // This resolver will only process order coming from SUI chain

    if (srcChainId === SUI_CHAIN_ID) {

      const orderInstance = CrossChainOrder.fromDataAndExtension(order, Extension.decode(extension))
      const orderHash = orderInstance.getOrderHash(srcChainId)
      const hashLock = HashLock.fromString(secretHash)
      const fillAmount = orderInstance.makingAmount
      const takingAmount = orderInstance.takingAmount

      console.log(`Resolver 1 is filling order for order hash ${orderHash}`)
      console.log({ srcChainId })

      const proxyEthAddress = orderInstance.maker.toString();
      const makerAddressSui = await db.data.addressMappings.find(m => m.ethProxyAddress.toLowerCase() === proxyEthAddress.toLowerCase())?.suiAddress;

      if (!makerAddressSui) {
        console.error(`❌ No Sui address mapped to proxy Ethereum address ${proxyEthAddress} for chain id ${srcChainId}`);
        return
      }

      const makerCoins = await findCoinsOfType(suiClient, SUI_CONFIG.SILVER_COIN_ADDRESS, makerAddressSui);

      console.log({
        makerAddressSui,
        userAddress: SUI_CONFIG.USER_KEYPAIR.getPublicKey().toSuiAddress()
      })
      if (makerCoins.length === 0) {
        console.log('❌ Maker has no coins of the required type');
        return;
      }
      console.log('✅ Found maker coins:', makerCoins[0].coinObjectId);

      const secretHashU8 = new Uint8Array(ethers.getBytes(secretHash))
      let makerBalance = await getBalance(SUI_CONFIG.SILVER_COIN_ADDRESS, makerAddressSui)
      console.log(`Maker total balance before announce order ${makerBalance.totalBalance}`)
      const { orderObjectId: srcEscrowOrderObjectId, txnHash: srcEscrowDeployTxHash } = await fundSrcEscrow(SUI_CONFIG.SILVER_COIN_ADDRESS,
        Number(1000000000),
        1000000,
        1 * 1e6,
        secretHashU8,
        makerCoins[0].coinObjectId,
        signature,
        SUI_CONFIG.USER_KEYPAIR
      ); // ideally this should have been called by resolver
      await sleep(2000)
      makerBalance = await getBalance(SUI_CONFIG.SILVER_COIN_ADDRESS, makerAddressSui)
      console.log(`Maker total balance after announce order ${makerBalance.totalBalance}`)

      // user's balance on sui chain will decrease

      // fund_src_escrow on ethereum chain 
      const taker = orderInstance.receiver
      const immutables = orderInstance.toSrcImmutables(srcChainId, taker, takingAmount, hashLock);

      const { txHash: dstEscrowDeployTxHash, blockHash: ethereumDeployBlock } = await ethereumResolverWallet.send(
        resolverContract.deployDst(
          immutables
        )
      )


      const ESCROW_DST_IMPLEMENTATION = await ethereumFactory.getDestinationImpl()
      const dstEscrowAddress = new InchEscrowFactory(new Address(ethereumConfig.escrowFactoryContractAddress))
        .getDstEscrowAddress(
          immutables,
          DstImmutablesComplement.new({
            amount: immutables.amount,
            maker: immutables.maker,
            safetyDeposit: immutables.safetyDeposit,
            token: immutables.token
          }),
          0n,
          immutables.taker,
          ESCROW_DST_IMPLEMENTATION
        )

      const originalSecret = ethers.toUtf8Bytes("my_secret_password_for_swap_test")
      const hexSecret = uint8ArrayToHex(originalSecret)
      let takerBalance = await getEthereumTokenBalance(ethereumConfig.tokens.USDC.address, taker.toString())
      console.log(`Taker ${taker.toString()} balance before withdraw ${takerBalance}`)

      const { txHash: resolverWithdrawHash } = await ethereumResolverWallet.send(
        resolverContract.withdraw('dst', dstEscrowAddress, hexSecret, immutables)
      )

      await sleep(3000)
      takerBalance = await getEthereumTokenBalance(ethereumConfig.tokens.USDC.address, taker.toString())
      console.log(`Taker ${taker.toString()} balance after withdraw ${takerBalance}`)



      let resolverBalanceSui = await getBalance(SUI_CONFIG.SILVER_COIN_ADDRESS, SUI_CONFIG.RESOLVER_ADDRESS)
      console.log(`resolver total balance before claiming funss ${resolverBalanceSui.totalBalance}`)
      const claimFundResp = await claimFunds(suiClient, SUI_CONFIG.RESOLVER_KEYPAIR, SUI_CONFIG.SILVER_COIN_ADDRESS, srcEscrowOrderObjectId, originalSecret)
      // console.log({ orderFillHash, ethereumDeployBlock })
      await sleep(2000)
      resolverBalanceSui = await getBalance(SUI_CONFIG.SILVER_COIN_ADDRESS, SUI_CONFIG.RESOLVER_ADDRESS)
      console.log(`resolver total balance after claiming funds ${resolverBalanceSui.totalBalance}`)
      // resolver will claim fund for user on ethereum chain
      // resolver will claim fund on sui for himself

      const payload = {
        orderHash,
        srcEscrowDeployTxHash,
        dstEscrowDeployTxHash
      }
      ws.send(JSON.stringify({ kind: SOCKET_EVENTS.ORDER_FILLED, data: payload }))

    } else {
      console.log(`Skipping this order as order is not initiated from SUI chain`)
    }
  }
});



ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

ws.on('close', () => {
  console.log('Disconnected from relayer WebSocket server');
});

