import { getFullnodeUrl, SuiClient, type SuiTransactionBlockResponse } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { ethers } from 'ethers';
import { type GenericKeyPairType, getKeypair } from './privKey';
import { SUI_CONFIG } from '../config'

const NETWORK = 'testnet';
const RPC_URL = getFullnodeUrl('testnet');


const client = new SuiClient({ url: RPC_URL });


async function executeTransaction(
  client: SuiClient,
  tx: Transaction,
  keypairToUse: GenericKeyPairType,
  description?: string
): Promise<SuiTransactionBlockResponse> {
  try {
    const result = await client.signAndExecuteTransaction({
      signer: keypairToUse,
      transaction: tx,
      options: {
        showEffects: true,
        showObjectChanges: true,
        showEvents: true,
      },
    });

    console.log('✅ Transaction executed!');
    console.log('🔗 Transaction digest:', result.digest);
    console.log('🔗 Explorer:', `https://suiscan.xyz/${NETWORK}/tx/${result.digest}`);

    if (result.effects?.status?.status === 'success') {
      console.log('✅ Transaction successful!');

      // Log events
      // if (result.events && result.events.length > 0) {
      //   result.events.forEach((event, i) => {
      //     console.log(`  Event ${i}:`, JSON.stringify(event, null, 2));
      //   });
      // }

      // Log object changes
      if (result.objectChanges && result.objectChanges.length > 0) {
        // console.log('📦 Object changes:');
        // result.objectChanges.forEach((change, i) => {
        //   console.log(`  Change ${i}:`, JSON.stringify(change, null, 2));
        // });
      }

      return result;
    } else {
      console.log('❌ Transaction failed:', result.effects?.status);
      return result;
    }
  } catch (error: any) {
    console.error('❌ Error executing transaction:', error.message);
  }
}

async function getBalance(address: string) {
  try {
    const balance = await client.getBalance({
      owner: address,
      coinType: SUI_CONFIG.SILVER_COIN_ADDRESS,
    });

    return {
      coinType: balance.coinType,
      totalBalance: balance.totalBalance,
    };
  } catch (error: any) {
    console.error('Error getting balance:', error.message);
    return {
      coinType: SUI_CONFIG.SILVER_COIN_ADDRESS,
      totalBalance: '0',
    };
  }
}


async function announceOrder<T>(
  coinType: string,
  amount: number,
  minDstAmount: number,
  expirationDurationMs: number,
  secretHash: Uint8Array,
  coinObjectId: string,
  keypair: GenericKeyPairType
) {
  const tx = new Transaction();

  // Split coins if needed
  const [coin] = tx.splitCoins(tx.object(coinObjectId), [amount]);

  tx.moveCall({
    target: `${SUI_CONFIG.SWAP_CONTRACT_SUI_PACKAGE_ID}::swap_v3::announce_order`,
    typeArguments: [coinType],
    arguments: [
      tx.object(SUI_CONFIG.SWAP_CONTRACT_SUI_REGISTRY_OBJECT_ID),
      coin,
      tx.pure.u64(minDstAmount),
      tx.pure.u64(expirationDurationMs),
      tx.pure.vector('u8', Array.from(secretHash)),
      tx.object(SUI_CONFIG.CLOCK_OBJECT_ID)
    ],
  });

  const result = await executeTransaction(client, tx, keypair, 'Announcing order');
  if (result) {
    const createdObjects = result.objectChanges?.filter(
      (change) => change.type === 'created' && change.objectType.includes('Order')
    );
    return {
      success: true,
      orderObjectId: createdObjects && createdObjects.length > 0 ? createdObjects[0].objectId : null,
    };
  } else {
    return {
      success: false,
      orderObjectId: null
    };
  }
}

async function fundDstEscrow<T>(
  client: SuiClient,
  keypair: GenericKeyPairType,
  coinType: string,
  amount: number,
  expirationDurationMs: number,
  secretHash: Uint8Array,
  coinObjectId: string,
) {
  const tx = new Transaction();

  // Split coins if needed
  const [coin] = tx.splitCoins(tx.object(coinObjectId), [amount]);
  const args = [
    tx.object(SUI_CONFIG.SWAP_CONTRACT_SUI_REGISTRY_OBJECT_ID), // registry
    coin, // payment
    tx.pure.u64(expirationDurationMs), // expiration_duration_ms
    tx.pure.vector('u8', Array.from(secretHash)), // secret_hash
    tx.object('0x6'), // clock
  ]
  console.log("Coin", coin)
  console.log("Txn args")
  tx.moveCall({
    target: `${SUI_CONFIG.SWAP_CONTRACT_SUI_PACKAGE_ID}::swap_v3::fund_dst_escrow`,
    typeArguments: [coinType],
    arguments: args,
  });

  const result = await executeTransaction(client, tx, keypair, 'Funding destination escrow');
  if (result) {
    const createdObjects = result.objectChanges?.filter(
      (change) => change.type === 'created' && change.objectType.includes('Order')
    );
    return {
      success: true,
      orderObjectId: createdObjects && createdObjects.length > 0 ? createdObjects[0].objectId : null,
    };
  } else {
    return {
      success: false,
      orderObjectId: null
    };
  }
}

