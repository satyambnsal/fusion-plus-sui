'use client'

import { useState, useEffect, useCallback } from 'react'
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
import { requestEthereumSignature, requestSuiSignature, truncateAddress } from '@/lib/utils'
import { Loader2 } from 'lucide-react'
import { useDebounce } from 'use-debounce'
import { Toaster, toast } from 'sonner'
import { OrderResponse, QuoteResponse, Token } from '@/types'
import { ETH_CHAIN_ID, SUI_CHAIN_ID, tokens } from '@/constants'
import { useCurrentAccount } from '@mysten/dapp-kit'
import { useSuiBalance } from '@/hooks/useSuiBalance'
import { useEthBalance } from '@/hooks/useEthBalance'

const getTokenData = (address: string): Token =>
  tokens.find((token) => token.address === address) || tokens[0]

const useQuote = (
  fromToken: string,
  toToken: string,
  fromAmount: string,
  walletAddress: string | undefined
) => {
  const [quote, setQuote] = useState<QuoteResponse | null>(null)
  const [isLoadingQuote, setIsLoadingQuote] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchQuote = useCallback(async () => {
    if (!fromToken || !toToken || !fromAmount || !walletAddress || Number(fromAmount) <= 0) {
      setQuote(null)
      return
    }

    setIsLoadingQuote(true)
    setError(null)

    try {
      const from = getTokenData(fromToken)
      const amount = Number(fromAmount) * 10 ** from.decimals
      const response = await fetch('http://localhost:3004/quoter/quote/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          srcChain: from.chainId,
          dstChain: getTokenData(toToken).chainId,
          srcTokenAddress: from.address,
          dstTokenAddress: getTokenData(toToken).address,
          amount: amount.toString(),
          walletAddress,
        }),
      })

      if (!response.ok) {
        throw new Error(`Quoter API error: ${response.status}`)
      }

      const data = await response.json()
      setQuote(data)
    } catch (err) {
      setError('Failed to fetch quote. Please try again.')
      toast('Failed to fetch quote. Please try again.')
    } finally {
      setIsLoadingQuote(false)
    }
  }, [fromToken, toToken, fromAmount, walletAddress, toast])

  // Debounce the quote fetching to avoid excessive API calls
  const [debouncedFromAmount] = useDebounce(fromAmount, 500)

  useEffect(() => {
    fetchQuote()
  }, [fromToken, toToken, debouncedFromAmount, walletAddress, fetchQuote])

  // Auto-refresh quote every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (fromToken && toToken && fromAmount && walletAddress) {
        fetchQuote()
      }
    }, 30_000)
    return () => clearInterval(interval)
  }, [fromToken, toToken, fromAmount, walletAddress, fetchQuote])

  return { quote, isLoadingQuote, error, fetchQuote }
}

