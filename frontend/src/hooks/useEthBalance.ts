import { useState, useEffect, useCallback } from 'react';
import { useAccount, useBalance } from 'wagmi';
import { isAddress, zeroAddress } from 'viem';

interface Balance {
  coinAddress: string;
  balance: string;
  symbol: string;
}

interface UseEthBalanceResult {
  balance: Balance | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * A React hook to fetch and manage the Ethereum or ERC-20 token balance for the current connected account.
 * @param coinAddress The Ethereum coin address (zero address for ETH or ERC-20 token contract address).
 * @returns An object containing the balance, loading state, error, and refetch function.
 */
export function useEthBalance(coinAddress: string): UseEthBalanceResult {
  const { address: accountAddress, isConnected } = useAccount();
  const [balance, setBalance] = useState<Balance | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Validate coinAddress: use zeroAddress for ETH, otherwise check if it's a valid ERC-20 address
  const isEth = coinAddress === zeroAddress;
  const isValidAddress = isEth || isAddress(coinAddress);

  // Fetch balance using wagmi's useBalance hook
  const { data: balanceData, isLoading, error: wagmiError, refetch } = useBalance({
    address: accountAddress,
    token: isEth ? undefined : coinAddress,
    enabled: isConnected && isValidAddress,
  });

  const fetchBalance = useCallback(async () => {
    if (!isConnected || !accountAddress) {
      setError('No account connected');
      setBalance(null);
      return;
    }

    if (!isValidAddress) {
      setError('Invalid coin address');
      setBalance(null);
      return;
    }

    setError(null);

    try {
      if (balanceData) {
        setBalance({
          coinAddress,
          balance: balanceData.formatted,
          symbol: balanceData.symbol,
        });
      }
    } catch (err: any) {
      console.error('Error fetching balance:', err.message);
      setError(err.message || 'Failed to fetch balance');
      setBalance({
        coinAddress,
        balance: '0',
        symbol: isEth ? 'ETH' : 'Unknown',
      });
    }
  }, [isConnected, accountAddress, coinAddress, isValidAddress, balanceData]);

  // Update balance when balanceData changes or on initial mount
  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  // Handle wagmi error
  useEffect(() => {
    if (wagmiError) {
      console.error('Wagmi error:', wagmiError.message);
      setError(wagmiError.message || 'Failed to fetch balance');
      setBalance({
        coinAddress,
        balance: '0',
        symbol: isEth ? 'ETH' : 'Unknown',
      });
    }
  }, [wagmiError, coinAddress, isEth]);

  return {
    balance,
    isLoading,
    error,
    refetch,
  };
}
