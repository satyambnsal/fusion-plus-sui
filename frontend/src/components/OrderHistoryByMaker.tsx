'use client'
import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
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

export default function OrderHistoryByMaker() {
  const { address: ethAddress, isConnected } = useAccount()
  const suiAccount = useCurrentAccount()
  const [orders, setOrders] = useState<OrderStatus[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchOrders = useCallback(async (makerAddress: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(
        `${API_BASE_URL}/relayer/getOrderStatusesByMaker?maker=${makerAddress}`
      )
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
    if (isConnected && ethAddress) {
      fetchOrders(ethAddress)
    } else if (suiAccount?.address) {
      fetchOrders(suiAccount.address)
    }
  }, [ethAddress, suiAccount, fetchOrders, isConnected])

  const handleRefresh = () => {
    if (isConnected && ethAddress) {
      fetchOrders(ethAddress)
    } else if (suiAccount?.address) {
      fetchOrders(suiAccount.address)
    } else {
      toast.error('Please connect a wallet to view order history.')
    }
  }

  return (
    <Card className="bg-gray-900 border-gray-800 shadow-2xl">
      <CardContent className="p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold text-white">All Orders</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
            className="text-white border-gray-600 hover:bg-gray-700"
          >
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Refresh'}
          </Button>
        </div>
        {error && <div className="text-red-400 text-sm text-center">{error}</div>}
        {isLoading && (
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto" />
          </div>
        )}
        {!isLoading && orders.length === 0 && (
          <p className="text-sm">No orders found for this address.</p>
        )}
        {!isLoading && orders.length > 0 && (
          <div className="space-y-2">
            {orders.map((order) => (
              <div
                key={order.orderHash}
                className="flex justify-between items-center  p-3 rounded-lg border border-gray-700"
              >
                <div className="flex flex-col gap-4">
                  <span className="text-sm text-white">
                    Order Hash: {truncateAddress(order.orderHash)}
                  </span>
                  <span className="text-xs text-gray-400">
                    Maker: {truncateAddress(order.maker)}
                  </span>
                  <span className="text-xs text-gray-400">
                    Receiver: {truncateAddress(order.receiver)}
                  </span>
                  <span
                    className={`text-xs ${
                      order.isFilled
                        ? 'text-green-400'
                        : order.isFilling
                        ? 'text-yellow-400'
                        : 'text-gray-400'
                    }`}
                  >
                    Status: {order.isFilled ? 'Filled' : order.isFilling ? 'Filling' : 'Pending'}
                  </span>
                  {order.errorMessage && (
                    <span className="text-xs text-red-400">Error: {order.errorMessage}</span>
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
