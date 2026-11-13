# @liquivault/sdk

[![CI](https://github.com/MoscowDev/liquivault-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/MoscowDev/liquivault-sdk/actions/workflows/ci.yml)
[MIT license](LICENSE)

TypeScript clients for LiquiVault's experimental Stellar Soroban contracts. Requires Node.js 22.13+ for the documented tooling. Testnet demonstrations use a custom test token, not Circle-issued USDC.

## Install and verify

### Read-only preparation planning

`await sdk.rpc.planContractCall(unsignedXdr)` simulates one invocation and returns the configured network/RPC, source/sequence, simulated ledger, minimum resource-fee estimate and restoration keys. Its mode is `normal`, `automatic-restoration` or `manual-restoration-required`. The last mode returns no prepared invocation; a manual recovery planner/executor remains unfinished. Plans neither sign nor submit and become stale as network state or account sequences change. Fees include normal rent/restoration charges and are estimates, not a spending guarantee.

`npm test -- tests/restoration.test.ts` covers normal preparation, Protocol 23 restore-list preservation, a manual preamble and simulation failure using real XDR structures. Separately, `examples/archival-recovery.mjs` verifies real expiry, rejected signing and confirmed automatic restoration/withdrawal against an instrumented localhost fixture. Run it through the [contracts recovery runner](https://github.com/MoscowDev/liquivault-contracts/blob/main/docs-local-integration.md). Its shortened timing constants and local hashes are explicitly recorded; it does not claim production-WASM timing or manual-recovery coverage.

```sh
git clone https://github.com/MoscowDev/liquivault-sdk.git
cd liquivault-sdk
npm ci
npm run typecheck
npm test
npm run build
npm run example
npm audit
```

Installation builds `dist/` through `prepare`. Bundles support ESM/CommonJS and include declarations. No npm publication is implied by the package name; the frontend currently uses a sibling checkout. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Read and preview

```ts
import { LiquiVaultSDK } from '@liquivault/sdk';

const sdk = new LiquiVaultSDK({
  network: {
    network: 'testnet',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  },
  contracts: deployment.contracts, // Load the published testnet JSON record.
});
const pool = await sdk.liquidityPool.getPoolState();
const invoice = await sdk.invoiceRegistry.getInvoice(1n);
// Only use an unexpired invoice when requesting its current quote:
const quote = await sdk.factoringEscrow.previewFactoringQuote(invoice.invoiceId);
```

`examples/testnet_quote.mjs` is an executable network example. `examples/live_proof.mjs` is explicitly an offline arithmetic example; it submits no transactions.

## Signed writes

```ts
import { RiskTier } from '@liquivault/sdk';

const wallet = await sdk.wallet.connect();
const sign = (xdr: string) => sdk.wallet.signTransaction(xdr, wallet.publicKey);
const result = await sdk.invoiceRegistry.createInvoice({
  merchant: wallet.publicKey,
  debtor: debtorPublicKey,
  faceValue: 100_0000000n, // 100 test tokens, seven decimals.
  maturityTimestamp: Math.floor(Date.now() / 1000) + 86400 * 30,
  metadataHash: sdk.invoiceRegistry.computeMetadataHash({ invoiceNumber: 'EXAMPLE-001' }),
  invoiceNumber: 'EXAMPLE-001',
  riskTier: RiskTier.TierB,
}, sign);
console.log(result.txHash, result.ledger, result.returnValue);
```

The source must be funded. Minting creates `Issued`, not `Verified`; a configured verifier/admin must approve separately. The SDK fetches the source sequence, builds a real Stellar transaction, prepares footprint/auth/resource fees, asks the wallet to sign, validates the body and polls for confirmation. `PENDING` is not success. A failed ledger transaction raises an error. Inspect any reported hash before retrying a timeout or interrupted confirmation. Serialize writes from the same source account, including writes from other tabs/tools.

## Types and limitations

Invoice IDs and maturity values encode as `u64`; token values/shares as `i128`; risk tiers as `u32`; rate fields use symbol keys. Contract records decode to camelCase. IDs and amounts stay bigint; timestamps become JS numbers. Settlement returns `[lpYield, protocolCut]`; verification returns void.

`calculateAlgorithmicDiscount` is an offline estimate using explicitly supplied/default rates. Use the contract preview for current pricing. `splitYield` requires senior assets as its fourth argument and caps junior yield by capital share. Withdraw previews estimate arithmetic/liquidity and do not authorize withdrawal or bypass the 24-hour lock.

Reads use real RPC simulation, not a custom RPC method. They do not persist state or renew rent. A custom official `rpc.Server` can be supplied for tests/integration; the removed JSON transport/decodeEnvelope format was not a network transaction. On modern protocols, official preparation can include automatic restoration in the invocation. A dedicated manual-restoration planner/rent keeper, historical indexing, SEP-10 authentication orchestration and SEP-24 are not implemented. See the [current storage guidance](https://github.com/MoscowDev/LiquiVault/blob/main/docs/storage.md).

Metadata objects use recursively sorted JSON keys and preserve array order; strings are hashed verbatim. Non-finite/non-JSON values are rejected. This is a deterministic encoding, not a claim of RFC canonicalization. Additional address authorizations (such as the new admin in a role transfer) need appropriate signing coordination; a single source-wallet signature does not automatically authorize a second address.

## Live test

```sh
LIQUIVAULT_TESTNET=1 npm test -- tests/testnet.test.ts
```

PowerShell: `$env:LIQUIVAULT_TESTNET='1'; npm test -- tests/testnet.test.ts`. This reads the fixture deployment and prepares an unsigned mint with actual resource/auth data. It never signs or submits. Testnet resets/archival must fail visibly. Signed deployment evidence is maintained in the [contracts record](https://github.com/MoscowDev/liquivault-contracts/blob/main/deployments/testnet.json).

[Architecture](https://github.com/MoscowDev/LiquiVault/blob/main/docs/architecture.md) | [Security](SECURITY.md) | [Evidence](https://github.com/MoscowDev/LiquiVault/blob/main/docs/EVIDENCE.md)