export default function SwapComponent() {
  const [fromToken, setFromToken] = useState(tokens[0].address)
  const [toToken, setToToken] = useState(tokens[1].address)
  const [fromAmount, setFromAmount] = useState('')
  const [toAmount, setToAmount] = useState('')
  const [isSwapping, setIsSwapping] = useState(false)
  const [order, setOrder] = useState<OrderResponse | null>(null)
  const { address, isConnected } = useAccount()
  const suiAccount = useCurrentAccount()
  const { balance: suiTokenBalance } = useSuiBalance(tokens[1].addressv2)
  const [fromTokenBalance, setFromTokenBalance] = useState('00')
  const [toTokenBalance, setToTokenBalance] = useState('')

  const { balance: ethTokenBalance } = useEthBalance(tokens[0].addressv2)

  useEffect(() => {
    const from = getTokenData(fromToken)
    const to = getTokenData(toToken)
    if (from.chainId === ETH_CHAIN_ID) {
      setFromTokenBalance(`${ethTokenBalance?.balance || 0} ${from.symbol}`)
    }
    if (to.chainId === ETH_CHAIN_ID) {
      setToTokenBalance(`${ethTokenBalance?.balance || 0} ${to.symbol}`)
    }
  }, [ethTokenBalance])

  useEffect(() => {
    const from = getTokenData(fromToken)
    const to = getTokenData(toToken)
    if (from.chainId === SUI_CHAIN_ID) {
      const formattedBalance = (
        Number(suiTokenBalance?.totalBalance) / Math.pow(10, from.decimals)
      ).toString()
      setFromTokenBalance(`${formattedBalance} ${from.symbol}`)
    }
    if (to.chainId === SUI_CHAIN_ID) {
      const formattedBalance = (
        Number(suiTokenBalance?.totalBalance) / Math.pow(10, to.decimals)
      ).toString()
      setToTokenBalance(`${formattedBalance} ${to.symbol}`)
    }
  }, [suiTokenBalance])

  const {
    quote,
    isLoadingQuote,
    error: quoteError,
  } = useQuote(fromToken, toToken, fromAmount, address)

  // Update toAmount based on quote
  useEffect(() => {
    if (quote && quote.presets.fast.startAmount) {
      const toTokenData = getTokenData(toToken)
      const toAmountValue = Number(quote.presets.fast.startAmount) / 10 ** toTokenData.decimals
      setToAmount(toAmountValue.toFixed(6))
    } else {
      setToAmount('')
    }
  }, [quote, toToken])

  const handleSwapTokens = () => {
    const tempToken = fromToken
    setFromToken(toToken)
    setToToken(tempToken)
    setFromAmount(toAmount)
    setToAmount('')
    setOrder(null)
  }

  const handleSwap = async () => {
    if (!isConnected || !address) {
      toast('Please connect your Ethereum wallet.')
      return
    }
    if (!suiAccount?.address) {
      toast('Please connect your Sui wallet.')
      return
    }
    if (!quote || !fromAmount || Number(fromAmount) <= 0) {
      toast.error('Invalid input or no quote available.')
      return
    }

    setIsSwapping(true)
    try {
      const from = getTokenData(fromToken)
      const to = getTokenData(toToken)
      const amount = Number(fromAmount) * 10 ** from.decimals
      const takingAmount = quote.presets.fast.startAmount
      const secret = 'my_secret_password_for_swap_test'

      const maker = from.chainId === SUI_CHAIN_ID ? suiAccount?.address : address
      const receiver = from.chainId === SUI_CHAIN_ID ? address : suiAccount?.address

      const orderResponse = await fetch('http://localhost:3004/relayer/createOrder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maker,
          // receiver: '0x16797177f13095C9266c7772C6F1ca66809Bef84' || suiAccount.address,
          receiver,
          makingAmount: amount.toString(),
          takingAmount: takingAmount.toString(),
          makerAsset: from.address,
          takerAsset: to.address,
          srcChainId: from.chainId,
          dstChainId: to.chainId,
          secret,
        }),
      })

      if (!orderResponse.ok) {
        throw new Error(`CreateOrder API error: ${orderResponse.status}`)
      }

      const orderData = await orderResponse.json()
      setOrder(orderData)
      toast.success('Order created successfully. Please sign the order.')
    } catch (error) {
      console.error('Error in handleSwap:', error)
      toast.error('Failed to create swap order. Please try again.')
    } finally {
      setIsSwapping(false)
    }
  }

  const handleSignOrder = async () => {
    if (!order || !address || !suiAccount?.address) return
    setIsSwapping(true)
    try {
      const from = getTokenData(fromToken)
      const signature =
        from.chainId === SUI_CHAIN_ID
          ? await requestSuiSignature(order.typedData, address)
          : await requestEthereumSignature(order.typedData, address)
      const response = await fetch('http://localhost:3004/relayer/fillOrder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature,
          extension: order.extension,
          srcChainId: from.chainId,
          order: order.limitOrderV4,
          secretHash: order.secretHash,
          hashLock: order.hashLock
        }),
      })

      if (!response.ok) {
        throw new Error(`FillOrder API error: ${response.status}`)
      }

      toast.success('Order signed and filled successfully.')
      setOrder(null)
      setFromAmount('')
      setToAmount('')
    } catch (error) {
      console.error('Error in handleSignOrder:', error)
      toast.error('Failed to sign order. Please try again.')
    } finally {
      setIsSwapping(false)
    }
  }

  const isSwapDisabled = !isConnected || !fromAmount || !toAmount || isLoadingQuote || isSwapping
  const isSignOrderDisabled = !order || isSwapping

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="bg-gray-900 border-gray-800 shadow-2xl">
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-gray-400">From</label>
                <span className="text-xs text-gray-500">{fromTokenBalance}</span>
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
                disabled={isSwapping}
              >
                <ArrowUpDown className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-gray-400">To</label>
                <span className="text-xs text-gray-500">{toTokenBalance}</span>
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
                  <div className="flex-1 relative">
                    <Input
                      type="number"
                      placeholder="0.0"
                      value={toAmount}
                      readOnly
                      className="flex-1 bg-transparent border-none text-right text-xl font-semibold text-white placeholder:text-gray-500 focus-visible:ring-0"
                    />
                    {isLoadingQuote && (
                      <Loader2 className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
                    )}
                  </div>
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
                <span className="text-gray-400">Network Fee</span>
                <span className="text-white">~$2.50</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-400">Price Impact</span>
                <span className="text-green-400">{'<0.01%'}</span>
              </div>
            </div>
            {quoteError && <div className="text-red-400 text-sm text-center">{quoteError}</div>}
            <Button
              className="w-full h-14 bg-white text-black hover:bg-white/80 hover:text-black/80 font-semibold text-lg rounded-xl transition-all duration-200"
              onClick={handleSwap}
              disabled={isSwapDisabled}
            >
              {isSwapping ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : !isConnected ? (
                'Connect Wallet'
              ) : !fromAmount ? (
                'Enter Amount'
              ) : (
                'Create Swap Order'
              )}
            </Button>
            {order && (
              <Button
                className="w-full h-14 bg-white text-black hover:bg-white/80 hover:text-black/80 font-semibold text-lg rounded-xl transition-all duration-200"
                onClick={handleSignOrder}
                disabled={isSignOrderDisabled}
              >
                {isSwapping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Sign Order'}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
      <Toaster />
    </div>
  )
}
