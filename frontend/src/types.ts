import { EIP712TypedData, LimitOrderV4Struct } from "@1inch/cross-chain-sdk"

export interface Token {
  symbol: string
  name: string
  icon: string
  color: string
  balance: string
  address: string
  addressv2: string
  chainId: number
  decimals: number
}

export interface QuoteResponse {
  presets: {
    fast: {
      startAmount: string
    }
  }
}

export interface OrderResponse {
  limitOrderV4: LimitOrderV4Struct
  extension: string
  typedData: EIP712TypedData
  success: boolean
  secretHash: string
}
