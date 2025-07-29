import { ContractFactory, JsonRpcProvider, Wallet as SignerWallet } from "ethers"
import factoryContract from '../../../dist/contracts/TestEscrowFactory.sol/TestEscrowFactory.json'
import resolverContract from '../../../dist/contracts/Resolver.sol/Resolver.json'
import { Address } from "@1inch/cross-chain-sdk"
import fs from 'fs'

export const config = {
  chainId: 11155111,
  url: "https://sepolia.infura.io/v3/eefe96c240bc4745a6d895d83d3968b4",
  createFork: false,
  limitOrderProtocol: '0x111111125421ca6dc452d289314280a0f8842a65',
  wrappedNative: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  ownerPrivateKey: '7764b03c4d3eb019cc0ec0630429622593b8d7625b83a109e9f2279828a88a66',
  blockNumber: 8844845,
  tokens: {
    USDC: {
      address: '0x51B6c8FAb037fBf365CF43A02c953F2305e70bb4',
      donor: '0x4B16c5dE96EB2117bBE5fd171E4d203624B014aa'
    }
  },
  resolverPk: 'ec24db4bfe6c9cbba5b3a04e342228323a87c6afca24006d40b5288c178536e3',
  "resolverContractAddress": '0x1eFb4e8E3CbB76D01e47088e05aeD9c4e154c642',
  "escrowFactoryContractAddress": "0x3dce1EDCB64Dd2630E8d41A8A395795c8129aFAe"
};




// Deploy EscrowFactory on Ethereum
async function deployEscrowAndResolver() {
  const provider = await getProvider(config)
  console.log("PROVIDER", provider)
  const deployer = new SignerWallet(config.ownerPrivateKey, provider)
  const ethereumResolverWallet = new SignerWallet(config.resolverPk, provider)

  const escrowFactory = await deploy(
    factoryContract,
    [
      config.limitOrderProtocol,
      config.wrappedNative,
      Address.fromBigInt(0n).toString(), // accessToken
      deployer.address, // owner
      60 * 30, // src rescue delay
      60 * 30  // dst rescue delay
    ],
    provider,
    deployer
  )
  console.log(`[Ethereum] Escrow factory deployed to: ${escrowFactory}`)

  // Deploy Resolver contract on Ethereum
  const resolverInstance = await deploy(
    resolverContract,
    [
      escrowFactory,
      config.limitOrderProtocol,
      // computeAddress(resolverPk)
      ethereumResolverWallet.address
    ],
    provider,
    deployer
  )
  console.log(`[Ethereum] Resolver contract deployed to: ${resolverInstance}`)

  const result = {
    escrowFactory,
    resolver: resolverInstance
  }
  console.log(result)



  fs.writeFileSync('output/contracts.json', JSON.stringify(result, null, 2))

}
async function getProvider(cnf): Promise<JsonRpcProvider> {
  const provider = new JsonRpcProvider(cnf.url, cnf.chainId)
  return provider
}

/**
 * Deploy contract and return its address
 */
async function deploy(
  json: { abi: any; bytecode: any },
  params: unknown[],
  provider: JsonRpcProvider,
  deployer: SignerWallet
): Promise<string> {
  const deployed = await new ContractFactory(json.abi, json.bytecode, deployer).deploy(...params)
  await deployed.waitForDeployment()

  return await deployed.getAddress()
}

/**
 * 
 * deployEscrowAndResolver().catch(err => {
 * 
 * })
 */
