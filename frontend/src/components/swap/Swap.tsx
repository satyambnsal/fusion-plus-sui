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

const truncateAddress = (address: string) => {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

const tokens = [
  {
    symbol: 'ETH',
    name: 'Ethereum',
    icon: '⟠',
    color: 'text-blue-400',
    balance: '2.5431',
    address: '0x0000000000000000000000000000000000000000',
  },
  {
    symbol: 'BTC',
    name: 'Bitcoin',
    icon: '₿',
    color: 'text-orange-400',
    balance: '0.1234',
    address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    icon: '◉',
    color: 'text-blue-500',
    balance: '1,250.00',
    address: '0xA0b86a33E6441b8435b662303c0f218C8c7c8e8e',
  },
  {
    symbol: 'USDT',
    name: 'Tether',
    icon: '₮',
    color: 'text-green-400',
    balance: '890.50',
    address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  },
  {
    symbol: 'SOL',
    name: 'Solana',
    icon: '◎',
    color: 'text-purple-400',
    balance: '45.67',
    address: '0xD31a59c85aE9D8edEFeC411D448f90841571b89c',
  },
  {
    symbol: 'MATIC',
    name: 'Polygon',
    icon: '⬟',
    color: 'text-purple-500',
    balance: '1,890.23',
    address: '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0',
  },
  {
    symbol: 'LINK',
    name: 'Chainlink',
    icon: '⬢',
    color: 'text-blue-600',
    balance: '78.90',
    address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
  },
  {
    symbol: 'UNI',
    name: 'Uniswap',
    icon: '🦄',
    color: 'text-pink-400',
    balance: '156.78',
    address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
  },
]

export default function Component() {
  const [fromToken, setFromToken] = useState('ETH')
  const [toToken, setToToken] = useState('USDC')
  const [fromAmount, setFromAmount] = useState('')
  const [toAmount, setToAmount] = useState('')

  const handleSwapTokens = () => {
    const tempToken = fromToken
    const tempAmount = fromAmount
    setFromToken(toToken)
    setToToken(tempToken)
    setFromAmount(toAmount)
    setToAmount(tempAmount)
  }

  const getTokenData = (symbol: string) => {
    return tokens.find((token) => token.symbol === symbol) || tokens[0]
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
                  <Select
                    value={fromToken}
                    onValueChange={setFromToken}
                  >
                    <SelectTrigger className="w-32 bg-gray-700 border-gray-600 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      {tokens.map((token) => (
                        <SelectItem
                          key={token.symbol}
                          value={token.symbol}
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
                  <Select
                    value={toToken}
                    onValueChange={setToToken}
                  >
                    <SelectTrigger className="w-32 bg-gray-700 border-gray-600 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      {tokens.map((token) => (
                        <SelectItem
                          key={token.symbol}
                          value={token.symbol}
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
                <span className="text-gray-400">Rate</span>
                <span className="text-white">
                  1 {fromToken} = 1,234.56 {toToken}
                </span>
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
              disabled={!fromAmount || !toAmount}
            >
              {!fromAmount || !toAmount ? 'Enter Amount' : 'Swap Tokens'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
