import { beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import {
  announceOrder,
  cancelSwap,
  getBalance,
  findCoinsOfType,
  executeTransaction,
  fundDstEscrow,
  claimFunds,
} from './index';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { ethers } from 'ethers';
import { GenericKeyPairType, getKeypair } from './utils/privKey';
import { sleep } from 'bun';

const RPC_URL = getFullnodeUrl('testnet');
const SILVER_COIN_ADDRESS = process.env.SILVER_COIN_ADDRESS || '0xe33c8ada01d0c54b83546a768bf35b9af658502b59fa03c20793f832a91098d5::silver::SILVER';
const PACKAGE_ID = process.env.SWAP_PACKAGE_ID || 'YOUR_PACKAGE_ID_HERE';
const REGISTRY_OBJECT_ID = process.env.SWAP_REGISTRY_OBJECT_ID || 'YOUR_REGISTRY_OBJECT_ID_HERE';
const CLOCK_OBJECT_ID = '0x6';

const client = new SuiClient({ url: RPC_URL });
const userKeypair: GenericKeyPairType = getKeypair(process.env.USER_PRIVATE_KEY || '');
const userAddress = userKeypair.getPublicKey().toSuiAddress();
const resolverKeypair = getKeypair(process.env.RESOLVER_PRIVATE_KEY || "")
const resolverAddress = resolverKeypair.getPublicKey().toSuiAddress()

describe('Maker', () => {
  let initialBalance: string;
  let coinObjectId: string;
  let orderObjectId: string;
  const AMOUNT = 1 * 1e6;
  const MIN_AMOUNT = 1 * 1e6;
  const EXPIRATION_MS = 3600000;
  const secret = ethers.toUtf8Bytes('my_secret_password_for_swap_test');
  const secretHash = new Uint8Array(ethers.getBytes(ethers.keccak256(secret)));

  beforeAll(async () => {
    const coins = await findCoinsOfType(SILVER_COIN_ADDRESS, userAddress);
    expect(coins.length).toBeGreaterThan(0);
    coinObjectId = coins[0].coinObjectId;

    // Get initial balance
    const balance = await getBalance(userAddress);
    initialBalance = balance.totalBalance;
    expect(initialBalance).not.toBe('0');
  });

  describe('Announce Order', () => {
    it('should announce order and decrease user balance', async () => {
      // Get balance before announcing order
      const balanceBefore = await getBalance(userAddress);
      const balanceBeforeNum = BigInt(balanceBefore.totalBalance);

      // Announce order and get result
      const { success, orderObjectId: newOrderObjectId } = await announceOrder(
        SILVER_COIN_ADDRESS,
        AMOUNT,
        MIN_AMOUNT,
        EXPIRATION_MS,
        secretHash,
        coinObjectId
      );

      expect(success).toBe(true);
      expect(newOrderObjectId).not.toBeNull();
      orderObjectId = newOrderObjectId!; // Store for other tests if needed
      await sleep(4000)
      // Verify balance decreased
      const balanceAfter = await getBalance(userAddress);
      const balanceAfterNum = BigInt(balanceAfter.totalBalance);
      expect(balanceAfterNum).toBeLessThan(balanceBeforeNum);
      expect(balanceBeforeNum - balanceAfterNum).toBeGreaterThanOrEqual(BigInt(AMOUNT));
    });
  });

  describe('Cancel Order', () => {
    beforeEach(async () => {
      // Ensure order is announced before cancellation test
      const coins = await findCoinsOfType(SILVER_COIN_ADDRESS, userAddress);
      expect(coins.length).toBeGreaterThan(0);
      coinObjectId = coins[0].coinObjectId;

      const { success, orderObjectId } = await announceOrder(
        SILVER_COIN_ADDRESS,
        AMOUNT,
        MIN_AMOUNT,
        EXPIRATION_MS,
        secretHash,
        coinObjectId
      );

    });

    it('should cancel order and restore user balance', async () => {
      // Get balance before cancellation
      const { success, orderObjectId } = await announceOrder(
        SILVER_COIN_ADDRESS,
        AMOUNT,
        MIN_AMOUNT,
        EXPIRATION_MS,
        secretHash,
        coinObjectId
      );
      expect(success).toBe(true);
      const balanceBefore = await getBalance(userAddress);
      const balanceBeforeNum = BigInt(balanceBefore.totalBalance);

      // Cancel order
      const cancelSwapTxResponse = await cancelSwap(SILVER_COIN_ADDRESS, orderObjectId);
      expect(cancelSwapTxResponse.errors).toBeUndefined();

      // Verify balance restored
      const balanceAfter = await getBalance(userAddress);
      const balanceAfterNum = BigInt(balanceAfter.totalBalance);
      expect(balanceAfterNum).toBeGreaterThan(balanceBeforeNum);
      expect(balanceAfterNum - balanceBeforeNum).toBeGreaterThanOrEqual(BigInt(AMOUNT));
    });
  });
});


describe.only('Resolver', () => {
  let initialBalance: string;
  let coinObjectId: string;
  let orderObjectId: string;
  const AMOUNT = 1 * 1e6;
  const MIN_AMOUNT = 1 * 1e6;
  const EXPIRATION_MS = 3600000;
  const secret = ethers.toUtf8Bytes('my_secret_password_for_swap_test');
  const secretHash = new Uint8Array(ethers.getBytes(ethers.keccak256(secret)));

  beforeAll(async () => {
    const coins = await findCoinsOfType(SILVER_COIN_ADDRESS, resolverAddress);
    expect(coins.length).toBeGreaterThan(0);
    coinObjectId = coins[0].coinObjectId;

    const balance = await getBalance(resolverAddress);
    initialBalance = balance.totalBalance;
    expect(initialBalance).not.toBe('0');
  });

  describe('Fund destination escrow', () => {
    it('should fund destination escrow with maker secret hash', async () => {
      // Get balance before funding escrow
      const balanceBefore = await getBalance(resolverAddress);
      const balanceBeforeNum = BigInt(balanceBefore.totalBalance);

      const { success, orderObjectId } = await fundDstEscrow(SILVER_COIN_ADDRESS, AMOUNT, EXPIRATION_MS, secretHash, coinObjectId)

      expect(success).toBe(true);
      expect(orderObjectId).not.toBeNull();
      await sleep(4000)

      const balanceAfter = await getBalance(resolverAddress);
      const balanceAfterNum = BigInt(balanceAfter.totalBalance);
      expect(balanceAfterNum).toBeLessThan(balanceBeforeNum);
      expect(balanceBeforeNum - balanceAfterNum).toBeGreaterThanOrEqual(BigInt(AMOUNT));
    });

    it('Maker should be able to claim funds from escrow by providing secret value', async () => {
      const { success, orderObjectId } = await fundDstEscrow(SILVER_COIN_ADDRESS, AMOUNT, EXPIRATION_MS, secretHash, coinObjectId)

      expect(success).toBe(true);
      expect(orderObjectId).not.toBeNull();
      const balanceBefore = await getBalance(userAddress);
      const balanceBeforeNum = BigInt(balanceBefore.totalBalance);

      await claimFunds(SILVER_COIN_ADDRESS, orderObjectId, secret, userKeypair)
      await sleep(4000)

      const balanceAfter = await getBalance(userAddress);
      const balanceAfterNum = BigInt(balanceAfter.totalBalance);
      expect(balanceAfterNum).toBeGreaterThan(balanceBeforeNum);
      expect(balanceAfterNum - balanceBeforeNum).toBeGreaterThanOrEqual(BigInt(AMOUNT));
    })
  });

})
