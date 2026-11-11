import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { LiquiVaultSDK } from "../src";
const deployment = JSON.parse(
  readFileSync(new URL("./testnet-deployment.json", import.meta.url), "utf8"),
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
describe("metadata commitments", () => {
  it("preserves nested fields while sorting nested keys", () => {
    const first = {
      invoice: "A",
      terms: { days: 30, amount: 100 },
      lines: [{ quantity: 2, name: "part" }],
    };
    const reordered = {
      lines: [{ name: "part", quantity: 2 }],
      terms: { amount: 100, days: 30 },
      invoice: "A",
    };
    const expected = createHash("sha256")
      .update(
        '{"invoice":"A","lines":[{"name":"part","quantity":2}],"terms":{"amount":100,"days":30}}',
      )
      .digest("hex");
    expect(sdk.invoiceRegistry.computeMetadataHash(first)).toBe(expected);
    expect(sdk.invoiceRegistry.computeMetadataHash(reordered)).toBe(expected);
    expect(
      sdk.invoiceRegistry.computeMetadataHash({
        ...first,
        terms: { days: 31, amount: 100 },
      }),
    ).not.toBe(expected);
  });
  it("hashes strings verbatim and rejects lossy non-JSON metadata", () => {
    expect(sdk.invoiceRegistry.computeMetadataHash("document")).toBe(
      createHash("sha256").update("document").digest("hex"),
    );
    expect(() =>
      sdk.invoiceRegistry.computeMetadataHash({ amount: NaN }),
    ).toThrow(/finite JSON/);
    expect(() =>
      sdk.invoiceRegistry.computeMetadataHash({ missing: undefined }),
    ).toThrow(/finite JSON/);
  });
});
