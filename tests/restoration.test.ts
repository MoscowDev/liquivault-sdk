import { it, expect, vi } from "vitest";
import {
  Account,
  Contract,
  Keypair,
  Networks,
  rpc,
  SorobanDataBuilder,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import { StellarRpcHelper } from "../src";
const contract = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
const config = {
  network: {
    network: "testnet" as const,
    rpcUrl: "https://soroban-testnet.stellar.org",
    horizonUrl: "https://horizon-testnet.stellar.org",
    networkPassphrase: Networks.TESTNET,
  },
  contracts: {
    invoiceRegistry: contract,
    liquidityPool: contract,
    factoringEscrow: contract,
    usdcToken: contract,
  },
};
function invocation() {
  return new TransactionBuilder(
    new Account(Keypair.random().publicKey(), "12"),
    { fee: "100", networkPassphrase: Networks.TESTNET },
  )
    .addOperation(new Contract(contract).call("get_pool_state"))
    .setTimeout(60)
    .build();
}
function success() {
  return {
    _parsed: true,
    latestLedger: 123,
    minResourceFee: "1000",
    events: [],
    transactionData: new SorobanDataBuilder().setResourceFee("1000"),
    result: { auth: [], retval: xdr.ScVal.scvVoid() },
  };
}
it("plans normal preparation without signing or submission", async () => {
  const server = {
    simulateTransaction: vi.fn().mockResolvedValue(success()),
    sendTransaction: vi.fn(),
  };
  const tx = invocation();
  const plan = await new StellarRpcHelper(
    config,
    server as unknown as rpc.Server,
  ).planContractCall(tx.toXDR());
  expect(plan).toMatchObject({
    mode: "normal",
    source: tx.source,
    sequence: "13",
    simulatedAtLedger: 123,
    restorationKeys: [],
    networkPassphrase: Networks.TESTNET,
  });
  expect(plan.preparedXdr).toBeTruthy();
  expect(server.sendTransaction).not.toHaveBeenCalled();
});
it("exposes a manual preamble without preparing or spending", async () => {
  const sim = {
    ...success(),
    restorePreamble: {
      minResourceFee: "4000",
      transactionData: new SorobanDataBuilder().setResourceFee("4000"),
    },
  };
  const server = {
    simulateTransaction: vi.fn().mockResolvedValue(sim),
    sendTransaction: vi.fn(),
  };
  const plan = await new StellarRpcHelper(
    config,
    server as unknown as rpc.Server,
  ).planContractCall(invocation().toXDR());
  expect(plan).toMatchObject({
    mode: "manual-restoration-required",
    minResourceFeeStroops: "4000",
    preparedXdr: null,
  });
  expect(server.sendTransaction).not.toHaveBeenCalled();
});
it("reports simulation failure instead of returning a spendable plan", async () => {
  const server = {
    simulateTransaction: vi
      .fn()
      .mockResolvedValue({
        error: "archived footprint exceeds limits",
        latestLedger: 1,
      }),
  };
  await expect(
    new StellarRpcHelper(
      config,
      server as unknown as rpc.Server,
    ).planContractCall(invocation().toXDR()),
  ).rejects.toThrow("archived footprint exceeds limits");
});
it("preserves Protocol 23 restore-list indices in the prepared invocation", async () => {
  const key = new Contract(contract).getFootprint();
  const original = new SorobanDataBuilder().setReadWrite([key]).build();
  const automatic = xdr.SorobanTransactionData.fromXdrObject({
    ...original.toXdrObject(),
    ext: { v: 1, resourceExt: { archivedSorobanEntries: [0] } },
  });
  const server = {
    simulateTransaction: vi
      .fn()
      .mockResolvedValue({
        ...success(),
        transactionData: new SorobanDataBuilder(automatic),
      }),
  };
  const plan = await new StellarRpcHelper(
    config,
    server as unknown as rpc.Server,
  ).planContractCall(invocation().toXDR());
  expect(plan.mode).toBe("automatic-restoration");
  expect(plan.restorationKeys).toEqual([key.toXDR("base64")]);
  const tx = TransactionBuilder.fromXDR(
    plan.preparedXdr!,
    Networks.TESTNET,
  ).toEnvelope();
  if (tx.type !== "envelopeTypeTx" || tx.v1.tx.ext.type !== "sorobanData")
    throw new Error("Missing Soroban resources");
  expect(tx.v1.tx.ext.sorobanData.ext.type).toBe("resourceExt");
});
