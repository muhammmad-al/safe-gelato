# Safe Gelato Framework

A framework for interacting with Safe Smart Accounts using Gelato's bundler service.

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
ENTRY_POINT_ADDRESS=0x0000000071727De22E5E9d8BAf0edAc6f37da032
CHAIN_ID=11155111
```

3. Run the script:
```bash
pnpm start
```

## Features

- Safe Smart Account creation and management
- UserOperation preparation and gas estimation
- Integration with Gelato's bundler service 