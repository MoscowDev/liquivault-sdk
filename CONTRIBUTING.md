# Contributing to `@liquivault/sdk` (`liquivault-sdk`)

Thank you for your interest in contributing to **`@liquivault/sdk`**, the official TypeScript SDK for the **LiquiVault** decentralized trade invoice factoring protocol on **Stellar Soroban**! We welcome contributors from **Drips Wave** and the Stellar developer community.

---

## Prerequisites

- **Node.js**: `>= 20.x`
- **npm**: `>= 10.x`

---

## Development Workflow

1. **Fork & Clone the Repository**
   ```bash
   git clone https://github.com/<your-username>/liquivault-sdk.git
   cd liquivault-sdk
   npm install
   ```

2. **Create a Branch**
   ```bash
   git checkout -b feat/issue-5-soroban-xdr-builder
   ```

3. **Run Tests & Typechecks**
   ```bash
   npm run typecheck
   npm test
   ```

4. **Build Dual ESM/CJS Bundles**
   ```bash
   npm run build
   ```

---

## Code Standards

- **Strict TypeScript**: Avoid `any`; define explicit interfaces in `src/types/index.ts`.
- **BigInt Precision**: Represent all on-chain USDC amounts (7-decimal stroops) and invoice IDs as `bigint` to match Soroban `i128` and `u64` types without floating-point precision loss.
- **Test Coverage**: Add unit tests in `tests/sdk.test.ts` (using `vitest`) for all new contract client methods, transaction builders, and RPC helpers.

---

## Submitting a Pull Request

1. Verify that `npm run typecheck`, `npm test`, and `npm run build` succeed with zero errors.
2. Link the target issue in your PR description (`Closes #<issue-number>`).
