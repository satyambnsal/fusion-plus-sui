'use client'

import '@rainbow-me/rainbowkit/styles.css'
import { ReactNode } from 'react'
import '@mysten/dapp-kit/dist/index.css'
import { darkTheme, getDefaultConfig, RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { WagmiProvider } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { SuiClientProvider, WalletProvider as SuiWalletProvider } from '@mysten/dapp-kit'
import { getFullnodeUrl } from '@mysten/sui/client'
import { PROJECT_ID } from '@/constants'

const config = getDefaultConfig({
  appName: 'Fusion Plus Sui Frontend',
  projectId: PROJECT_ID,
  chains: [sepolia],
  ssr: true,
})

interface ProvidersProps {
  children: ReactNode
}

const networks = {
  testnet: { url: getFullnodeUrl('testnet') },
}

export function WalletProvider({ children }: ProvidersProps) {
  const queryClient = new QueryClient()

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <SuiClientProvider networks={networks} defaultNetwork="testnet">
          <SuiWalletProvider>
            <RainbowKitProvider theme={darkTheme()}>{children}</RainbowKitProvider>
          </SuiWalletProvider>
        </SuiClientProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
