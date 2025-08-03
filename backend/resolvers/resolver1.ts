import WebSocket from 'ws';
import { ethereumConfig, provider, SOCKET_EVENTS, SUI_CHAIN_ID, SUI_CONFIG, suiClient } from '../config';
import { Address, CrossChainOrder, DstImmutablesComplement, Extension, HashLock, EscrowFactory as InchEscrowFactory } from '@1inch/cross-chain-sdk';
import { ethers } from 'ethers';
import { Resolver as EthereumResolverContract } from '../lib/resolver.js';
import { EscrowFactory } from '../lib/EscrowFactory.js';
import { db } from '../relayer/db/index.js';
import { claimFunds, findCoinsOfType, fundSrcEscrow, getBalance } from '../lib/sui-handlers.js';
import { sleep } from 'bun';
import { uint8ArrayToHex } from '@1inch/byte-utils';
import { Wallet } from '../lib/wallet.js';
import { getEthereumTokenBalance } from '../lib/utils.js';

const WS_URL = 'ws://localhost:3004';
const RECONNECT_INTERVAL = 1000;
const MAX_RECONNECT_ATTEMPTS = 10;

const ethereumResolverWallet = new Wallet(ethereumConfig.resolverPk, provider);
const resolverContract = new EthereumResolverContract(ethereumConfig.resolverContractAddress, SUI_CONFIG.RESOLVER_PROXY_ADDRESS);
const ethereumFactory = new EscrowFactory(provider, ethereumConfig.escrowFactoryContractAddress);

let ws: WebSocket;
let isConnected = false;
let reconnectAttempts = 0;

