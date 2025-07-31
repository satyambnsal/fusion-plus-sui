import express from 'express';
import { ethers } from 'ethers';
import {
    Address,
    AuctionDetails,
    CrossChainOrder,
    HashLock,
    TimeLocks,
    randBigInt,
    Extension,
    TakerTraits,
    AmountMode
} from '@1inch/cross-chain-sdk';
import { uint8ArrayToHex } from '@1inch/byte-utils';
import { provider, ethereumConfig, SUI_CONFIG, suiClient } from '../config.js';
import { Resolver as EthereumResolverContract } from '../lib/resolver.js';
import { Wallet } from '../lib/wallet.js';
import { db } from '../db'
import { getKeypair } from '../lib/privKey.js';
import { claimFunds, findCoinsOfType, fundDstEscrow, getBalance } from '../lib/sui-handlers.js';
import { sleep } from 'bun';


const router = express.Router();

const UINT_40_MAX = 2n ** 40n - 1n;

router.post('/createOrder', async (req, res) => {
    const {
        maker,
        makingAmount,
        takingAmount,
        makerAsset,
        takerAsset,
        secret,
        srcChainId,
        dstChainId
    } = req.body;

    if (
        !maker ||
        !srcChainId ||
        !dstChainId ||
        !makerAsset ||
        !takerAsset ||
        !makingAmount ||
        !takingAmount ||
        !secret
    ) {
        return res.status(400).json({
            error: 'Missing required parameters',
            required: [
                'makerAddress', 'srcChainId', 'dstChainId', 'srcTokenAddress',
                'dstTokenAddress', 'srcAmount', 'dstAmount', 'secretHash', 'signature'
            ]
        });
    }

    try {
        const secretBytes = ethers.toUtf8Bytes(secret);
        const finalSecret = uint8ArrayToHex(secretBytes)
        const secretHash = HashLock.hashSecret(finalSecret)
        const timestamp = BigInt(((await provider.getBlock('latest'))!).timestamp)

        const order = CrossChainOrder.new(
            new Address(ethereumConfig.escrowFactoryContractAddress),
            {
                salt: randBigInt(1000n),
                maker: new Address(maker),
                makingAmount: BigInt(makingAmount),
                takingAmount: BigInt(takingAmount),
                makerAsset: new Address(makerAsset),
                takerAsset: new Address(takerAsset)
            },
            {
                hashLock: HashLock.forSingleFill(finalSecret),
                timeLocks: TimeLocks.new({
                    srcWithdrawal: 10n,
                    srcPublicWithdrawal: 120n,
                    srcCancellation: 121n,
                    srcPublicCancellation: 122n,
                    dstWithdrawal: 10n,
                    dstPublicWithdrawal: 100n,
                    dstCancellation: 101n
                }),
                srcChainId: 1,
                dstChainId,
                srcSafetyDeposit: ethers.parseEther('0.001'),
                dstSafetyDeposit: ethers.parseEther('0.001')
            },
            {
                auction: new AuctionDetails({
                    initialRateBump: 0,
                    points: [],
                    duration: 120n,
                    startTime: timestamp
                }),
                whitelist: [
                    {
                        address: new Address(ethereumConfig.resolverContractAddress),
                        allowFrom: 0n
                    }
                ],
                resolvingStartTime: 0n
            },
            {
                nonce: randBigInt(UINT_40_MAX),
                allowPartialFills: false,
                allowMultipleFills: false
            }
        )
        const typedData = order.getTypedData(srcChainId)
        const extension = order.extension.encode()

        const orderHash = order.getOrderHash(srcChainId)
        const limitOrderV4 = order.build();
        await db.data.orders.push({
            limitOrderV4, orderHash, extension
        });
        await db.write();
        res.json({ success: true, limitOrderV4, typedData, extension, secretHash })
    } catch (e: any) {
        return res.status(400).json({ error: 'Failed to create order', details: e.message });
    }
});



router.post('/fillOrder', async (req, res) => {
    const { order, signature, srcChainId, extension, secretHash } = req.body

    const orderInstance = CrossChainOrder.fromDataAndExtension(order, Extension.decode(extension))
    const orderHash = orderInstance.getOrderHash(srcChainId)
    const ethereumResolverWallet = new Wallet(ethereumConfig.resolverPk, provider);
    const resolverContract = new EthereumResolverContract(ethereumConfig.resolverContractAddress, "APTOS_RESOLVER_ADDRESS")

    console.log(`[Ethereum] Filling order ${orderHash}`)
    const fillAmount = orderInstance.makingAmount
    const takingAmount = orderInstance.takingAmount

    // const { txHash: orderFillHash, blockHash: ethereumDeployBlock } = await ethereumResolverWallet.send(
    //     resolverContract.deploySrc(
    //         srcChainId,
    //         orderInstance,
    //         signature,
    //         TakerTraits.default()
    //             .setExtension(orderInstance.extension)
    //             .setAmountMode(AmountMode.maker)
    //             .setAmountThreshold(orderInstance.takingAmount),
    //         fillAmount
    //     )
    // )

    // console.log(`[Ethereum] Order ${orderHash} filled for ${fillAmount} USDC in tx: ${orderFillHash}`)
    const resolverCoins = await findCoinsOfType(suiClient, SUI_CONFIG.SILVER_COIN_ADDRESS, SUI_CONFIG.RESOLVER_ADDRESS);
    if (resolverCoins.length === 0) {
        console.log('❌ Resolver has no coins of the required type');
        return;
    }

    const secretHashU8 = new Uint8Array(ethers.getBytes(secretHash))

    console.log("before funding destination escrow")
    console.log(await getBalance(SUI_CONFIG.RESOLVER_ADDRESS));
    console.log('✅ Found resolver coins:', resolverCoins[0].coinObjectId);
    const response = await fundDstEscrow(suiClient, SUI_CONFIG.RESOLVER_KEYPAIR, SUI_CONFIG.SILVER_COIN_ADDRESS, Number(takingAmount), 300000 * 1e3, secretHashU8, resolverCoins[0].coinObjectId)


    console.log("After funding destination escrow", response)
    console.log(await getBalance(SUI_CONFIG.RESOLVER_ADDRESS));
    const originalSecret = ethers.toUtf8Bytes("my_secret_password_for_swap_test")
    await sleep(2000)
    const claimFundResp = await claimFunds(suiClient, SUI_CONFIG.RESOLVER_KEYPAIR, SUI_CONFIG.SILVER_COIN_ADDRESS, response.orderObjectId, originalSecret)
    console.log("CLAIM FUND BALANCE", claimFundResp.digest)
    await sleep(2000)
    console.log("Fund after claiming balance")
    console.log(await getBalance(SUI_CONFIG.RESOLVER_ADDRESS));
    // const balance = await getEthereumBalances(config.chain.ethereum.tokens.USDC.address);
    // console.log("######### Balance after eth order filled ##########")

    res.json({ succeess: true })


})


export default router
