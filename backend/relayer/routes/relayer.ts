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
    AmountMode,
    EscrowFactory as InchEscrowFactory,
    DstImmutablesComplement
} from '@1inch/cross-chain-sdk';
import { uint8ArrayToHex } from '@1inch/byte-utils';
import { provider, ethereumConfig, SUI_CONFIG, suiClient, ETH_CHAIN_ID, SUI_CHAIN_ID, config, CHAIN_MAPPINGS } from '../config.js';
import { Resolver as EthereumResolverContract } from '../lib/resolver.js';
import { Wallet } from '../lib/wallet.js';
import { db } from '../db/index.js'
import { fundSrcEscrow, claimFunds, findCoinsOfType, fundDstEscrow, getBalance } from '../lib/sui-handlers.js';
import { sleep } from 'bun';
import { EscrowFactory } from '../lib/EscrowFactory.js';
import { broadcastNewOrder, getEthereumTokenBalance } from '../utils.js';


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

    broadcastNewOrder({ order, signature, srcChainId, extension, secretHash })
    const orderInstance = CrossChainOrder.fromDataAndExtension(order, Extension.decode(extension))
    const orderHash = orderInstance.getOrderHash(srcChainId)
    const hashLock = HashLock.fromString(secretHash)
    const fillAmount = orderInstance.makingAmount
    const takingAmount = orderInstance.takingAmount

    const ethereumResolverWallet = new Wallet(ethereumConfig.resolverPk, provider);
    const resolverContract = new EthereumResolverContract(ethereumConfig.resolverContractAddress, SUI_CONFIG.RESOLVER_PROXY_ADDRESS)
    const ethereumFactory = new EscrowFactory(provider, ethereumConfig.escrowFactoryContractAddress);


    console.log({ srcChainId, ETH_CHAIN_ID })


    if (srcChainId === ETH_CHAIN_ID) {
        const proxyEthAddress = orderInstance.receiver.toString();
        const receiverAddressSui = await db.data.addressMappings.find(m => m.ethProxyAddress.toLowerCase() === proxyEthAddress.toLowerCase())?.suiAddress;
        if (!receiverAddressSui) {
            console.error(`❌ No Sui address mapped to proxy Ethereum address ${proxyEthAddress}`);
            return res.status(400).json({ error: 'No Sui address mapped to proxy Ethereum address' });
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
        console.log('✅ Found resolver coins:', resolverCoins[0].coinObjectId);
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

        res.json({ succeess: true })
    }

    if (srcChainId === SUI_CHAIN_ID) {
        const proxyEthAddress = orderInstance.maker.toString();
        const makerAddressSui = await db.data.addressMappings.find(m => m.ethProxyAddress.toLowerCase() === proxyEthAddress.toLowerCase())?.suiAddress;

        if (!makerAddressSui) {
            console.error(`❌ No Sui address mapped to proxy Ethereum address ${proxyEthAddress} for chain id ${srcChainId}`);
            return res.status(400).json({ error: 'No Sui address mapped to proxy Ethereum address' });
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
        const { orderObjectId: srcEscrowOrderObjectId } = await fundSrcEscrow(SUI_CONFIG.SILVER_COIN_ADDRESS,
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
        const takingAmount = orderInstance.takingAmount
        const immutables = orderInstance.toSrcImmutables(srcChainId, taker, takingAmount, hashLock);

        console.log("Deployed at", immutables.timeLocks.deployedAt)
        const { txHash: orderFillHash, blockHash: ethereumDeployBlock } = await ethereumResolverWallet.send(
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

        // here we fetch makers eth address and check balance

        let takerBalance = await getEthereumTokenBalance(ethereumConfig.tokens.USDC.address, taker.toString())
        console.log(`Taker ${taker.toString()} balance before withdraw ${takerBalance}`)

        const { txHash: resolverWithdrawHash } = await ethereumResolverWallet.send(
            resolverContract.withdraw('dst', dstEscrowAddress, hexSecret, immutables)
        )

        await sleep(3000)
        takerBalance = await getEthereumTokenBalance(ethereumConfig.tokens.USDC.address, taker.toString())
        console.log(`Taker ${taker.toString()} balance after withdraw ${takerBalance}`)



        console.log("resolver withdraw")
        let resolverBalanceSui = await getBalance(SUI_CONFIG.SILVER_COIN_ADDRESS, SUI_CONFIG.RESOLVER_ADDRESS)
        console.log(`resolver total balance before claiming funss ${resolverBalanceSui.totalBalance}`)
        const claimFundResp = await claimFunds(suiClient, SUI_CONFIG.RESOLVER_KEYPAIR, SUI_CONFIG.SILVER_COIN_ADDRESS, srcEscrowOrderObjectId, originalSecret)
        // console.log({ orderFillHash, ethereumDeployBlock })
        await sleep(2000)
        resolverBalanceSui = await getBalance(SUI_CONFIG.SILVER_COIN_ADDRESS, SUI_CONFIG.RESOLVER_ADDRESS)
        console.log(`resolver total balance after claiming funss ${resolverBalanceSui.totalBalance}`)
        // resolver will claim fund for user on ethereum chain
        // resolver will claim fund on sui for himself
        res.json({ success: true })
    }
    res.json({ succeess: false, message: "Wrong chain id" })
})


export default router
