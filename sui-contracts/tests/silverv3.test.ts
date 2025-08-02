import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { fromHEX, toHEX } from "@mysten/bcs";
import { sha3_256 } from "js-sha3";
import { GenericKeyPairType, getKeypair } from "./utils/privKey";
import { executeTransaction, findCoinsOfType } from ".";
import { Transaction } from "@mysten/sui/transactions";
import { ethers } from "ethers";
// import { executeTransaction } from './index'

// Test configuration
const NETWORK = "testnet"; // Change to "testnet" or "mainnet" as needed
const PACKAGE_ID = process.env.PERMIT_TOKEN_PACKAGE_ID;
const MODULE_NAME = "permit_token";
const COIN_TYPE = process.env.PERMIT_TOKEN_ADDRESS || ""


const userKeypair: GenericKeyPairType = getKeypair(process.env.USER_PRIVATE_KEY || '');
const userAddress = userKeypair.getPublicKey().toSuiAddress();
const resolverKeypair = getKeypair(process.env.RESOLVER_PRIVATE_KEY || "")
const resolverAddress = resolverKeypair.getPublicKey().toSuiAddress()



interface TestAccounts {
  owner: GenericKeyPairType;
  spender: GenericKeyPairType;
  recipient: GenericKeyPairType;
}

interface ContractObjects {
  treasuryCap: string;
  nonceRegistry: string;
  ownerToken: string;
}

describe("Sui Permit Token Contract Tests", () => {
  let client: SuiClient;
  let accounts: TestAccounts;
  let objects: ContractObjects;

  beforeAll(async () => {
    // Initialize Sui client
    client = new SuiClient({ url: getFullnodeUrl(NETWORK) });

    // Create test accounts
    accounts = {
      owner: userKeypair,
      spender: resolverKeypair,
      recipient: resolverKeypair,
    };

    console.log("Test accounts created:");
    console.log("Owner:", accounts.owner.toSuiAddress());
    console.log("Spender:", accounts.spender.toSuiAddress());
    console.log("Recipient:", accounts.recipient.toSuiAddress());
    objects = {
      treasuryCap: "0x65b56596ea02f0117d73bbcebf7f71919fb9e884ea8ac6d169456bf6f6a37703",
      nonceRegistry: "0x3ccf86f2588b974899524e175f1e9d78898aa9ebebfc9f50c8963eb6bf1fc9cc",
      ownerToken: "", // Will be populated after minting
    };
  });

  beforeEach(async () => {
    // Reset state before each test if needed
  });

  test.skip("should initialize contract and mint tokens", async () => {
    // This would typically be done during deployment
    // For testing, we assume the contract is already deployed and initialized

    const tx = new Transaction();

    // Mint tokens to owner
    tx.moveCall({
      target: `${PACKAGE_ID}::${MODULE_NAME}::mint`,
      arguments: [
        tx.object(objects.treasuryCap),
        tx.pure.u64(1000000), // 1000000 tokens (with 8 decimals = 10 tokens)
        tx.pure.address(accounts.owner.toSuiAddress()),
      ],
    });

    console.log("Token mint successful")

    const result = await executeTransaction(tx, accounts.owner);

    expect(result.effects?.status?.status).toBe("success");
  });

  test("should perform standard transfer", async () => {
    const tx = new Transaction();

    const userCoins = await findCoinsOfType(COIN_TYPE, accounts.owner.getPublicKey().toSuiAddress())
    console.log("User coins", userCoins)

    tx.moveCall({
      target: `${PACKAGE_ID}::${MODULE_NAME}::transfer`,
      arguments: [
        tx.object(userCoins[0].coinObjectId),
        tx.pure.u64(100000), // 1 token
        tx.pure.address(accounts.recipient.toSuiAddress()),
      ],
    });

    const result = await executeTransaction(tx, accounts.owner);

    expect(result.effects?.status?.status).toBe("success");
  });

  test("should create permit hash correctly", async () => {
    const tx = new Transaction();

    const permitData = {
      owner: accounts.owner.toSuiAddress(),
      spender: accounts.spender.toSuiAddress(),
      amount: 500000, // 5 tokens
      nonce: 1,
      deadline: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    };

    tx.moveCall({
      target: `${PACKAGE_ID}::${MODULE_NAME}::get_permit_hash`,
      arguments: [
        tx.pure.address(permitData.owner),
        tx.pure.address(permitData.spender),
        tx.pure.u64(permitData.amount),
        tx.pure.u64(permitData.nonce),
        tx.pure.u64(permitData.deadline),
      ],
    });

    const result = await client.devInspectTransactionBlock({
      sender: accounts.owner.toSuiAddress(),
      transactionBlock: tx,
    });

    expect(result.results?.[0]?.returnValues).toBeDefined();

    // Extract the hash from the result
    const hashBytes = result.results?.[0]?.returnValues?.[0]?.[0];
    expect(hashBytes).toBeDefined();
    console.log("Hash bytes", hashBytes)
    expect(hashBytes.length).toBe(33); // SHA3-256 produces 32 bytes
  });

  test("should verify permit signature creation", async () => {
    const permitData = {
      owner: accounts.owner.toSuiAddress(),
      spender: accounts.spender.toSuiAddress(),
      amount: 500000,
      nonce: 2,
      deadline: Math.floor(Date.now() / 1000) + 3600,
    };

    // Create permit message manually (mimicking the contract logic)
    const message = createPermitMessage(permitData);

    // Sign the message
    const signature = await accounts.owner.signPersonalMessage(message);
    console.log("Signature", signature)

    expect(signature).toBeDefined();
    expect(signature.signature.length).toBeGreaterThan(0);
  });

  test("should execute transfer with valid permit", async () => {
    const permitData = {
      owner: accounts.owner.toSuiAddress(),
      spender: accounts.spender.toSuiAddress(),
      amount: 200000, // 2 tokens
      nonce: 3,
      deadline: Math.floor(Date.now() / 1000) + 3600,
    };

    // Create and sign permit
    const message = createPermitMessage(permitData);
    const signature = await accounts.owner.signPersonalMessage(message);

    const tx = new Transaction();
    const userCoins = await findCoinsOfType(COIN_TYPE, accounts.owner.getPublicKey().toSuiAddress())
    console.log("User coins", userCoins)


    tx.moveCall({
      target: `${PACKAGE_ID}::${MODULE_NAME}::transfer_with_permit`,
      arguments: [
        tx.object(userCoins[0].coinObjectId),
        tx.object(objects.nonceRegistry),
        tx.pure.address(permitData.owner),
        tx.pure.address(permitData.spender),
        tx.pure.u64(permitData.amount),
        tx.pure.u64(permitData.nonce),
        tx.pure.u64(permitData.deadline),
        tx.pure.vector('u8', Array.from(ethers.toUtf8Bytes(signature.signature))),
        tx.pure.vector('u8', Array.from(ethers.toUtf8Bytes(accounts.owner.getPublicKey().toSuiAddress()))),
      ],
    });

    const result = await executeTransaction(tx, accounts.owner);

    expect(result.effects?.status?.status).toBe("success");
  });
});

