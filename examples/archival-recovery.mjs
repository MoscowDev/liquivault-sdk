// Opt-in integration against the separately instrumented localhost fixture only.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  Address,
  Contract,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import { LiquiVaultSDK } from "../dist/index.mjs";

const workspace = resolve(process.argv[2] ?? "");
const manifest = JSON.parse(
  readFileSync(join(workspace, "fixture-manifest.json"), "utf8"),
);
assert.equal(manifest.scope, "instrumented-standalone-only");
assert.equal(manifest.canonicalSourcesModified, false);
const seedId = process.argv[3] ?? "seed";
assert.match(seedId, /^[a-zA-Z0-9_-]{1,40}$/);
const recordPath = join(
  workspace,
  "fixture",
  ".stellar",
  "proofs",
  seedId,
  "deployment.json",
);
const record = JSON.parse(readFileSync(recordPath, "utf8"));
assert.equal(record.network, "standalone");
assert.equal(record.smokeTest.assertionsPassed, true);
const receiptPath = join(workspace, "recovery-state.json");
const state = existsSync(receiptPath)
  ? JSON.parse(readFileSync(receiptPath, "utf8"))
  : {};
if (state.hash)
  throw new Error(
    `A recovery submission already has hash ${state.hash}; inspect its recorded status before another run`,
  );
const networkPassphrase = "Standalone Network ; February 2017";
const sdk = new LiquiVaultSDK({
  network: {
    network: "standalone",
    rpcUrl: "http://127.0.0.1:18000/rpc",
    horizonUrl: "http://127.0.0.1:18000",
    networkPassphrase,
  },
  contracts: record.contracts,
});
const network = await sdk.rpc.server.getNetwork();
assert.equal(network.passphrase, networkPassphrase);
assert.ok(network.protocolVersion >= 23);
const provider = record.accounts.liquidityProvider;
const instanceKey = new Contract(record.contracts.liquidityPool).getFootprint();
const positionKey = xdr.LedgerKey.contractData(
  new xdr.LedgerKeyContractData({
    contract: new Address(record.contracts.liquidityPool).toScAddress(),
    key: xdr.ScVal.scvVec([
      xdr.ScVal.scvSymbol("Position"),
      new Address(provider).toScVal(),
    ]),
    durability: xdr.ContractDataDurability.persistent,
  }),
);
const keys = [instanceKey, positionKey];
const save = () =>
  writeFileSync(receiptPath, JSON.stringify(state, null, 2) + "\n");
