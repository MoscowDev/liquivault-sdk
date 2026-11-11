# `@liquivault/sdk` — LiquiVault TypeScript SDK

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](../LICENSE)
[![Stellar Protocol](https://img.shields.io/badge/Stellar_Protocol-21%20%7C%2022-brightgreen.svg)](https://stellar.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)](https://www.typescriptlang.org)
[![Build](https://img.shields.io/badge/Build-ESM%20%2B%20CJS-green.svg)](./package.json)
[![Test Suite](https://img.shields.io/badge/Tests-11%2F11%20Passed-success.svg)](../docs/EVIDENCE.md)

TypeScript SDK (dual ESM and CJS distributions) for interacting with the **LiquiVault** decentralized invoice factoring and liquidity pool protocol on **Stellar Soroban**.

---

## 1. Architecture & Package Modules

```text
src/
├── index.ts              # Unified LiquiVaultSDK entrypoint
├── contracts/            # High-level typed contract wrappers
│   ├── InvoiceRegistryClient.ts
│   ├── LiquidityPoolClient.ts
│   └── FactoringEscrowClient.ts
├── builders/             # Low-level Soroban transaction envelope builders
│   └── LiquiVaultTransactionBuilder.ts
├── wallet/               # Freighter wallet connection and SEP-10 authentication
│   ├── FreighterWalletAdapter.ts
│   └── StellarRpcHelper.ts
└── types/                # Canonical TypeScript interfaces & ScVal converters
    └── index.ts
```

---

## 2. Installation & Quickstart

```bash
npm install @liquivault/sdk @stellar/stellar-sdk
```

### Initializing the SDK
```typescript
import { LiquiVaultSDK, RiskTier } from '@liquivault/sdk';

const sdk = new LiquiVaultSDK({
  network: {
    network: 'testnet',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  },
  contracts: {
    invoiceRegistry: 'CBREGISTRY...',
    liquidityPool: 'CBPOOL...',
    factoringEscrow: 'CBESCROW...',
    usdcToken: 'CBUSDC...',
  },
});
```

### Calculating Factoring Quotes Offline
```typescript
// Instant local quote calculation matching on-chain Soroban integer math
const quote = sdk.factoringEscrow.calculateAlgorithmicDiscount(
  1n,
  100_000_0000000n, // 100,000 USDC face value
  RiskTier.TierB,    // 10.00% APR
  Math.floor(Date.now() / 1000) + 86400 * 73 // 73 days to maturity
);

console.log('Time Discount:', quote.timeDiscount); // 2,000 USDC
console.log('Origination Fee:', quote.originationFee); // 500 USDC
console.log('Net Payout to Merchant:', quote.netPayout); // 97,500 USDC
```

### Minting an Invoice with Document Hash Commitment
```typescript
import { computeInvoiceMetadataHash } from '@liquivault/sdk';

// 1. Generate RFC-6902 deterministic SHA-256 document commitment
const metadataHash = computeInvoiceMetadataHash({
  invoiceNumber: 'INV-2026-0042',
  debtorTaxId: 'US-987654321',
  itemDescription: 'Industrial Automation Sensors',
  shippingCarrier: 'Maersk',
  billOfLading: 'BL-98127391',
});

// 2. Build and sign Soroban invocation transaction
const tx = await sdk.invoiceRegistry.buildMintInvoiceTx({
  merchant: merchantPublicKey,
  debtor: debtorPublicKey,
  faceValue: 100_000_0000000n,
  maturity: Math.floor(Date.now() / 1000) + 86400 * 73,
  invoiceRef: 'INV-2026-0042',
  metadataHash,
});
```

---

## 3. Build & Test Commands

```bash
# Run Vitest test suite (11 tests)
npm test

# Build dual ESM/CJS bundles via tsup
npm run build
```

---

## 4. Documentation Links

- [Protocol Architecture Specification](../docs/architecture.md)
- [Verified Test Evidence & Proofs](../docs/EVIDENCE.md)
- [Security Policy & Threat Model](../docs/SECURITY.md)
- [Storage & TTL Lifecycle Policy](../docs/storage.md)


## Network execution and compatibility

Builders now return actual unsigned Stellar transaction XDR and fetch the signer's current sequence from RPC. Submit calls prepare the transaction (footprint, authorization and resource fee) before invoking the wallet callback, and poll `getTransaction` for confirmed return values and ledger numbers. `PENDING` is never treated as success. Confirmation timeouts include the hash so callers can inspect it before retrying. Concurrent writes from one source account must be serialized by the caller.

Reads simulate real `InvokeHostFunction` transactions. Invoice IDs and maturity timestamps use `u64`; token amounts and shares use `i128`. Contract records decode snake_case fields into camelCase, numeric enums into SDK enums, and timestamps into JS numbers. IDs and amounts remain bigint. The optional second constructor argument now accepts an official `rpc.Server` (for testing/customization), replacing the old JSON transport callback. The removed `decodeEnvelope` helper previously decoded a non-transaction JSON format and has no compatible network use.

`splitYield` now requires senior assets as its fourth argument and caps junior yield by its capital share. `calculateAlgorithmicDiscount` is an offline estimate using supplied/default rates; use `previewFactoringQuote` for current on-chain configuration. Quote-only rate annotations are optional because the contract does not return annual rate or origination bps.

Run the opt-in read-only live test with `LIQUIVAULT_TESTNET=1 npm test -- tests/testnet.test.ts` (PowerShell: `$env:LIQUIVAULT_TESTNET='1'; npm test -- tests/testnet.test.ts`). It reads the historical deployment fixture and invoice 1 using real simulation, then prepares an unsigned mint to verify real resource and authorization data. It does not submit transactions or validate the newly repaired contracts until they are deployed. Testnet resets or expired contract storage will make this integration check fail explicitly.
