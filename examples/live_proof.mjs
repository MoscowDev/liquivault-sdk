import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LiquiVaultSDK, RiskTier } from "../dist/index.mjs";
const deployment = JSON.parse(
  readFileSync(
    new URL("../tests/testnet-deployment.json", import.meta.url),
    "utf8",
  ),
);
const sdk = new LiquiVaultSDK({
  network: {
    network: "testnet",
    rpcUrl: "https://soroban-testnet.stellar.org",
    horizonUrl: "https://horizon-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
  },
  contracts: deployment.contracts,
});
const unit = 10_000_000n;
const now = 1_800_000_000;
const quote = sdk.factoringEscrow.calculateAlgorithmicDiscount(
  1n,
  100_000n * unit,
  RiskTier.TierB,
  now + 73 * 86400,
  now,
  50,
);
const junior = { totalAssets: 50_000n * unit, totalShares: 50_000n * unit };
const split = sdk.liquidityPool.splitYield(
  quote.totalDiscount,
  1000,
  junior,
  150_000n * unit,
);
assert.equal(quote.netPayout, 97_500n * unit);
assert.equal(split.protocolCut, 250n * unit);
assert.equal(split.juniorYield, (5625n * unit) / 10n);
assert.equal(split.seniorYield, (16875n * unit) / 10n);
const loss = sdk.liquidityPool.splitLoss(60_000n * unit, junior);
assert.equal(loss.juniorLoss, 50_000n * unit);
assert.equal(loss.seniorLoss, 10_000n * unit);
console.log(
  JSON.stringify(
    {
      mode: "offline arithmetic only",
      quote,
      split,
      loss,
      note: "Illustrative configured rates. No real companies, document verification, wallet actions or network execution are implied.",
    },
    (_, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  ),
);
