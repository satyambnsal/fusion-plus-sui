import express from 'express';
import { ethers } from 'ethers';
import {
    Address,
    AuctionDetails,
    CrossChainOrder,
    HashLock,
    TimeLocks,
    TakerTraits,
    randBigInt,
    AmountMode,
    Extension
} from '@1inch/cross-chain-sdk';
import { uint8ArrayToHex } from '@1inch/byte-utils';
import { provider, ethereumConfig } from '../config.js';
import { Resolver as EthereumResolverContract } from '../lib/resolver.js';
import { Wallet } from '../lib/wallet.js';


const router = express.Router();
const userPk = '7764b03c4d3eb019cc0ec0630429622593b8d7625b83a109e9f2279828a88a66'
let ethereumUser = new Wallet(userPk, provider)


const UINT_40_MAX = 2n ** 40n - 1n;

/**
 * POST /announceOrder
 * Announces a cross-chain swap order to the relayer using 1inch Cross-Chain SDK
 */
router.post('/createOrder', async (req, res) => {
    const {
        maker,
        makingAmount,
        takingAmount,
        makerAsset,
        takerAsset,
        secret,
        srcChainId,
        dstChainId       // Hash of the secret for escrow
    } = req.body;

    // Step 1: Validate input parameters
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
        const timestamp = BigInt(((await provider.getBlock('latest'))!).timestamp)

        const order = CrossChainOrder.new(
            new Address(ethereumConfig.escrowFactoryContractAddress),
            {
                salt: randBigInt(1000n),
                maker: new Address(maker),
                makingAmount: BigInt(makingAmount), // 1 USDC
                takingAmount: BigInt(takingAmount), // Equivalent amount on Aptos
                makerAsset: new Address(makerAsset),
                takerAsset: new Address(takerAsset) // Placeholder for Aptos token
            },
            {
                hashLock: HashLock.forSingleFill(finalSecret),
                timeLocks: TimeLocks.new({
                    srcWithdrawal: 10n,           // 10sec finality lock
                    srcPublicWithdrawal: 120n,    // 2min private withdrawal
                    srcCancellation: 121n,        // 1sec public withdrawal
                    srcPublicCancellation: 122n,  // 1sec private cancellation
                    dstWithdrawal: 10n,           // 10sec finality lock
                    dstPublicWithdrawal: 100n,    // 100sec private withdrawal
                    dstCancellation: 101n         // 1sec public withdrawal
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

        res.json({ success: true, order: order.build(), typedData, extension })
    } catch (e: any) {
        return res.status(400).json({ error: 'Failed to create order', details: e.message });
    }

});



router.post('/fillOrder', async (req, res) => {
    const { order, signature, srcChainId, extension } = req.body

    const orderInstance = CrossChainOrder.fromDataAndExtension(order, Extension.decode(extension))
    const orderHash = orderInstance.getOrderHash(srcChainId)
    const ethereumResolverWallet = new Wallet(ethereumConfig.resolverPk, provider);
    const resolverContract = new EthereumResolverContract(ethereumConfig.resolverContractAddress, "APTOS_RESOLVER_ADDRESS")

    console.log(`[Ethereum] Filling order ${orderHash}`)
    const fillAmount = orderInstance.makingAmount

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

    // const balance = await getEthereumBalances(config.chain.ethereum.tokens.USDC.address);
    // console.log("######### Balance after eth order filled ##########")

    res.json({ succeess: true })


})


export default router
