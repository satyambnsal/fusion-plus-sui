# Fusion Plus Sui

Fusion Plus Sui is an extension of the 1inch Fusion Plus protocol, enabling cross-chain swaps between the Ethereum and Sui blockchains and allows token exchanges across these networks using a relayer, resolver, and smart contracts deployed on the Sui testnet.



## Project Overview
Fusion Plus Sui extends the 1inch Fusion Plus protocol to support cross-chain token swaps between Ethereum and Sui. It includes:
- **Sui Smart Contracts**: For token minting and cross-chain swap operations.
- **Backend**: A relayer for order management and resolvers for processing cross-chain swaps.
- **Frontend**: A Next.js-based UI for interacting with the protocol, deployed at [https://fusion-plus-sui.vercel.app/](https://fusion-plus-sui.vercel.app/).

## Folder Structure
fusion-plus-sui/
├── frontend/                    # Next.js frontend code
├── backend/                     # Relayer api endpoints
│   ├── relayers/                # Relayer logic and database configuration
│   ├── resolvers/               # Resolver scripts for Ethereum-Sui and Sui-Ethereum swaps
│   ├── db_data.json             # File-based database for orders
│   └── .env.example             # Example environment variables
├── sui-contracts/               # Sui smart contracts
│   ├── silver/                  # Token contract (SILVER token)
│   ├── swap-contract/           # Swap contract for cross-chain operations
│   └── tests/                   # Test cases for Sui contracts


## Sui Contracts
The project includes two Sui smart contracts deployed on the Sui testnet:

### 1. Token Contract (`sui-contracts/silver`)
- **Purpose**: Manages the SILVER token.
- **Package ID**: `0xe33c8ada01d0c54b83546a768bf35b9af658502b59fa03c20793f832a91098d5`
- **Token Symbol**: SILVER
- **Minting Tokens**: Users can mint SILVER tokens to their wallet using the Sui CLI:
  ```bash
  sui client call --function mint --module silver --package 0xe33c8ada01d0c54b83546a768bf35b9af658502b59fa03c20793f832a91098d5 --args 0x4dfb330cf192396e03f988df495eb567de8f5176c080a9b8472813436ca2829c 100000000000000 <wallet_address>


### 2. Swap Contract (sui-contracts/swap-contract)
**Purpose**: Handles cross-chain swap operations, including fund_dst_escrow, announce_order (fund_src_escrow), and claim_funds.
**Package ID**: 0x542196e996a3504bcfdc8b837d5af40c989c15dc2514357689bc76e619ef9a39
**Registry Object ID**: 0xb0ae81570a901034d3c407dfa3ecb71b6d57b6703534fe0585e8376d044a497e
**Environment Variables**: See backend/.env.example for additional addresses and configuration.
**Tests**: Comprehensive test cases are available in sui-contracts/tests. Run them using:bash

```bash
bun test
```
**Note: Tests require the Bun runtime environment.**

## Backend

The backend is divided into two components: **Relayer** and **Resolvers**.

### Relayer

**Purpose**: Manages orders and exposes REST and WebSocket APIs.
**Endpoints**:
- /quoter/quote/receive: Fetches swap quotes.
- /relayer/createOrder: Creates a new swap order.
- /relayer/submitOrder: Submits an order for processing.
- /relayer/checkOrderStatus: Checks the status of an order.

**Database**: Uses LowDB (file-based) to store orders in `backend/db_data.json`. Configuration is in `backend/relayers/db/index.ts`.

Start Relayer:
```bash
cd backend
bun run relayer:dev
```
This starts a REST API and WebSocket server on port 3004.
**Usage**: See backend/.http for comprehensive endpoint examples.

**Resolvers**

**Purpose**: Process cross-chain swap orders by subscribing to NEW_ORDER events from the relayer.
**Files**:
- backend/resolvers/resolver1.ts: Handles Ethereum-to-Sui swaps.
- backend/resolvers/resolver2.ts: Handles Sui-to-Ethereum swaps.


## Frontend
- **Purpose**: Provides a user interface for interacting with the cross-chain swap protocol.
- **Framework**: Built with Next.js and TypeScript.
- **Main Component**: `frontend/src/components/swap/Swap.tsx`
- **Live Deployment**: [https://fusion-plus-sui.vercel.app/](https://fusion-plus-sui.vercel.app/)

## Setup Instructions
1. **Clone the Repository**:
   ```bash
   git clone <repository-url>
   cd fusion-plus-sui
   ```
2. **Install Dependencies**:For backend and Sui contracts
```
cd backend
bun install
```
```bash
cd sui-contracts
bun install
```
**For frontend**

```bash
cd frontend
bun install
```

3. Copy `backend/.env.example` to `backend/.env` and update with necessary addresses and configurations.




# CLI Commands

1. Mint Silver coin to wallet address
```
sui client call --function mint --module silver --package 0xe33c8ada01d0c54b83546a768bf35b9af658502b59fa03c20793f832a91098d5 --args 0x4dfb330cf192396e03f988df495eb567de8f5176c080a9b8472813436ca2829c 100000000000000 0x45abe1b325d24ee32f0318fd8706b757db4e22f89fa5ba53203e7da0f2d10eb1
```

Mint silverv3
```
```
sui client call --function mint --module permit_token --package 0x3764580c8b26786003f01c0c8f30d826872324d1bce129d7f40e183cbc20d4df --args 0x65b56596ea02f0117d73bbcebf7f71919fb9e884ea8ac6d169456bf6f6a37703 200000000000000 0x10e4f1e870282b3cb1927e2e7e3cf23c60c345c4df4dcd32336ef0f67d0910df
```
```


# Deployed Contracts

# Sui Configuration
SWAP_CONTRACT_SUI_PACKAGE_ID=0x542196e996a3504bcfdc8b837d5af40c989c15dc2514357689bc76e619ef9a39
SWAP_CONTRACT_SUI_REGISTRY_OBJECT_ID=0xb0ae81570a901034d3c407dfa3ecb71b6d57b6703534fe0585e8376d044a497e
SILVER_COIN_ADDRESS="0xe33c8ada01d0c54b83546a768bf35b9af658502b59fa03c20793f832a91098d5::silver::SILVER"


# Open Questions

- [] Deploy Senku Coin



