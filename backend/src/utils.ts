import type { CrossChainOrder } from "@1inch/cross-chain-sdk";
import { Contract } from "ethers";
import { provider } from "./config";
import ERC20 from '../1inch-contracts/IERC20.sol/IERC20.json'
import { resolvers } from './server'

export function serializeOrder(order: CrossChainOrder) {
  const serialized: any = {};

  for (const [key, value] of Object.entries(order)) {
    if (typeof value === 'bigint') {
      serialized[key] = value.toString();
    } else if (value && typeof value === 'object') {
      serialized[key] = serializeOrder(value);
    } else {
      serialized[key] = value;
    }
  }
  return serialized;
}


export const hexToU8Array = (hexStr: string): Uint8Array => {
  const hex = hexStr.startsWith('0x') ? hexStr.slice(2) : hexStr;

  const hexBytes = hex.match(/.{1,2}/g);
  if (!hexBytes) {
    throw new Error("Invalid hex string");
  }

  return new Uint8Array(hexBytes.map(byte => parseInt(byte, 16)));
};


export const getEthereumTokenBalance = async (tokenAddress: string, userAddress: string): Promise<bigint> => {
  const tokenContract = new Contract(tokenAddress, ERC20.abi, provider)
  return tokenContract.balanceOf(userAddress)
}


export function broadcastNewOrder(orderData: any) {
  const message = JSON.stringify({ event: 'newOrder', data: orderData });
  resolvers.forEach((resolver: any) => {
    if (resolver.readyState === 1) { // 1 = OPEN
      resolver.send(message);
    }
  });
}
