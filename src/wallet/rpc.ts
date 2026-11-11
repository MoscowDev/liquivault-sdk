import {
  Account,
  Keypair,
  rpc,
  scValToNative,
  Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import {
  LiquiVaultConfig,
  SimulationResult,
  TransactionResult,
} from "../types";
import { LiquiVaultTransactionBuilder } from "../builders/transactionBuilder";

/** Injectable official RPC server, so tests exercise the same XDR path as production. */
export type RpcTransportHandler = rpc.Server;

const TIMESTAMP_KEYS = new Set([
  "issuedAt",
  "maturityTimestamp",
  "lastDepositTimestamp",
  "factoredAt",
  "settledAt",
  "durationSeconds",
]);
export function decodeContractValue(value: unknown, key = ""): any {
  if (typeof value === "bigint" && TIMESTAMP_KEYS.has(key))
    return Number(value);
  if (value instanceof Uint8Array)
    return Array.from(value)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  if (Array.isArray(value)) return value.map((v) => decodeContractValue(v));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => {
        const camel = k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
        if (camel === "riskTier" && typeof v === "number")
          return [camel, ["TierA", "TierB", "TierC"][v]];
        if (camel === "status" && typeof v === "number") {
          const statuses =
            "net_payout" in value && !("owner" in value)
              ? ["Active", "Settled", "Defaulted"]
              : ["Issued", "Verified", "Factored", "Settled", "Defaulted"];
          return [camel, statuses[v]];
        }
        return [camel, decodeContractValue(v, camel)];
      }),
    );
  }
  return value;
}

export class StellarRpcHelper {
  public readonly server: rpc.Server;
  constructor(
    private readonly config: LiquiVaultConfig,
    server?: rpc.Server,
  ) {
    this.server =
      server ??
      new rpc.Server(config.network.rpcUrl, {
        allowHttp: config.network.network === "standalone",
      });
  }
  public async simulateTransaction<T = unknown>(
    txXdr: string,
  ): Promise<SimulationResult<T>> {
    const sim = await this.server.simulateTransaction(
      TransactionBuilder.fromXDR(txXdr, this.config.network.networkPassphrase),
    );
    if (!rpc.Api.isSimulationSuccess(sim))
      throw new Error(
        `Simulation failed: ${"error" in sim ? sim.error : "restoration required"}`,
      );
    return {
      success: true,
      returnValue: decodeContractValue(
        sim.result ? scValToNative(sim.result.retval) : undefined,
      ),
      minResourceFeeStroops: sim.minResourceFee,
    };
  }
  public async simulateViewCall<T>(
    contractId: string,
    method: string,
    args: unknown[],
  ): Promise<T> {
    // Simulation needs a syntactically valid source, but read-only calls need no funded account or signature.
    const source = new Account(Keypair.random().publicKey(), "0");
    const tx = new LiquiVaultTransactionBuilder(this.config).buildTransaction(
      source,
      contractId,
      method,
      args,
    );
    const sim = await this.simulateTransaction<T>(tx.toXDR());
    return sim.returnValue;
  }
  public async executeContractCall<T>(
    unsignedTxXdr: string,
    signTransaction: (xdr: string) => Promise<string>,
  ): Promise<TransactionResult<T>> {
    const tx = TransactionBuilder.fromXDR(
      unsignedTxXdr,
      this.config.network.networkPassphrase,
    );
    const prepared = await this.server.prepareTransaction(tx);
    const signed = TransactionBuilder.fromXDR(
      await signTransaction(prepared.toXDR()),
      this.config.network.networkPassphrase,
    );
    if (
      !(signed instanceof Transaction) ||
      !signed.hash().every((byte, i) => byte === prepared.hash()[i])
    )
      throw new Error("Wallet changed the transaction body");
    const localHash = Array.from(signed.hash(), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    const submitted = await this.server
      .sendTransaction(signed)
      .catch((error: unknown) => {
        throw new Error(
          `Submission outcome unknown for ${localHash}: ${String(error)}. Check this hash before retrying.`,
        );
      });
    if (submitted.status !== "PENDING" && submitted.status !== "DUPLICATE") {
      throw new Error(`Submission ${submitted.status}: ${submitted.hash}`);
    }
    for (let attempt = 0; attempt < 60; attempt++) {
      const result = await this.server
        .getTransaction(submitted.hash)
        .catch((error: unknown) => {
          throw new Error(
            `Confirmation unavailable for ${submitted.hash}: ${String(error)}. Check this hash before retrying.`,
          );
        });
      if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) {
        return {
          txHash: submitted.hash,
          status: "SUCCESS",
          ledger: result.ledger,
          returnValue: decodeContractValue(
            result.returnValue ? scValToNative(result.returnValue) : undefined,
          ),
          feeChargedStroops: result.resultXdr.feeCharged.toString(),
        };
      }
      if (result.status === rpc.Api.GetTransactionStatus.FAILED)
        throw new Error(`Transaction failed: ${submitted.hash}`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error(
      `Confirmation timed out; transaction may still confirm. Check hash ${submitted.hash} before retrying.`,
    );
  }
}