// Claim funds - resolver provides secret to claim funds
async function claimFunds<T>(
  client: SuiClient,
  keypair: GenericKeyPairType,
  coinType: string,
  orderObjectId: string,
  secret: Uint8Array,

) {
  const tx = new Transaction();

  tx.moveCall({
    target: `${SUI_CONFIG.SWAP_CONTRACT_SUI_PACKAGE_ID}::swap_v3::claim_funds`,
    typeArguments: [coinType],
    arguments: [
      tx.object(orderObjectId), // order
      tx.pure.vector('u8', Array.from(secret)), // secret
      tx.object(SUI_CONFIG.CLOCK_OBJECT_ID), // clock
    ],
  });

  return await executeTransaction(client, tx, keypair, 'Claiming funds');
}

// Cancel swap - returns funds to maker
async function cancelSwap<T>(
  coinType: string,
  orderObjectId: string,
) {
  const tx = new Transaction();

  tx.moveCall({
    target: `${SUI_CONFIG.SWAP_CONTRACT_SUI_PACKAGE_ID}::swap_v3::cancel_swap`,
    typeArguments: [coinType],
    arguments: [
      tx.object(orderObjectId), // order
      tx.object(SUI_CONFIG.CLOCK_OBJECT_ID), // clock
    ],
  });

  return await executeTransaction(tx, userKeypair, 'Cancelling swap');
}

// Get order details
async function getOrderDetails(orderObjectId: string) {
  try {
    console.log('🔍 Getting order details for:', orderObjectId);

    const object = await client.getObject({
      id: orderObjectId,
      options: {
        showContent: true,
        showType: true,
      },
    });

    if (object.data?.content && 'fields' in object.data.content) {
      console.log('📋 Order details:', JSON.stringify(object.data.content.fields, null, 2));
      return object.data.content.fields;
    } else {
      console.log('❌ Could not get order details');
      return null;
    }
  } catch (error: any) {
    console.error('❌ Error getting order details:', error.message);
    return null;
  }
}

// Get registry details
async function getRegistryDetails() {
  try {
    console.log('🔍 Getting registry details...');

    const object = await client.getObject({
      id: SUI_CONFIG.SWAP_CONTRACT_SUI_REGISTRY_OBJECT_ID,
      options: {
        showContent: true,
        showType: true,
      },
    });

    if (object.data?.content && 'fields' in object.data.content) {
      console.log('📋 Registry details:', JSON.stringify(object.data.content.fields, null, 2));
      return object.data.content.fields;
    } else {
      console.log('❌ Could not get registry details');
      return null;
    }
  } catch (error: any) {
    console.error('❌ Error getting registry details:', error.message);
    return null;
  }
}

// Helper function to find coins of specific type
async function findCoinsOfType(client: SuiClient, coinType: string, address: string) {
  const accountAddress = address;
  const coins = await client.getAllCoins({
    owner: accountAddress,

  });

  return coins.data.filter(coin => coin.coinType === coinType);
}

// // Test complete flow
// async function testCompleteFlow() {
//   console.log('\n🧪 TESTING COMPLETE SWAP FLOW');
//   console.log('='.repeat(60));

//   // Configuration
//   const COIN_TYPE = SILVER_COIN_ADDRESS; // Replace with your token type
//   const SUI_COIN_TYPE = '0x2::sui::SUI';
//   const AMOUNT = 1000000000; // 1 token with 9 decimals
//   const MIN_AMOUNT = 1000000000; // 1 token
//   const EXPIRATION_MS = 3600000; // 1 hour

//   // Generate secret and hash
//   const secret = ethers.toUtf8Bytes('my_secret_password_for_swap_test');
//   const secretHash = new Uint8Array(ethers.getBytes(ethers.keccak256(secret)));

//   console.log('🔐 Secret hash:', ethers.hexlify(secretHash));

