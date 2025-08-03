import express from 'express';
import { ethers } from 'ethers';
import {
    Address,
    AuctionDetails,
    CrossChainOrder,
    HashLock,
    TimeLocks,
    randBigInt,
} from '@1inch/cross-chain-sdk';
import { uint8ArrayToHex } from '@1inch/byte-utils';
import { provider, ethereumConfig, ETH_CHAIN_ID, CHAIN_MAPPINGS, SOCKET_EVENTS } from '../../config.js';
import { db } from '../db/index.js'
import { broadcastNewOrder } from '../../lib/utils.js';
import { resolvers } from '../server.js'


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
        dstChainId,
        receiver
    } = req.body;

    if (
        !maker ||
        !srcChainId ||
        !dstChainId ||
        !makerAsset ||
        !takerAsset ||
        !makingAmount ||
        !takingAmount ||
        !secret ||
        !receiver
    ) {
        return res.status(400).json({
            error: 'Missing required parameters',
            required: [
                'maker', 'receiver', 'srcChainId', 'dstChainId', 'srcTokenAddress',
                'dstTokenAddress', 'srcAmount', 'dstAmount', 'secretHash', 'signature'
            ]
        });
    }

    const suiAddress = srcChainId === ETH_CHAIN_ID ? receiver : maker;
    let proxyEthAddress = await db.data.addressMappings.find(m => m.suiAddress === suiAddress)?.ethProxyAddress;
    if (!proxyEthAddress) {
        const wallet = ethers.Wallet.createRandom();
        proxyEthAddress = wallet.address;
        await db.data.addressMappings.push({
            ethProxyAddress: proxyEthAddress,
            suiAddress: suiAddress
        });
        await db.write();
    }

    try {
        const secretBytes = ethers.toUtf8Bytes(secret);
        const finalSecret = uint8ArrayToHex(secretBytes)
        const secretHash = HashLock.hashSecret(finalSecret)
        const timestamp = BigInt(((await provider.getBlock('latest'))!).timestamp)
        const hashLock = HashLock.forSingleFill(finalSecret)

        const order = CrossChainOrder.new(
            new Address(ethereumConfig.escrowFactoryContractAddress),
            {
                salt: randBigInt(1000n),
                maker: new Address((srcChainId === ETH_CHAIN_ID ? maker : proxyEthAddress)),
                receiver: new Address((srcChainId === ETH_CHAIN_ID ? proxyEthAddress : receiver)),
                makingAmount: BigInt(makingAmount),
                takingAmount: BigInt(takingAmount),
                makerAsset: new Address(makerAsset),
                takerAsset: new Address(takerAsset),
            },
            {
                hashLock,
                timeLocks: TimeLocks.new({
                    srcWithdrawal: 10n,
                    srcPublicWithdrawal: 120n,
                    srcCancellation: 121n,
                    srcPublicCancellation: 122n,
                    dstWithdrawal: 10n,
                    dstPublicWithdrawal: 100n,
                    dstCancellation: 101n
                }).setDeployedAt(150n),
                srcChainId: CHAIN_MAPPINGS[srcChainId],
                dstChainId: CHAIN_MAPPINGS[dstChainId],
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
                        allowFrom: 1n
                    }
                ],
                resolvingStartTime: 1n
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
        /** 
         * This is a relayer based trusted setup such that relayer is responsible for listening to order filled events from resolver and then relayer will reveal the secret. 
         * this setup can be moved to frontend as well where wallets can implement functionality to reveal the secret once resolver confirms that both source and destination escrow been deployed
         * 
        */
        await db.data.orderSecrets.push({
            orderHash,
            secret
        });
        await db.write();
        res.json({ success: true, limitOrderV4, typedData, extension, secretHash })
    } catch (e: any) {
        return res.status(400).json({ error: 'Failed to create order', details: e.message });
    }
});



router.post('/submitOrder', async (req, res) => {
    const { order, signature, srcChainId, extension, secretHash } = req.body
    broadcastNewOrder(resolvers, SOCKET_EVENTS.NEW_ORDER, { order, signature, srcChainId, extension, secretHash })
    res.json({ success: true, message: "Order submitted successfully" })
})



router.get('/checkOrderStatus', async (req, res) => {
    try {
        const { orderHash } = req.query;
        if (!orderHash || typeof orderHash !== 'string') {
            return res.status(400).json({
                error: 'Invalid or missing orderHash query parameter'
            });
        }

        const filledOrder = db.data.filledOrders.find(
            (order) => order.orderHash === orderHash
        );

        if (!filledOrder) {
            return res.status(404).json({
                error: 'Order not found or not filled'
            });
        }

        return res.status(200).json({
            status: 'filled',
            filledOrder
        });

    } catch (error) {
        console.error('Error checking order status:', error);
        return res.status(500).json({
            error: 'Internal server error'
        });
    }
})


export default router
