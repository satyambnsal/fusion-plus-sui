import { Token } from "../types";
export const PROJECT_ID = process.env.NEXT_PUBLIC_PROJECT_ID || ''
export const SUI_FAUCET_URL = 'https://faucet.sui.io/'

export const SUI_CHAIN_ID = 8453;
export const ETH_CHAIN_ID = 11155111
export const tokens: Token[] = [
  {
    symbol: 'SBL',
    name: 'Sbl token',
    icon: '⟠',
    color: 'text-blue-400',
    balance: '2.5431',
    address: '0x51B6c8FAb037fBf365CF43A02c953F2305e70bb4',
    addressv2: '0x51B6c8FAb037fBf365CF43A02c953F2305e70bb4',
    chainId: 11155111,
    chainName: 'Ethereum',
    decimals: 9,
  },
  {
    symbol: 'SILVER',
    name: 'Silver',
    decimals: 9,
    icon: '₿',
    color: 'text-orange-400',
    balance: '0.1234',
    address: '0x0000000000000000000000000000000000000000',
    addressv2: "0xe33c8ada01d0c54b83546a768bf35b9af658502b59fa03c20793f832a91098d5::silver::SILVER",
    chainId: 8453,
    chainName: 'Sui'
  },
]
