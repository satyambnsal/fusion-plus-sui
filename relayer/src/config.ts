import { JsonRpcProvider } from "ethers";
export const provider = new JsonRpcProvider("https://sepolia.infura.io/v3/eefe96c240bc4745a6d895d83d3968b4", 11155111)

export const ethereumConfig = {
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
  "resolverContractAddress": '0x707710DBA922769f0A9b502Ea634D146790ca4a6',
  "escrowFactoryContractAddress": "0xd3e99B1622A45153f087173e904296e7B6e357DF"
};

export const config = {
  allowedChainIds: [8453, 11155111],
  srcEscrowFactory: "0xd3e99B1622A45153f087173e904296e7B6e357DF",
  dstEscrowFactory: "0xdf92792583d16d20b05d720c7f5da65adcdb8f7ef5b084a6295e1d799345b9d1",
  srcSafetyDeposit: 1 * 1e6,
  dstSafetyDeposit: 1 * 1e6,
  whitelist: [
    "0x707710DBA922769f0A9b502Ea634D146790ca4a6"
  ]
}
