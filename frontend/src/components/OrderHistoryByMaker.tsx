'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, ExternalLink } from 'lucide-react' // Added ExternalLink icon
import { toast, Toaster } from 'sonner'
import { truncateAddress } from '@/lib/utils'
import { API_BASE_URL } from '@/constants'
import { useAccount } from 'wagmi'
import { useCurrentAccount } from '@mysten/dapp-kit'

interface OrderStatus {
  orderHash: string
  maker: string
  receiver: string
  isFilling: boolean
  isFilled: boolean
  srcClaimTxHash: string
  dstClaimTxHash: string
  srcEscrowDeployTxHash: string
  dstEscrowDeployTxHash: string
  errorMessage?: string
  srcChainId: number
}

interface OrderHistoryResponse {
  status: string
  orders: OrderStatus[]
}

// Extract transaction hash from full explorer URL for display
const extractTxHash = (url: string): string => {
  if (!url) return ''
  // Extract the hash from URLs like https://etherscan.io/tx/0x123... or https://suiscan.xyz/mainnet/tx/0x123...
  const match = url.match(/\/tx\/(0x[0-9a-fA-F]+)/) || url.match(/\/tx\/([0-9a-zA-Z]+)/)
  return match ? truncateAddress(match[1]) : truncateAddress(url)
}

export default function OrderHistoryByMaker() {
  const { address: ethAddress, isConnected } = useAccount()
  const suiAccount = useCurrentAccount()
  const [orders, setOrders] = useState<OrderStatus[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchOrders = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_BASE_URL}/relayer/getOrderStatuses`)
      if (!response.ok) {
        throw new Error(`Failed to fetch orders: ${response.status}`)
      }
      const data: OrderHistoryResponse = await response.json()
      if (data.status === 'success') {
        setOrders(data.orders)
      } else {
        throw new Error('Failed to fetch orders')
      }
    } catch (err: any) {
      setError('Failed to fetch order history. Please try again.')
      toast.error('Failed to fetch order history.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrders()
  }, [ethAddress, suiAccount, fetchOrders, isConnected])

  const handleRefresh = () => {
    fetchOrders()
  }

  return (
    <Card className="bg-gradient-to-b from-gray-900 to-gray-800 border-gray-700 shadow-lg rounded-xl">
      <CardContent className="p-8 space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-semibold text-white">All Orders</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
            className="text-white border-gray-600 hover:bg-gray-700 hover:text-white"
          >
            {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : 'Refresh'}
          </Button>
        </div>
        {error && <div className="text-red-400 text-base text-center">{error}</div>}
        {isLoading && (
          <div className="text-center">
            <Loader2 className="h-10 w-10 animate-spin text-gray-400 mx-auto" />
          </div>
        )}
        {!isLoading && orders.length === 0 && (
          <p className="text-base text-gray-400 text-center">No orders found for this address.</p>
        )}
        {!isLoading && orders.length > 0 && (
          <div className="space-y-4 max-h-[400px]">
            {orders.map((order) => (
              <div
                key={order.orderHash}
                className="flex flex-col gap-3 p-4 rounded-xl border border-gray-700 hover:bg-gray-800 transition-colors"
              >
                <div className="flex flex-col gap-2">
                  <span className="text-base font-medium text-white">
                    Order Hash: {truncateAddress(order.orderHash)}
                  </span>
                  <span className="text-sm text-gray-300">
                    Maker: {truncateAddress(order.maker)}
                  </span>
                  <span className="text-sm text-gray-300">
                    Receiver: {truncateAddress(order.receiver)}
                  </span>
                  <span
                    className={`text-sm font-medium ${
                      order.isFilled
                        ? 'text-green-400'
                        : order.isFilling
                        ? 'text-yellow-400'
                        : 'text-gray-300'
                    }`}
                  >
                    Status: {order.isFilled ? 'Filled' : order.isFilling ? 'Filling' : 'Pending'}
                  </span>
                  {order.srcClaimTxHash && (
                    <span className="text-sm text-gray-300">
                      Source Claim Tx:{' '}
                      <Link
                        href={order.srcClaimTxHash}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
                        aria-label={`View Source Claim Transaction ${extractTxHash(
                          order.srcClaimTxHash
                        )} on block explorer`}
                      >
                        {extractTxHash(order.srcClaimTxHash)}
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </span>
                  )}
                  {order.dstClaimTxHash && (
                    <span className="text-sm text-gray-300">
                      Destination Claim Tx:{' '}
                      <Link
                        href={order.dstClaimTxHash}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
                        aria-label={`View Destination Claim Transaction ${extractTxHash(
                          order.dstClaimTxHash
                        )} on block explorer`}
                      >
                        {extractTxHash(order.dstClaimTxHash)}
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </span>
                  )}
                  {order.srcEscrowDeployTxHash && (
                    <span className="text-sm text-gray-300">
                      Source Escrow Deploy Tx:{' '}
                      <Link
                        href={order.srcEscrowDeployTxHash}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
                        aria-label={`View Source Escrow Deploy Transaction ${extractTxHash(
                          order.srcEscrowDeployTxHash
                        )} on block explorer`}
                      >
                        {extractTxHash(order.srcEscrowDeployTxHash)}
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </span>
                  )}
                  {order.dstEscrowDeployTxHash && (
                    <span className="text-sm text-gray-300">
                      Destination Escrow Deploy Tx:{' '}
                      <Link
                        href={order.dstEscrowDeployTxHash}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
                        aria-label={`View Destination Escrow Deploy Transaction ${extractTxHash(
                          order.dstEscrowDeployTxHash
                        )} on block explorer`}
                      >
                        {extractTxHash(order.dstEscrowDeployTxHash)}
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </span>
                  )}
                  {order.errorMessage && (
                    <span className="text-sm text-red-400">Error: {order.errorMessage}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <Toaster />
    </Card>
  )
}
