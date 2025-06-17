# Safe Gelato Framework

A framework for interacting with Safe Smart Accounts using Gelato's bundler service. This project provides scripts for gas estimation and transaction sending with Safe Smart Accounts.

## Setup

1. Install dependencies:
```bash
pnpm install
```

2. Create a `.env` file with the following variables:
```env
GELATO_API_KEY=your_gelato_api_key
PRIVATE_KEY=your_private_key
RPC_URL=your_rpc_url
```

## Scripts

### Gas Estimation
To estimate gas for a transaction:
```bash
pnpm tsx src/estimate.ts
```

### Send Transaction
To send a transaction using Safe Smart Account:
```bash
pnpm tsx src/sendTxn.ts
```

## Features

- Safe Smart Account integration
- Gas estimation for UserOperations
- Transaction sending through Gelato's bundler service
- Support for Polygon mainnet (chainId: 137)

## Project Structure

```
├── src/
│   ├── estimate.ts    # Gas estimation script
│   └── sendTxn.ts     # Transaction sending script
├── .env              # Environment variables (not tracked in git)
├── .gitignore       # Git ignore file
└── package.json     # Project dependencies
```

## Dependencies

- `@safe-global/protocol-kit`
- `@safe-global/safe-core-sdk-types`
- `@gelatonetwork/relay-sdk`
- `ethers`
- `dotenv`
- `permissionless`
- `viem` 