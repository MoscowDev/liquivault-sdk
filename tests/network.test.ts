import { it, expect, vi } from "vitest";
import {
  Account,
  Keypair,
  Networks,
  nativeToScVal,
  rpc,
  TransactionBuilder,
  Transaction,
  xdr,
} from "@stellar/stellar-sdk";
import { LiquiVaultSDK, StellarRpcHelper, decodeContractValue } from "../src";
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
const signer = Keypair.random();
const sdk = new LiquiVaultSDK(config);
function transaction() {
  return sdk.builder.buildTransaction(
    new Account(signer.publicKey(), "42"),
    contract,
    "factor_invoice",
    [signer.publicKey(), 7n],
  );
}
function argsFor(op: xdr.Operation) {
  if (op.body.type !== "invokeHostFunction")
    throw new Error("Expected invocation");
  const host = op.body.invokeHostFunctionOp.hostFunction;
  if (host.type !== "hostFunctionTypeInvokeContract")
    throw new Error("Expected contract call");
  return host.invokeContract.args;
}
it("creates parseable transaction XDR with a source, next sequence, fee and u64 ID", () => {
  const tx = TransactionBuilder.fromXDR(
    transaction().toXDR(),
    Networks.TESTNET,
  ) as Transaction;
  expect(tx.source).toBe(signer.publicKey());
  expect(tx.sequence).toBe("43");
  expect(BigInt(tx.fee)).toBeGreaterThan(0n);
  const envelope = transaction().toEnvelope();
  if (envelope.type !== "envelopeTypeTx")
    throw new Error("Expected transaction");
  const args = argsFor(envelope.v1.tx.operations[0]);
  expect(args[1].type).toBe("scvU64");
});
it("encodes maturity as u64 and amount as i128", () => {
  const op = sdk.builder.buildOperation(contract, "mint_invoice", [
    signer.publicKey(),
    signer.publicKey(),
    contract,
    100n,
    1800000000,
    "aa".repeat(32),
    "TierA",
    "TierB",
  ]);
  const args = argsFor(op);
  expect(args[3].type).toBe("scvI128");
  expect(args[4].type).toBe("scvU64");
  expect(args[6].type).toBe("scvString");
  expect(args[7].value).toBe(1);
});
it("decodes contract field names, numeric enums, timestamps and IDs", () => {
  expect(
    decodeContractValue({
      invoice_id: 1n,
      maturity_timestamp: 1800000000n,
      risk_tier: 1,
      status: 0,
    }),
  ).toEqual({
    invoiceId: 1n,
    maturityTimestamp: 1800000000,
    riskTier: "TierB",
    status: "Issued",
  });
});
it("prepares before signing and waits through NOT_FOUND for confirmed return value", async () => {
  const tx = transaction();
  const prepared = TransactionBuilder.cloneFrom(tx, { fee: "1234" }).build();
  const server = {
    prepareTransaction: vi.fn().mockResolvedValue(prepared),
    sendTransaction: vi
      .fn()
      .mockResolvedValue({ status: "PENDING", hash: "confirmed-hash" }),
    getTransaction: vi
      .fn()
      .mockResolvedValueOnce({ status: "NOT_FOUND" })
      .mockResolvedValue({
        status: "SUCCESS",
        ledger: 123,
        returnValue: nativeToScVal(9n, { type: "u64" }),
        resultXdr: { feeCharged: 1234n },
      }),
  };
  const sign = vi.fn(async (encoded: string) => {
    expect(encoded).toBe(prepared.toXDR());
    const t = TransactionBuilder.fromXDR(encoded, Networks.TESTNET);
    t.sign(signer);
    return t.toXDR();
  });
  const result = await new StellarRpcHelper(
    config,
    server as unknown as rpc.Server,
  ).executeContractCall(tx.toXDR(), sign);
  expect(result).toEqual({
    txHash: "confirmed-hash",
    status: "SUCCESS",
    ledger: 123,
    returnValue: 9n,
    feeChargedStroops: "1234",
  });
  expect(server.getTransaction).toHaveBeenCalledTimes(2);
});
it("does not sign after preparation failure or report failed submission as success", async () => {
  const sign = vi.fn(async (s: string) => s);
  const server = {
    prepareTransaction: vi
      .fn()
      .mockRejectedValue(new Error("simulation failed")),
  };
  await expect(
    new StellarRpcHelper(
      config,
      server as unknown as rpc.Server,
    ).executeContractCall(transaction().toXDR(), sign),
  ).rejects.toThrow("simulation failed");
  expect(sign).not.toHaveBeenCalled();
});

it("preserves the locally computed hash when the submission response is lost", async () => {
  const tx = transaction();
  const server = {
    prepareTransaction: vi.fn().mockResolvedValue(tx),
    sendTransaction: vi.fn().mockRejectedValue(new Error("connection reset")),
  };
  const expectedHash = Array.from(tx.hash(), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  await expect(
    new StellarRpcHelper(
      config,
      server as unknown as rpc.Server,
    ).executeContractCall(tx.toXDR(), async (encoded) => encoded),
  ).rejects.toThrow(`Submission outcome unknown for ${expectedHash}`);
});

it.each(["ERROR", "TRY_AGAIN_LATER"])(
  "does not report submission %s as success",
  async (status) => {
    const tx = transaction();
    const server = {
      prepareTransaction: vi.fn().mockResolvedValue(tx),
      sendTransaction: vi
        .fn()
        .mockResolvedValue({ status, hash: "rejected-hash" }),
      getTransaction: vi.fn(),
    };
    await expect(
      new StellarRpcHelper(
        config,
        server as unknown as rpc.Server,
      ).executeContractCall(tx.toXDR(), async (encoded) => encoded),
    ).rejects.toThrow(`Submission ${status}`);
    expect(server.getTransaction).not.toHaveBeenCalled();
  },
);
it("rejects a failed ledger transaction instead of using simulation output", async () => {
  const tx = transaction();
  const server = {
    prepareTransaction: vi.fn().mockResolvedValue(tx),
    sendTransaction: vi
      .fn()
      .mockResolvedValue({ status: "PENDING", hash: "failed-hash" }),
    getTransaction: vi.fn().mockResolvedValue({ status: "FAILED" }),
  };
  await expect(
    new StellarRpcHelper(
      config,
      server as unknown as rpc.Server,
    ).executeContractCall(tx.toXDR(), async (encoded) => encoded),
  ).rejects.toThrow("Transaction failed: failed-hash");
});