//   // Step 1: Get coins for maker
//   console.log('\n🎯 Step 1: Get maker coins');
//   const makerCoins = await findCoinsOfType(COIN_TYPE, userAddress);
//   if (makerCoins.length === 0) {
//     console.log('❌ Maker has no coins of the required type');
//     return;
//   }
//   console.log('✅ Found maker coins:', makerCoins[0].coinObjectId);

//   // Step 2: Get coins for resolver
//   console.log('\n🎯 Step 2: Get resolver coins');
//   const resolverCoins = await findCoinsOfType(SUI_COIN_TYPE, resolverAddress);
//   if (resolverCoins.length === 0) {
//     console.log('❌ Resolver has no coins of the required type');
//     return;
//   }
//   console.log('✅ Found resolver coins:', resolverCoins[0].coinObjectId);

//   // Step 3: Announce order
//   console.log('\n🎯 Step 3: Announce Order');
//   const announceSuccess = await announceOrder(
//     COIN_TYPE,
//     AMOUNT,
//     MIN_AMOUNT,
//     EXPIRATION_MS,
//     secretHash,
//     makerCoins[0].coinObjectId
//   );

//   if (!announceSuccess) {
//     console.log('❌ Failed to announce order');
//     return;
//   }


//   // Note: In a real scenario, you'd need to get the order object ID from the transaction result
//   // For this example, you'd need to parse the object changes to find the created order

//   console.log('\n🎉 Flow setup complete!');
//   console.log('📝 Next steps:');
//   console.log('1. Get the order object ID from the transaction result');
//   console.log('2. Call fundDstEscrow with resolver account');
//   console.log('3. Call claimFunds with the secret');
// }

// Helper to create test tokens (if you have a mint function)
// async function mintTestTokens(address: string, amount: number = 1000000000, keypair: GenericKeyPairType = userKeypair) {
//   const tx = new Transaction();

//   // This assumes you have a mint function in your token module
//   tx.moveCall({
//     target: `${PACKAGE_ID}::my_token::mint`,
//     arguments: [
//       tx.pure.u64(amount),
//       tx.pure.address(address),
//     ],
//   });
//   return await executeTransaction(tx, keypair, 'Minting test tokens');
// }

// Main function for testing individual components
// async function main() {
//   console.log('🚀 Sui Swap Script Starting...');

//   // Uncomment the functions you want to test:

//   // Check balances
//   console.log("user balance", await getBalance(userAddress));
//   console.log("resolver balance", await getBalance(resolverAddress));

//   // fund destination escrow by resolver flow start
//   const secret = ethers.toUtf8Bytes('my_secret_password_for_swap_test');
//   const secretHash = new Uint8Array(ethers.getBytes(ethers.keccak256(secret)));

//   // const resolverCoins = await findCoinsOfType(SILVER_COIN_ADDRESS, resolverAddress);
//   // await fundDstEscrow(SILVER_COIN_ADDRESS, 1 * 1e9, 300000 * 1e3, secretHash, resolverCoins[0].coinObjectId)

//   // console.log("After funding destination escrow")
//   // console.log(await getBalance(resolverAddress));
//   // fund destination escrow flow ends


//   // claim funds flow by user
//   // orderId: 0xa76c527575368c75639fdd5f70ed27be23032400e143b415177bdc7dc61d80b7
//   await claimFunds(SILVER_COIN_ADDRESS, "0xa2dfd27fcf1c64346e864a7c3411e5a1350db2f41645aef7fc4277c7c1ebd763", secret, userKeypair)
//   console.log("user funds after claim", await getBalance(userAddress))


//   // fund destination escrow by resolver flow end

//   // Initialize registry (only needed once)
//   // await initializeSwapRegistry();

//   // Get registry info
//   // await getRegistryDetails();

//   // Mint test tokens
//   // await mintTestTokens();

//   // Test complete flow
//   // await testCompleteFlow();

//   // Manual testing with specific object IDs:
//   // await getOrderDetails('YOUR_ORDER_OBJECT_ID');
//   // await claimFunds('YOUR_COIN_TYPE', 'YOUR_ORDER_OBJECT_ID', secret);
//   // await cancelSwap('YOUR_COIN_TYPE', 'YOUR_ORDER_OBJECT_ID');
// }



// Export functions for use in other modules
export {
  announceOrder,
  fundDstEscrow,
  claimFunds,
  cancelSwap,
  getOrderDetails,
  getRegistryDetails,
  getBalance,
  findCoinsOfType,
  // testCompleteFlow,
  // mintTestTokens,
  executeTransaction,
};

// Run if this file is executed directly
// main().catch(console.error);
