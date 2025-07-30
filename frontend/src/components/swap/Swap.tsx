'use client'

import { useState } from 'react'
import { ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAccount } from 'wagmi'
import { HashLock, PresetEnum } from '@1inch/cross-chain-sdk'
import { randomBytes } from 'ethers'
import { uint8ArrayToHex } from '@1inch/byte-utils'

const truncateAddress = (address: string) => {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

const tokens = [
  {
    symbol: 'SBL',
    name: 'Sbl token',
    icon: '⟠',
    color: 'text-blue-400',
    balance: '2.5431',
    address: '0x51B6c8FAb037fBf365CF43A02c953F2305e70bb4',
    chainId: 11155111,
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
    chainId: 8453,
  },
]

const getTokenData = (address: string) => {
  return tokens.find((token) => token.address === address) || tokens[0]
}

export default function Component() {
  const [fromToken, setFromToken] = useState(tokens[0].address)
  const [toToken, setToToken] = useState(tokens[1].address)
  const [fromAmount, setFromAmount] = useState('')
  const [toAmount, setToAmount] = useState('')
  const { address, isConnected } = useAccount()

  const handleSwapTokens = () => {
    const tempToken = fromToken
    const tempAmount = fromAmount
    setFromToken(toToken)
    setToToken(tempToken)
    setFromAmount(toAmount)
    setToAmount(tempAmount)
  }

  const handleSwap = async () => {
    console.log('Address', address)
    const from = getTokenData(fromToken)
    const to = getTokenData(toToken)
    const amount = Number(fromAmount) * 10 ** from.decimals
    console.log({ from, to, fromAmount })

    try {
      // Step 1: Call the quoter API
      const response = await fetch('http://localhost:3004/quoter/quote/receive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          srcChain: from.chainId,
          dstChain: to.chainId,
          srcTokenAddress: from.address,
          dstTokenAddress: to.address,
          amount: amount.toString(),
          walletAddress: address,
        }),
      })

      if (!response.ok) {
        throw new Error(`Quoter API error! status: ${response.status}`)
      }

      const data = await response.json()
      console.log('Swap Response:', data)

      const preset = PresetEnum.fast
      const takingAmount = data.presets[preset].startAmount
      const secret = 'my_secret_password_for_swap_test'

      const orderResponse = await fetch('http://localhost:3004/relayer/createOrder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          maker: address, // User's wallet address
          makingAmount: amount.toString(), // Amount from the input
          takingAmount: takingAmount.toString(), // From swap response
          makerAsset: from.address, // Source token address
          takerAsset: to.address, // Destination token address
          srcChainId: from.chainId, // Source chain ID
          dstChainId: to.chainId, // Destination chain ID
          secret, // 32-byte hex-encoded secret
        }),
      })

      if (!orderResponse.ok) {
        throw new Error(`CreateOrder API error! status: ${orderResponse.status}`)
      }

      const orderData = await orderResponse.json()
      console.log('CreateOrder Response:', orderData)

      return { quote: data, order: orderData } // Return both responses for further handling
    } catch (error) {
      console.error('Error in handleSwap:', error)
      throw error // Rethrow for upstream handling
    }
  }
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="bg-gray-900 border-gray-800 shadow-2xl">
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-gray-400">From</label>
                <span className="text-xs text-gray-500">
                  Balance: {getTokenData(fromToken).balance}
                </span>
              </div>
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <div className="flex items-center gap-3">
                  <Select value={fromToken} onValueChange={setFromToken}>
                    <SelectTrigger className="w-32 bg-gray-700 border-gray-600 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      {tokens.map((token) => (
                        <SelectItem
                          key={token.symbol}
                          value={token.address}
                          className="text-white hover:bg-gray-700"
                        >
                          <div className="flex items-center gap-2">
                            <span className={`text-lg ${token.color}`}>{token.icon}</span>
                            <span>{token.symbol}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    placeholder="0.0"
                    value={fromAmount}
                    onChange={(e) => setFromAmount(e.target.value)}
                    className="flex-1 bg-transparent border-none text-right text-xl font-semibold text-white placeholder:text-gray-500 focus-visible:ring-0"
                  />
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-xs text-gray-500">{getTokenData(fromToken).name}</span>
                  <span className="text-xs text-gray-500">≈ $0.00</span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs text-gray-400">
                    Address: {truncateAddress(getTokenData(fromToken).address)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-center">
              <Button
                onClick={handleSwapTokens}
                variant="ghost"
                size="icon"
                className="w-10 h-10 rounded-full bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
              >
                <ArrowUpDown className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-gray-400">To</label>
                <span className="text-xs text-gray-500">
                  Balance: {getTokenData(toToken).balance}
                </span>
              </div>
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <div className="flex items-center gap-3">
                  <Select value={toToken} onValueChange={setToToken}>
                    <SelectTrigger className="w-32 bg-gray-700 border-gray-600 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      {tokens.map((token) => (
                        <SelectItem
                          key={token.symbol}
                          value={token.address}
                          className="text-white hover:bg-gray-700"
                        >
                          <div className="flex items-center gap-2">
                            <span className={`text-lg ${token.color}`}>{token.icon}</span>
                            <span>{token.symbol}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    placeholder="0.0"
                    value={toAmount}
                    onChange={(e) => setToAmount(e.target.value)}
                    className="flex-1 bg-transparent border-none text-right text-xl font-semibold text-white placeholder:text-gray-500 focus-visible:ring-0"
                  />
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-xs text-gray-500">{getTokenData(toToken).name}</span>
                  <span className="text-xs text-gray-500">≈ $0.00</span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs text-gray-400">
                    Address: {truncateAddress(getTokenData(toToken).address)}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 space-y-2">
              <div className="flex justify-between items-center text-sm">
                {/* <span className="text-gray-400">Rate</span>
                <span className="text-white">
                  1 {fromToken} = 1,234.56 {toToken}
                </span> */}
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-400">Network Fee</span>
                <span className="text-white">~$2.50</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-400">Price Impact</span>
                <span className="text-green-400">{'<0.01%'}</span>
              </div>
            </div>

            <Button
              className="w-full h-14 bg-white text-black hover:bg-white/80 hover:text-black/80 font-semibold text-lg rounded-xl transition-all duration-200"
              onClick={handleSwap}
            >
              {!fromAmount || !toAmount ? 'Enter Amount' : 'Swap Tokens'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
