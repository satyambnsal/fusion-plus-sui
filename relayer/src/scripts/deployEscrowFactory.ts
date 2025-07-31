import { ContractFactory, JsonRpcProvider, Wallet as SignerWallet } from "ethers"
import factoryContract from '../../1inch-contracts/TestEscrowFactory.sol/TestEscrowFactory.json'
import resolverContract from '../../1inch-contracts/Resolver.sol/Resolver.json'
import { Address } from "@1inch/cross-chain-sdk"
import fs from 'fs'
import { ethereumConfig as config } from '../config'




// Deploy EscrowFactory on Ethereum
async function deployEscrowAndResolver() {
  const provider = await getProvider()
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
async function getProvider() {
  const provider = new JsonRpcProvider(config.url, config.chainId)
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




deployEscrowAndResolver().catch(err => {

})

