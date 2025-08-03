import type { LimitOrderV4Struct } from "@1inch/cross-chain-sdk";

export interface Point {
  delay: number;
  coefficient: number;
}

export interface GasCost {
  gasBumpEstimate: number;
  gasPriceEstimate: string;
}

export interface Preset {
  auctionDuration: number;
  startAuctionIn: number;
  initialRateBump: number;
  auctionStartAmount: string;
  startAmount: string;
  auctionEndAmount: string;
  exclusiveResolver: null;
  costInDstToken: string;
  points: Point[];
  allowPartialFills: boolean;
  allowMultipleFills: boolean;
  gasCost: GasCost;
  secretsCount: number;
}

export interface TimeLocks {
  srcWithdrawal: number;
  srcPublicWithdrawal: number;
  srcCancellation: number;
  srcPublicCancellation: number;
  dstWithdrawal: number;
  dstPublicWithdrawal: number;
  dstCancellation: number;
}

export interface Prices {
  usd: {
    srcToken: string;
    dstToken: string;
  };
}

export interface Volume {
  usd: {
    srcToken: string;
    dstToken: string;
  };
}

export interface QuoterResponse {
  quoteId: string;
  srcTokenAmount: string;
  dstTokenAmount: string;
  autoK: number;
  presets: {
    fast: Preset;
    medium: Preset;
    slow: Preset;
  };
  timeLocks: TimeLocks;
  srcEscrowFactory: string;
  dstEscrowFactory: string;
  srcSafetyDeposit: number;
  dstSafetyDeposit: number;
  whitelist: string[];
  recommendedPreset: string;
  prices: Prices;
  volume: Volume;
}


export type SerializedOrder = {
  limitOrderV4: LimitOrderV4Struct,
  extension: string,
  orderHash: string
}
