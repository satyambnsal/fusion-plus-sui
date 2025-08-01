import { useState, useEffect, useCallback } from 'react';
import { useSuiClient, useCurrentAccount } from '@mysten/dapp-kit';

interface Balance {
  coinType: string;
  totalBalance: string;
}

interface UseSuiBalanceResult {
  balance: Balance | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}


export function useSuiBalance(coinAddress: string): UseSuiBalanceResult {
  const suiClient = useSuiClient();
  const currentAccount = useCurrentAccount();
  const [balance, setBalance] = useState<Balance | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!currentAccount?.address) {
      setError('No account connected');
      setBalance(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const balanceData = await suiClient.getBalance({
        owner: currentAccount.address,
        coinType: coinAddress,
      });

      setBalance({
        coinType: balanceData.coinType,
        totalBalance: balanceData.totalBalance.toString(),
      });
    } catch (err: any) {
      console.error('Error fetching balance:', err.message);
      setError(err.message || 'Failed to fetch balance');
      setBalance({
        coinType: coinAddress,
        totalBalance: '0',
      });
    } finally {
      setIsLoading(false);
    }
  }, [suiClient, currentAccount?.address, coinAddress]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  return {
    balance,
    isLoading,
    error,
    refetch: fetchBalance,
  };
}
