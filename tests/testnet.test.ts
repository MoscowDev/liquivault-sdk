import { it, expect } from "vitest";
import { TransactionBuilder } from "@stellar/stellar-sdk";
import { LiquiVaultSDK, RiskTier } from "../src";
import { readFileSync } from "node:fs";
const deployment = JSON.parse(
  readFileSync(new URL("./testnet-deployment.json", import.meta.url), "utf8"),
);
it.skipIf(process.env.LIQUIVAULT_TESTNET !== "1")(
  "reads actual deployed testnet state and simulates a u64 invoice lookup",
  async () => {
    const sdk = new LiquiVaultSDK({
      network: {
        network: "testnet",
        rpcUrl: "https://soroban-testnet.stellar.org",
        horizonUrl: "https://horizon-testnet.stellar.org",
        networkPassphrase: "Test SDF Network ; September 2015",
      },
      contracts: deployment.contracts,
    });
    const pool = await sdk.liquidityPool.getPoolState();
    expect(pool.usdcToken).toBe(deployment.contracts.usdcToken);
    expect(typeof pool.totalAssets).toBe("bigint");
    const invoice = await sdk.invoiceRegistry.getInvoice(
      BigInt(deployment.smokeTest.invoiceId),
    );
    expect(invoice.invoiceId).toBe(BigInt(deployment.smokeTest.invoiceId));
    expect(invoice.status).toBe("Settled");
    const unsigned = await sdk.builder.buildMintInvoiceTx({
      merchant: deployment.accounts.merchant,
      debtor: deployment.accounts.debtor,
      faceValue: 10000000n,
      maturityTimestamp: Math.floor(Date.now() / 1000) + 86400 * 60,
      metadataHash: "ab".repeat(32),
      invoiceNumber: "SDK-SIMULATION-ONLY",
      riskTier: RiskTier.TierB,
    });
    const prepared = await sdk.rpc.server.prepareTransaction(
      TransactionBuilder.fromXDR(
        unsigned,
        sdk.config.network.networkPassphrase,
      ),
    );
    const envelope = prepared.toEnvelope();
    if (
      envelope.type !== "envelopeTypeTx" ||
      envelope.v1.tx.ext.type !== "sorobanData"
    )
      throw new Error("Missing prepared Soroban resources");
    expect(envelope.v1.tx.ext.sorobanData.resourceFee).toBeGreaterThan(0n);
    const operation = envelope.v1.tx.operations[0];
    if (operation.body.type !== "invokeHostFunction")
      throw new Error("Missing host operation");
    expect(operation.body.invokeHostFunctionOp.auth.length).toBeGreaterThan(0);
    // Deliberately unsigned and never submitted: this test mutates no on-chain state.
  },
  60000,
);