if (!state.before) {
  const before = await sdk.rpc.server.getLedgerEntries(...keys);
  assert.equal(
    before.entries.length,
    2,
    "Start this harness before the short-TTL fixture expires",
  );
  const position = await sdk.liquidityPool.getLPPosition(provider);
  assert.ok(position.shares > 0n);
  state.before = {
    shares: position.shares.toString(),
    liveUntilLedgers: before.entries.map((entry) => entry.liveUntilLedgerSeq),
    balance: (
      await sdk.rpc.simulateViewCall(record.contracts.usdcToken, "balance", [
        provider,
      ])
    ).toString(),
  };
  state.targetLedger = Math.max(...state.before.liveUntilLedgers) + 1;
  save();
}
console.log(
  `Waiting for natural expiry at ledger ${state.targetLedger}; no ledger sequence or clock jumps`,
);
let previousLedger;
let expiryObserved = false;
for (let attempt = 0; attempt < 600; attempt++) {
  const latest = await sdk.rpc.server.getLatestLedger();
  if (latest.sequence >= state.targetLedger) {
    expiryObserved = true;
    break;
  }
  if (
    previousLedger !== latest.sequence &&
    (previousLedger === undefined || latest.sequence % 16 === 0)
  )
    console.log(`RPC ledger ${latest.sequence}`);
  previousLedger = latest.sequence;
  if (attempt === 599)
    throw new Error(
      "Fixture did not expire in time; no recovery success established",
    );
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
assert.ok(expiryObserved, "Fixture expiry was not observed");
const expired = await sdk.rpc.server.getLedgerEntries(...keys);
assert.ok(
  expired.entries.every(
    (entry) =>
      Number.isInteger(entry.liveUntilLedgerSeq) &&
      entry.liveUntilLedgerSeq < expired.latestLedger,
  ),
  "Instance and position must both be expired",
);
state.expiredEntryTtls = expired.entries.map(
  (entry) => entry.liveUntilLedgerSeq,
);
state.archivedBefore = true;
save();
const unsigned = await sdk.builder.buildWithdrawTx(
  provider,
  BigInt(state.before.shares),
);
const plan = await sdk.rpc.planContractCall(unsigned);
assert.equal(plan.mode, "automatic-restoration");
for (const key of keys)
  assert.ok(
    plan.restorationKeys.includes(key.toXDR("base64")),
    "Missing expected restoration key",
  );
await assert.rejects(
  () =>
    sdk.rpc.executeContractCall(unsigned, async () => {
      throw new Error("Test signer rejected restoration fees");
    }),
  /Test signer rejected restoration fees/,
);
const afterRejection = await sdk.rpc.server.getLedgerEntries(...keys);
assert.ok(
  afterRejection.entries.every(
    (entry) =>
      Number.isInteger(entry.liveUntilLedgerSeq) &&
      entry.liveUntilLedgerSeq < afterRejection.latestLedger,
  ),
  "Rejected signing must not restore state",
);
state.rejectedSigningPreservedArchive = true;
save();
const result = await sdk.rpc.executeContractCall(unsigned, async (prepared) => {
  const signed = spawnSync(
    process.env.STELLAR ?? "stellar",
    [
      "--config-dir",
      join(dirname(recordPath), "config"),
      "tx",
      "sign",
      "--sign-with-key",
      "lp",
      "--network",
      "liquivault-local",
    ],
    {
      input: prepared + "\n",
      encoding: "utf8",
      windowsHide: true,
      timeout: 30000,
    },
  );
  assert.equal(signed.status, 0, "Isolated CLI signing failed");
  const encoded = signed.stdout.trim();
  const tx = TransactionBuilder.fromXDR(encoded, networkPassphrase);
  state.hash = Array.from(tx.hash(), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  state.status = "submission-outcome-unverified";
  save(); // Persist before submission; never silently replay an uncertain write.
  return encoded;
});
assert.equal(result.status, "SUCCESS");
assert.ok(result.returnValue > 0n);
const restored = await sdk.rpc.server.getLedgerEntries(...keys);
assert.equal(restored.entries.length, 2);
assert.ok(
  restored.entries.every((entry) => entry.liveUntilLedgerSeq >= result.ledger),
  "Restored entries must be live again",
);
assert.equal((await sdk.liquidityPool.getLPPosition(provider)).shares, 0n);
const balanceAfter = await sdk.rpc.simulateViewCall(
  record.contracts.usdcToken,
  "balance",
  [provider],
);
assert.equal(balanceAfter - BigInt(state.before.balance), result.returnValue);
Object.assign(state, {
  status: "confirmed",
  ledger: result.ledger,
  checkedAt: new Date().toISOString(),
  network: "standalone",
  scope: manifest.scope,
  protocolVersion: network.protocolVersion,
  restorationKeys: plan.restorationKeys,
  restoredLiveUntilLedgers: restored.entries.map(
    (entry) => entry.liveUntilLedgerSeq,
  ),
  withdrawalTokenUnits: result.returnValue.toString(),
  instanceAndPositionRestored: true,
  withdrawalCompleted: true,
  tokenBalanceDeltaVerified: true,
  fixtureManifest: manifest,
  fixtureWasmSha256: record.provenance.wasmSha256,
});
save();
console.log(JSON.stringify(state, null, 2));
