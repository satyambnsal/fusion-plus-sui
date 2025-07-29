import type { CrossChainOrder } from "@1inch/cross-chain-sdk";

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
