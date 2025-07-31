import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { EIP712TypedData } from '@1inch/cross-chain-sdk'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const requestEthereumSignature = async (typedData: EIP712TypedData, userAddress: string) => {
  const signature = await window.ethereum.request({
    method: 'eth_signTypedData_v4',
    params: [
      userAddress,
      JSON.stringify({
        domain: typedData.domain,
        types: {
          EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'version', type: 'string' },
            { name: 'chainId', type: 'uint256' },
            { name: 'verifyingContract', type: 'address' },
          ],
          ...typedData.types,
        },
        primaryType: typedData.primaryType,
        message: typedData.message,
      }),
    ],
  })
  return signature
}




export const truncateAddress = (address: string, startLength: number = 6, endLength: number = 4): string => {
  if (!address || address.length < startLength + endLength) {
    return address;
  }
  return `${address.slice(0, startLength)}...${address.slice(-endLength)}`;
};
