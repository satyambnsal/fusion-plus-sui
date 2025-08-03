
import WebSocket from 'ws';
import { ETH_CHAIN_ID, ethereumConfig, provider, SUI_CONFIG, suiClient } from '../config';
import { AmountMode, CrossChainOrder, Extension, HashLock, TakerTraits, EscrowFactory as InchEscrowFactory, Address } from '@1inch/cross-chain-sdk';
import { Wallet } from '../lib/wallet';
import { Resolver as EthereumResolverContract } from '../lib/resolver.js';
import { EscrowFactory } from '../lib/EscrowFactory';
import { db } from '../relayer/db/index.js';
import { claimFunds, findCoinsOfType, fundDstEscrow, getBalance } from '../lib/sui-handlers.js';
import { ethers } from 'ethers';
import { uint8ArrayToHex } from '@1inch/byte-utils';
import { sleep } from 'bun';


const ws = new WebSocket('ws://localhost:3004');

const ethereumResolverWallet = new Wallet(ethereumConfig.resolverPk, provider);
const resolverContract = new EthereumResolverContract(ethereumConfig.resolverContractAddress, SUI_CONFIG.RESOLVER_PROXY_ADDRESS)
const ethereumFactory = new EscrowFactory(provider, ethereumConfig.escrowFactoryContractAddress);

console.log('######### Resolver 2: This resolver only fill order initiated from ETH blockchain')

ws.on('open', () => {
  console.log('Connected to relayer WebSocket server');
});

ws.on('message', async (data: any) => {
  const message = JSON.parse(data);
  if (message.event === 'newOrder') {
    const { order, signature, srcChainId, extension, secretHash } = message.data;
    if (srcChainId === ETH_CHAIN_ID) {
      const orderInstance = CrossChainOrder.fromDataAndExtension(order, Extension.decode(extension))
      const orderHash = orderInstance.getOrderHash(srcChainId)
      const hashLock = HashLock.fromString(secretHash)
      const fillAmount = orderInstance.makingAmount
      const takingAmount = orderInstance.takingAmount
      console.log(`Resolver 2 is filling order for order hash ${orderHash}`)




      const proxyEthAddress = orderInstance.receiver.toString();
      const receiverAddressSui = await db.data.addressMappings.find(m => m.ethProxyAddress.toLowerCase() === proxyEthAddress.toLowerCase())?.suiAddress;
      if (!receiverAddressSui) {
        console.error(`❌ No Sui address mapped to proxy Ethereum address ${proxyEthAddress}`);
        return
      }
      const { txHash: orderFillHash, blockHash: ethereumDeployBlock } = await ethereumResolverWallet.send(
        resolverContract.deploySrc(
          srcChainId,
          orderInstance,
          signature,
          TakerTraits.default()
            .setExtension(orderInstance.extension)
            .setAmountMode(AmountMode.maker)
            .setAmountThreshold(orderInstance.takingAmount),
          fillAmount
        )
      )

      console.log(`[Ethereum] Order ${orderHash} filled for ${fillAmount} USDC in tx: ${orderFillHash}`)

      const resolverCoins = await findCoinsOfType(suiClient, SUI_CONFIG.SILVER_COIN_ADDRESS, SUI_CONFIG.RESOLVER_ADDRESS);
      if (resolverCoins.length === 0) {
        console.log('❌ Resolver has no coins of the required type');
        return;
      }

      const secretHashU8 = new Uint8Array(ethers.getBytes(secretHash))

      console.log("before funding destination escrow")
      console.log(await getBalance(SUI_CONFIG.SILVER_COIN_ADDRESS, SUI_CONFIG.RESOLVER_ADDRESS));
      console.log('✅ Found resolver coins:', resolverCoins[0].coinObjectId, receiverAddressSui);
      console.log(suiClient, SUI_CONFIG.RESOLVER_KEYPAIR, SUI_CONFIG.SILVER_COIN_ADDRESS, Number(takingAmount), 300000 * 1e3, secretHashU8, resolverCoins[0].coinObjectId, receiverAddressSui)
      const response = await fundDstEscrow(suiClient, SUI_CONFIG.RESOLVER_KEYPAIR, SUI_CONFIG.SILVER_COIN_ADDRESS, Number(takingAmount), 300000 * 1e3, secretHashU8, resolverCoins[0].coinObjectId, receiverAddressSui)
      console.log("After funding destination escrow", response)
      console.log(await getBalance(SUI_CONFIG.SILVER_COIN_ADDRESS, SUI_CONFIG.RESOLVER_ADDRESS));
      const originalSecret = ethers.toUtf8Bytes("my_secret_password_for_swap_test")
      const hexSecret = uint8ArrayToHex(originalSecret)

      await sleep(2000)

      const claimFundResp = await claimFunds(suiClient, SUI_CONFIG.RESOLVER_KEYPAIR, SUI_CONFIG.SILVER_COIN_ADDRESS, response.orderObjectId, originalSecret)
      console.log(`Claim fund on destination chain transaction hash ${claimFundResp?.digest}`)
      await sleep(2000)

      console.log("Fund after claiming balance")
      console.log(await getBalance(SUI_CONFIG.SILVER_COIN_ADDRESS, SUI_CONFIG.RESOLVER_ADDRESS));



      const ethereumEscrowEvent = await ethereumFactory.getSrcDeployEvent(ethereumDeployBlock)


      const ESCROW_SRC_IMPLEMENTATION = await ethereumFactory.getSourceImpl()
      const srcEscrowAddress = new InchEscrowFactory(new Address(ethereumConfig.escrowFactoryContractAddress)).getSrcEscrowAddress(
        ethereumEscrowEvent[0],
        ESCROW_SRC_IMPLEMENTATION
      )
      console.log(`[Ethereum] Withdrawing funds for resolver from ${srcEscrowAddress}`)
      // Both runs should succeed - the Ethereum side is independent of Aptos funding

      const { txHash: resolverWithdrawHash } = await ethereumResolverWallet.send(

        resolverContract.withdraw('src', srcEscrowAddress, hexSecret, ethereumEscrowEvent[0])
      )

      console.log(`[Ethereum] Successfully withdrew funds for resolver in tx: ${resolverWithdrawHash}`)


      // const balance = await getEthereumBalances(config.chain.ethereum.tokens.USDC.address);
      // console.log("######### Balance after eth order filled ##########")


    }
  }
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

ws.on('close', () => {
  console.log('Disconnected from relayer WebSocket server');
});
