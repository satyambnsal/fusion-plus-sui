import express from 'express';
import { utils } from 'web3';
import { ethers } from 'ethers';
import {
    Address,
    AuctionDetails,
    CrossChainOrder,
    Extension
    HashLock,
    TimeLocks,
    TakerTraits,
    randBigInt,
    AmountMode,
    LimitOrderV4Struct
} from '@1inch/cross-chain-sdk';
import { uint8ArrayToHex } from '@1inch/byte-utils';

import { provider } from './config.js';
import { Resolver } from '../lib/resolver.js';
import { serializeOrder } from '../utils.js';
import { ethereumResolverWallet, config as ethereumConfig } from '../scripts/deployEscrowFactory.js';
import { Wallet } from '../lib/wallet.js';


const router = express.Router();

// const { Address } = Sdk

/** 
{
srcChainId: 11155111,
dstChainId: 8453,
srcTokenAddress: 0x51B6c8FAb037fBf365CF43A02c953F2305e70bb4,
dstTokenAddress: 0x6a33e62028e210d895c22c631c17c856cf774c887785357672636db8530e6226::mytoken,
amount: 1000
}
 * 
*/
// Replace dstTokenAddress with coin object id for sui

const ETHEREUM_ESCROW_FACTORY_ADDRESS = "0xDf6Cfc0656C1D60719Df66Adc2bD50b1b9485A0E"

router.get('/getQuote', (req, res) => {
    const {
        srcChainId,
        dstChainId,
        srcTokenAddress,
        dstTokenAddress,
        amount
    } = req.query;

    if (!srcChainId || !dstChainId || !srcTokenAddress || !dstTokenAddress || !amount) {
        return res.status(400).json({
            error: 'Missing required parameters',
            required: ['srcChainId', 'dstChainId', 'srcTokenAddress', 'dstTokenAddress', 'amount']
        });
    }

    const inputAmount = BigInt(amount);
    const EXCHANGE_RATE = 2; // HARDCODED 
    const outputAmount = (inputAmount * BigInt(Math.floor(EXCHANGE_RATE * 1000))) / BigInt(1000);

    const mockQuote = {
        srcChainId: srcChainId,
        dstChainId: dstChainId,
        srcTokenAddress,
        dstTokenAddress,
        srcAmount: amount,
        dstAmount: outputAmount.toString(),
        exchangeRate: EXCHANGE_RATE,
        estimatedGas: '21000',
        gasPrice: '0',
        fees: {
            protocolFee: '0',
            gasFee: '0'
        },
        route: [
            {
                from: srcTokenAddress,
                to: dstTokenAddress,
                exchange: 'AptosCrossChain'
            }
        ],
        timestamp: new Date().toISOString(),
        validUntil: new Date(Date.now() + 30000).toISOString()
    };

    res.json(mockQuote);
});


// Initialize Web3 with HttpProvider
// const web3 = new Web3(new Web3.providers.HttpProvider('https://sepolia.infura.io/v3/eefe96c240bc4745a6d895d83d3968b4'));

// Configuration for Ethereum and Aptos chains
const config = {
    chain: {
        ethereum: {
            tokens: {
                USDC: { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' }
            },
            escrowFactory: '0x1111111254EEB25477B68fb85Ed929f73A960582', // Example 1inch escrow factory
            resolver: '0x51B6c8FAb037fBf365CF43A02c953F2305e70bb4' // Replace with actual resolver address
        },
        aptos: {
            tokens: {
                SimpleToken: '0x55625547c27ed94dde4184151d8a688d39615ace5d389b7fa4f0dbf887819b7c::my_token::SimpleToken'
            }
        }
    }
};

// Default values managed by the relayer
const DEFAULT_TIMELOCKS = {
    srcWithdrawal: 10n,           // 10sec finality lock
    srcPublicWithdrawal: 120n,    // 2min private withdrawal
    srcCancellation: 121n,        // 1sec public withdrawal
    srcPublicCancellation: 122n,  // 1sec private cancellation
    dstWithdrawal: 10n,           // 10sec finality lock
    dstPublicWithdrawal: 100n,    // 100sec private withdrawal
    dstCancellation: 101n         // 1sec public withdrawal
};
const DEFAULT_SAFETY_DEPOSIT = ethers.parseEther('0.001').toString();
const DEFAULT_AUCTION_DURATION = 120n; // 2 minutes
const DEFAULT_WHITELIST = [
    {
        address: new Address(config.chain.ethereum.resolver),
        allowFrom: 0n
    }
];
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
            new Address(ETHEREUM_ESCROW_FACTORY_ADDRESS),
            {
                salt: randBigInt(1000n),
                maker: new Address(maker),
                makingAmount, // 1 USDC
                takingAmount, // Equivalent amount on Aptos
                makerAsset: new Address(makerAsset),
                // Note: Using placeholder address because 1inch SDK doesn't support Aptos address format
                // Actual Aptos token: 0x55625547c27ed94dde4184151d8a688d39615ace5d389b7fa4f0dbf887819b7c::my_token::SimpleToken
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
                srcChainId,
                dstChainId, // Using COINBASE as placeholder since SDK doesn't support APTOS yet
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
                        address: new Address(ETHEREUM_ESCROW_FACTORY_ADDRESS),
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
        const orderHash = order.getOrderHash(srcChainId)

        // console.log("====== typed data=======", typedData)
        // return this.signer.signTypedData(
        //     typedData.domain,
        //     { Order: typedData.types[typedData.primaryType] },
        //     typedData.message
        // )
        res.json({ success: true, order: serializeOrder(order), typedData, orderHash })
    } catch (e: any) {
        return res.status(400).json({ error: 'Failed to create order', details: e.message });
    }

});



router.post('/fillOrder', async (req, res) => {
    const { order, signature, orderHash, srcChainId } = req.body
    const ethereumResolverWallet = new Wallet(ethereumConfig.resolverPk, provider);

    // const orderObj = JSON.parse(order)


    const resolverContract = new Resolver(ethereumConfig.resolverContractAddress, "APTOS_RESOLVER_ADDRESS")

    console.log(`[Ethereum] Filling order ${orderHash}`)

    const fillAmount = order.inner.inner.makingAmount


    const txnParam = resolverContract.deploySrc(
        srcChainId,
        order,
        signature,
        TakerTraits.default()
            .setExtension(order.extension)
            .setAmountMode(AmountMode.maker)
            .setAmountThreshold(order.takingAmount),
        fillAmount
    )

    console.log("txn params", txnParam)

    const { txHash: orderFillHash, blockHash: ethereumDeployBlock } = await ethereumResolverWallet.send(txnParam)


    console.log(`[Ethereum] Order ${orderHash} filled for ${fillAmount} USDC in tx: ${orderFillHash}`)

    // const balance = await getEthereumBalances(config.chain.ethereum.tokens.USDC.address);
    // console.log("######### Balance after eth order filled ##########")
    // console.log(balance);
    // console.log("#########  ##########")


    // const ethereumEscrowEvent = await ethereumFactory.getSrcDeployEvent(ethereumDeployBlock)


})


export default router
