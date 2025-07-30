'use client'

import clsx from 'clsx'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowDownUpIcon } from 'lucide-react'
import { ConnectButton as RainbowConnectButton } from '@rainbow-me/rainbowkit'
import { SuiWalletDropdown } from './SuiWalletDropdown'

export const Header = () => {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 0)
    }

    window.addEventListener('scroll', handleScroll)

    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <header
      className={clsx('fixed left-0 right-0 top-0 w-full z-50 transition-all duration-200', {
        'bg-[#12121266] backdrop-blur-xl': scrolled,
        'bg-transparent': !scrolled,
      })}
    >
      <div className="max-w-full mx-auto flex items-center p-[11px] xl:p-4 justify-between">
        <div className="flex items-center">
          <Link
            className="block mr-1 xl:mr-4 flex-shrink-0"
            href="/"
          >
            <div className="relative w-8 h-11">
              <ArrowDownUpIcon />
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <SuiWalletDropdown />
          <RainbowConnectButton label="Connect ETH Wallet" />
        </div>
      </div>
    </header>
  )
}
