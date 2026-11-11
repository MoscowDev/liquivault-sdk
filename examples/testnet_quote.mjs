import { readFileSync } from "node:fs";
import { LiquiVaultSDK } from "../dist/index.mjs";
const deployment = JSON.parse(
  readFileSync(
    new URL("../tests/testnet-deployment.json", import.meta.url),
    "utf8",
  ),
);
const invoiceId = BigInt(process.argv[2] ?? deployment.smokeTest.invoiceId);
const sdk = new LiquiVaultSDK({
  network: {
    network: "testnet",
    rpcUrl: "https://soroban-testnet.stellar.org",
    horizonUrl: "https://horizon-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
  },
  contracts: deployment.contracts,
});
const [pool, invoice] = await Promise.all([
  sdk.liquidityPool.getPoolState(),
  sdk.invoiceRegistry.getInvoice(invoiceId),
]);
const quote =
  invoice.maturityTimestamp > Date.now() / 1000
    ? await sdk.factoringEscrow.previewFactoringQuote(invoiceId)
    : null;
console.log(
  JSON.stringify(
    {
      network: "testnet",
      invoice,
      pool,
      quote,
      note: "Read-only simulation. A quote is not proof of factoring eligibility. No transaction is signed or submitted.",
    },
    (_, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  ),
);
