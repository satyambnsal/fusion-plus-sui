import express, { type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { config } from '../../config';
import type { Preset, QuoterResponse } from '../types';
import { db } from '../db'


const quoteSchema = z.object({
  srcChain: z.number().int().positive(),
  dstChain: z.number().int().positive(),
  srcTokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  dstTokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  amount: z.string().regex(/^\d+$/, 'Amount must be a valid number'),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
});

const getExchangeRate = (srcToken: string, dstToken: string): number => {
  // TODO: Implement more realistic exchange rate logic here
  return 1.5;
};


const calculateQuote = (amount: string, exchangeRate: number): Partial<QuoterResponse> => {
  const srcTokenAmount = amount;
  const dstTokenAmount = (Number(amount) * Number(exchangeRate)).toString();

  return {
    srcTokenAmount,
    dstTokenAmount,
    autoK: 1,
    prices: {
      usd: {
        srcToken: '2577.6314',
        dstToken: '0.9996849753143391',
      },
    },
    volume: {
      usd: {
        srcToken: (parseFloat(srcTokenAmount) / 1e18).toFixed(2),
        dstToken: (parseFloat(dstTokenAmount) / 1e18).toFixed(2),
      },
    },
  };
};


const generatePresets = (dstTokenAmount: string): { fast: Preset; medium: Preset; slow: Preset } => {
  const basePreset = {
    auctionStartAmount: (BigInt(dstTokenAmount) + BigInt(881530)).toString(),
    startAmount: dstTokenAmount,
    auctionEndAmount: (BigInt(dstTokenAmount) - BigInt(1288973)).toString(),
    exclusiveResolver: null,
    costInDstToken: '881530',
    initialRateBump: 84909,
    startAuctionIn: 24,
    allowPartialFills: false,
    allowMultipleFills: false,
    gasCost: {
      gasBumpEstimate: 34485,
      gasPriceEstimate: '1171',
    },
    secretsCount: 1,
  };

  return {
    fast: { ...basePreset, auctionDuration: 180, points: [{ delay: 120, coefficient: 63932 }, { delay: 60, coefficient: 34485 }] },
    medium: { ...basePreset, auctionDuration: 360, points: [{ delay: 360, coefficient: 34485 }] },
    slow: { ...basePreset, auctionDuration: 600, points: [{ delay: 600, coefficient: 34485 }] },
  };
};


const quoteHandler = async (req: Request, res: Response) => {
  try {
    const validationResult = quoteSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ error: validationResult.error.issues });
    }

    const { srcChain, dstChain, srcTokenAddress, dstTokenAddress, amount, walletAddress } = req.body;

    if (!config.allowedChainIds.includes(srcChain) || !config.allowedChainIds.includes(dstChain)) {
      return res.status(400).json({ error: 'Invalid source or destination chain ID' });
    }

    // Calculate quote details
    const exchangeRate = getExchangeRate(srcTokenAddress, dstTokenAddress);
    const quoteDetails = calculateQuote(amount, exchangeRate);

    // Generate response
    const response: QuoterResponse = {
      quoteId: uuidv4(),
      ...quoteDetails,
      presets: generatePresets(quoteDetails.dstTokenAmount!),
      timeLocks: {
        srcWithdrawal: 36,
        srcPublicWithdrawal: 336,
        srcCancellation: 492,
        srcPublicCancellation: 612,
        dstWithdrawal: 180,
        dstPublicWithdrawal: 300,
        dstCancellation: 420,
      },
      srcEscrowFactory: config.srcEscrowFactory,
      dstEscrowFactory: config.dstEscrowFactory,
      srcSafetyDeposit: config.srcSafetyDeposit,
      dstSafetyDeposit: config.dstSafetyDeposit,
      whitelist: config.whitelist,
      recommendedPreset: 'fast',
    };

    // Store quote in LowDB
    db.data.quotes.push(response);
    await db.write();

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error generating quote:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Express router setup
const router = express.Router();
router.post('/quote/receive', quoteHandler);

export default router;