// Helper function to create permit message (mimicking contract logic)
function createPermitMessage(permit: {
  owner: string;
  spender: string;
  amount: number;
  nonce: number;
  deadline: number;
}): Uint8Array {
  const message: number[] = [];

  // Convert addresses to bytes (32 bytes each)
  const ownerBytes = fromHEX(permit.owner.slice(2)); // Remove 0x prefix
  const spenderBytes = fromHEX(permit.spender.slice(2));

  // Append owner address
  message.push(...Array.from(ownerBytes));

  // Append spender address  
  message.push(...Array.from(spenderBytes));

  // Append amount as 8-byte little-endian
  const amountBytes = new ArrayBuffer(8);
  new DataView(amountBytes).setBigUint64(0, BigInt(permit.amount), true);
  message.push(...Array.from(new Uint8Array(amountBytes)));

  // Append nonce as 8-byte little-endian
  const nonceBytes = new ArrayBuffer(8);
  new DataView(nonceBytes).setBigUint64(0, BigInt(permit.nonce), true);
  message.push(...Array.from(new Uint8Array(nonceBytes)));

  // Append deadline as 8-byte little-endian
  const deadlineBytes = new ArrayBuffer(8);
  new DataView(deadlineBytes).setBigUint64(0, BigInt(permit.deadline), true);
  message.push(...Array.from(new Uint8Array(deadlineBytes)));

  // Hash the message with SHA3-256
  const hash = sha3_256.create();
  hash.update(new Uint8Array(message));
  return new Uint8Array(hash.digest());
}

// Additional utility functions for testing
export class PermitTokenTester {
  constructor(
    private client: SuiClient,
    private packageId: string,
    private moduleName: string = "permit_token"
  ) { }

  async createPermit(
    signer: GenericKeyPairType,
    spender: string,
    amount: number,
    nonce: number,
    deadline?: number
  ) {
    const permitData = {
      owner: signer.toSuiAddress(),
      spender,
      amount,
      nonce,
      deadline: deadline || Math.floor(Date.now() / 1000) + 3600,
    };

    const message = createPermitMessage(permitData);
    const signature = signer.signPersonalMessage(message);

    return {
      permitData,
      signature: Array.from(signature.signature),
      publicKey: Array.from(signer.getPublicKey().toBytes()),
    };
  }

  async getTokenBalance(tokenId: string): Promise<number> {
    const object = await this.client.getObject({
      id: tokenId,
      options: { showContent: true },
    });

    // Parse balance from coin object
    if (object.data?.content && 'fields' in object.data.content) {
      const balance = (object.data.content.fields as any)?.balance;
      return parseInt(balance) || 0;
    }
    return 0;
  }
}
