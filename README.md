# `@liquivault/sdk` ? LiquiVault TypeScript SDK

Institutional-grade TypeScript SDK (ESM & CJS dual exports) for interacting with the **LiquiVault** decentralized invoice factoring and liquidity pool protocol on **Stellar Soroban**.

## Architecture

- **`src/contracts`**: Typed clients for `InvoiceRegistryClient`, `LiquidityPoolClient`, and `FactoringEscrowClient`.
- **`src/builders`**: `LiquiVaultTransactionBuilder` for constructing Soroban contract invocation transactions.
- **`src/wallet`**: `FreighterWalletAdapter` (including SEP-10 challenge signing) and `StellarRpcHelper`.
- **`src/types`**: Strict TypeScript interfaces for `InvoiceRecord`, `PoolState`, `FactoringQuote`, and `RiskTier`.

## Quickstart

```ts
import { LiquiVaultSDK, RiskTier } from '@liquivault/sdk';

const sdk = new LiquiVaultSDK({
  network: {
    network: 'testnet',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  },
  contracts: {
    invoiceRegistry: 'CCINVOICEREGISTRY...',
    liquidityPool: 'CCLIQUIDITYPOOL...',
    factoringEscrow: 'CCFACTORINGESCROW...',
    usdcToken: 'CCUSDCTOKEN...',
  },
});

// 1. Connect Freighter Wallet
const { publicKey } = await sdk.wallet.connect();

// 2. Preview Algorithmic Factoring Quote
const quote = sdk.factoringEscrow.calculateAlgorithmicDiscount(
  1n,
  100_000_0000000n, // 100,000 USDC
  RiskTier.TierA,
  Math.floor(Date.now() / 1000) + 86400 * 60
);
console.log('Net Instant Payout:', quote.netPayout);
```

## Build & Test

```bash
npm install
npm test
npm run build
```