const connectWebSocket = () => {
  ws = new WebSocket(WS_URL);
  ws.on('open', () => {
    console.log('Resolver1 Connected to relayer WebSocket server');
    isConnected = true;
    reconnectAttempts = 0;
  });

  ws.on('message', async (data) => {
    const message = JSON.parse(data);
    if (message.event === SOCKET_EVENTS.NEW_ORDER) {
      const { order, signature, srcChainId, extension, secretHash } = message.data;
      if (srcChainId === SUI_CHAIN_ID) {
        const orderInstance = CrossChainOrder.fromDataAndExtension(order, Extension.decode(extension));
        const orderHash = orderInstance.getOrderHash(srcChainId);
        const hashLock = HashLock.fromString(secretHash);
        const fillAmount = orderInstance.makingAmount;
        const takingAmount = orderInstance.takingAmount;

        console.log(`Resolver 1 is filling order for order hash ${orderHash} for chain id ${srcChainId}`);

        const proxyEthAddress = orderInstance.maker.toString();
        const makerAddressSui = await db.data.addressMappings.find(
          (m) => m.ethProxyAddress.toLowerCase() === proxyEthAddress.toLowerCase()
        )?.suiAddress;

        if (!makerAddressSui) {
          console.error(`❌ No Sui address mapped to proxy Ethereum address ${proxyEthAddress} for chain id ${srcChainId}`);
          return;
        }

        const makerCoins = await findCoinsOfType(suiClient, SUI_CONFIG.SILVER_COIN_ADDRESS, makerAddressSui);
        if (makerCoins.length === 0) {
          console.log('❌ Maker has no coins of the required type');
          return;
        }
        console.log('✅ Found maker coins:', makerCoins[0].coinObjectId);

        const secretHashU8 = new Uint8Array(ethers.getBytes(secretHash));
        let makerBalance = await getBalance(SUI_CONFIG.SILVER_COIN_ADDRESS, makerAddressSui);
        console.log(`Maker total balance before announce order ${makerBalance.totalBalance}`);
        const { orderObjectId: srcEscrowOrderObjectId, txnHash: srcEscrowDeployTxHash } = await fundSrcEscrow(
          SUI_CONFIG.SILVER_COIN_ADDRESS,
          Number(1000000000),
          1000000,
          1 * 1e6,
          secretHashU8,
          makerCoins[0].coinObjectId,
          signature,
          SUI_CONFIG.USER_KEYPAIR
        );
        await sleep(2000);
        makerBalance = await getBalance(SUI_CONFIG.SILVER_COIN_ADDRESS, makerAddressSui);
        console.log(`Maker total balance after announce order ${makerBalance.totalBalance}`);

        const taker = orderInstance.receiver;
        const immutables = orderInstance.toSrcImmutables(srcChainId, taker, takingAmount, hashLock);

        const { txHash: dstEscrowDeployTxHash, blockHash: ethereumDeployBlock } = await ethereumResolverWallet.send(
          resolverContract.deployDst(immutables)
        );

        const ESCROW_DST_IMPLEMENTATION = await ethereumFactory.getDestinationImpl();
        const dstEscrowAddress = new InchEscrowFactory(new Address(ethereumConfig.escrowFactoryContractAddress))
          .getDstEscrowAddress(
            immutables,
            DstImmutablesComplement.new({
              amount: immutables.amount,
              maker: immutables.maker,
              safetyDeposit: immutables.safetyDeposit,
              token: immutables.token,
            }),
            0n,
            immutables.taker,
            ESCROW_DST_IMPLEMENTATION
          );

        const originalSecret = ethers.toUtf8Bytes('my_secret_password_for_swap_test');
        const hexSecret = uint8ArrayToHex(originalSecret);
        let takerBalance = await getEthereumTokenBalance(ethereumConfig.tokens.USDC.address, taker.toString());
        console.log(`Taker ${taker.toString()} balance before withdraw ${takerBalance}`);

        const { txHash: resolverWithdrawHash } = await ethereumResolverWallet.send(
          resolverContract.withdraw('dst', dstEscrowAddress, hexSecret, immutables)
        );

        await sleep(3000);
        takerBalance = await getEthereumTokenBalance(ethereumConfig.tokens.USDC.address, taker.toString());
        console.log(`Taker ${taker.toString()} balance after withdraw ${takerBalance}`);

        let resolverBalanceSui = await getBalance(SUI_CONFIG.SILVER_COIN_ADDRESS, SUI_CONFIG.RESOLVER_ADDRESS);
        console.log(`Resolver total balance before claiming funds ${resolverBalanceSui.totalBalance}`);
        const claimFundResp = await claimFunds(
          suiClient,
          SUI_CONFIG.RESOLVER_KEYPAIR,
          SUI_CONFIG.SILVER_COIN_ADDRESS,
          srcEscrowOrderObjectId,
          originalSecret
        );
        await sleep(2000);
        resolverBalanceSui = await getBalance(SUI_CONFIG.SILVER_COIN_ADDRESS, SUI_CONFIG.RESOLVER_ADDRESS);
        console.log(`Resolver total balance after claiming funds ${resolverBalanceSui.totalBalance}`);

        const payload = {
          orderHash,
          srcEscrowDeployTxHash: srcEscrowDeployTxHash || '',
          dstEscrowDeployTxHash,
        };
        await db.data.filledOrders.push(payload);
        await db.write();
        console.log('Data written to DB successfully', payload);
        ws.send(JSON.stringify({ kind: SOCKET_EVENTS.ORDER_FILLED, data: payload }));
      } else {
        console.log(`Skipping this order as order is not initiated from SUI chain`);
      }
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    isConnected = false;
    attemptReconnect();
  });

  ws.on('close', () => {
    console.log('Disconnected from relayer WebSocket server');
    isConnected = false;
    attemptReconnect();
  });
};

const attemptReconnect = () => {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error('Max reconnection attempts reached. Stopping reconnection.');
    return;
  }

  if (!isConnected) {
    const delay = RECONNECT_INTERVAL * Math.pow(2, reconnectAttempts);
    console.log(`Attempting to reconnect (${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS}) in ${delay}ms...`);
    reconnectAttempts++;

    setTimeout(() => {
      connectWebSocket();
    }, delay);
  }
};


console.log('######### Resolver 1: This resolver only fills orders initiated from SUI blockchain');

connectWebSocket();
