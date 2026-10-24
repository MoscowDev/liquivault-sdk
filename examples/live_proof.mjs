import { LiquiVaultSDK, RiskTier } from '../dist/index.mjs';

function stroopsToUsdc(stroops) {
  const s = BigInt(stroops);
  const whole = s / 10000000n;
  const fraction = (s % 10000000n).toString().padStart(7, '0');
  return `${whole.toLocaleString()}.${fraction}`;
}

function usdcToStroops(usdc) {
  return BigInt(usdc) * 10000000n;
}

console.log('='.repeat(80));
console.log('   LIQUIVAULT PROTOCOL - OFFLINE QUOTE & TRANCHE MATH WALKTHROUGH');
console.log('   (pure SDK math, no network calls; on-chain run: liquivault-contracts/deployments/testnet.json)');
console.log('='.repeat(80));

const config = {
  network: {
    network: 'testnet',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  },
  contracts: {
    invoiceRegistry: 'CBYTATTI4S32LCK5W2N4P6U64MAGROW5ZH7DOXAO4CIOY2KWDNIDLSQY',
    liquidityPool: 'CCRZRIUMDZ67YDHWMPUFO2LZNGKS2QDRPNK23MUVBYMXYHDDQNNDULGR',
    factoringEscrow: 'CBQGNTVLNXV2LZ47GTOUK2TQNTNBNWUWSAKXVYHCURAVL7UZENQ7U42C',
    usdcToken: 'CCELQDGSNDDQHVDXQM3CXBCR4LOGLVAIKKET4RY72MZP7SKTEOY2RO2K',
  },
};

const sdk = new LiquiVaultSDK(config);

const timestamp = Math.floor(Date.now() / 1000);
const maturity73Days = timestamp + 86400 * 73;

console.log(`\n[STEP 1] TOKENIZATION & CRYPTOGRAPHIC COMMITMENT`);
console.log(`Timestamp: ${new Date(timestamp * 1000).toISOString()}`);
const commercialInvoiceDoc = {
  invoiceNumber: 'INV-2026-US-8921',
  sellerLegalEntity: 'Apex Semiconductor Fabrication Ltd.',
  debtorLegalEntity: 'Siemens Energy AG',
  faceValueUsdc: '100,000.00',
  billOfLading: 'MAERSK-BL-7719284',
  issuedDate: '2026-10-23',
  paymentTerms: 'Net-73 Days'
};

const metadataHash = sdk.invoiceRegistry.computeMetadataHash(commercialInvoiceDoc);
console.log(`  -> Off-Chain Receivable Canonical JSON Document Hashed.`);
console.log(`  -> SHA-256 Document Commitment Hash: 0x${metadataHash}`);
console.log(`  -> Invoice Status: Issued (0)`);
console.log(`  -> Face Value: 100,000.0000000 USDC (${usdcToStroops(100000)} stroops)`);

console.log(`\n[STEP 2] ORACLE RISK UNDERWRITING (FINDING F-1 MITIGATION)`);
console.log(`  -> Verifier Oracle (Licensed Financial Auditor) validates commercial document.`);
console.log(`  -> Self-verification by merchant or debtor: STRICTLY DISALLOWED & REVERTED.`);
const riskTier = RiskTier.TierB; // 10.00% APR = 1,000 bps
console.log(`  -> Assigned Risk Tier: Tier B (Standard Corporate Credit - 10.00% APR, 50 bps Origination Fee)`);
console.log(`  -> Invoice Status: Verified (1)`);

console.log(`\n[STEP 3] CAPITAL FORMATION: SENIOR & JUNIOR TRANCHES`);
const seniorDeposit = usdcToStroops(60000); // 60,000 USDC
const juniorDeposit = usdcToStroops(20000); // 20,000 USDC
console.log(`  -> Senior LP deposits: 60,000.0000000 USDC (Mints 60,000 lvUSDC Shares)`);
console.log(`  -> Junior LP deposits: 20,000.0000000 USDC (Mints 20,000 jUSDC First-Loss Shares)`);
console.log(`  -> Total Pool Liquidity: 80,000.0000000 USDC`);

console.log(`\n[STEP 4] ALGORITHMIC FACTORING PRICING & ATOMIC PAYOUT`);
const quote = sdk.factoringEscrow.calculateAlgorithmicDiscount(
  1n,
  usdcToStroops(100000),
  riskTier,
  maturity73Days,
  timestamp,
  50
);

console.log(`  -> Duration: 73 Days (6,307,200 seconds)`);
console.log(`  -> Time-Weighted Discount: ${stroopsToUsdc(quote.timeDiscountAmount)} USDC (2.00%)`);
console.log(`  -> Fixed Origination Fee: ${stroopsToUsdc(quote.originationFeeAmount)} USDC (0.50%)`);
console.log(`  -> Total Factoring Discount: ${stroopsToUsdc(quote.totalDiscount)} USDC`);
console.log(`  -> NET INSTANT CASH ADVANCE TO MERCHANT: ${stroopsToUsdc(quote.netPayout)} USDC`);
console.log(`  -> Atomic Transaction: Invoice legal ownership transferred to Escrow; USDC transferred to merchant.`);
console.log(`  -> Invoice Status: Factored (2)`);

console.log(`\n[STEP 5] MATURITY SETTLEMENT & MULTI-TRANCHE YIELD WATERFALL`);
console.log(`  -> 73 days elapse. Debtor repays full face value of 100,000.0000000 USDC.`);
console.log(`  -> Capital Routing:`);
console.log(`     - Principal Repayment to Pool: ${stroopsToUsdc(quote.netPayout)} USDC`);
console.log(`     - Gross Factoring Yield: ${stroopsToUsdc(quote.totalDiscount)} USDC`);

const grossYieldStroops = quote.totalDiscount;
const treasuryCut = (grossYieldStroops * 1000n) / 10000n; // 10%
const netLpYield = grossYieldStroops - treasuryCut; // 90%
const juniorYield = (netLpYield * 3000n) / 10000n; // 30%
const seniorYield = netLpYield - juniorYield; // 70%

console.log(`     - Protocol Treasury Cut (10% Reserve Factor): ${stroopsToUsdc(treasuryCut)} USDC`);
console.log(`     - Net LP Factoring Yield (90% Distributed): ${stroopsToUsdc(netLpYield)} USDC`);
console.log(`     - Junior Tranche Share (30% Outsized Yield): ${stroopsToUsdc(juniorYield)} USDC`);
console.log(`     - Senior Tranche Share (70% Protected Yield): ${stroopsToUsdc(seniorYield)} USDC`);
console.log(`  -> Invoice Status: Settled (3)`);

console.log(`\n[STEP 6] INVESTOR CAPITAL & APY REDEMPTION VERIFICATION`);
const newSeniorAssets = seniorDeposit + seniorYield;
const newJuniorAssets = juniorDeposit + juniorYield;
const seniorSharePrice = (newSeniorAssets * 10_000_000n) / seniorDeposit;
const juniorSharePrice = (newJuniorAssets * 10_000_000n) / juniorDeposit;

console.log(`  -> Senior Vault Net Asset Value: ${stroopsToUsdc(newSeniorAssets)} USDC (Share Price Index: ${(Number(seniorSharePrice) / 1e7).toFixed(6)})`);
console.log(`  -> Junior Vault Net Asset Value: ${stroopsToUsdc(newJuniorAssets)} USDC (Share Price Index: ${(Number(juniorSharePrice) / 1e7).toFixed(6)})`);
console.log(`  -> Annualized Senior Return: ${(Number(seniorYield) / Number(seniorDeposit) * 365 / 73 * 100).toFixed(2)}% APR`);
console.log(`  -> Annualized Junior Return: ${(Number(juniorYield) / Number(juniorDeposit) * 365 / 73 * 100).toFixed(2)}% APR`);

console.log(`\n[STEP 7] DELINQUENCY & FIRST-LOSS ABSORPTION STRESS TEST (DEFAULT SCENARIO)`);
console.log(`  -> Simulating a subsequent $15,000.00 USDC invoice default.`);
const defaultLoss = usdcToStroops(15000);
const juniorAbsorption = defaultLoss <= newJuniorAssets ? defaultLoss : newJuniorAssets;
const seniorAbsorption = defaultLoss - juniorAbsorption;
const juniorPostDefault = newJuniorAssets - juniorAbsorption;
const seniorPostDefault = newSeniorAssets - seniorAbsorption;

console.log(`  -> Default Write-Off Amount: ${stroopsToUsdc(defaultLoss)} USDC`);
console.log(`  -> Junior First-Loss Tranche absorbs: ${stroopsToUsdc(juniorAbsorption)} USDC (100% of loss!)`);
console.log(`  -> Senior Tranche absorbs: ${stroopsToUsdc(seniorAbsorption)} USDC (0% loss - 100% CAPITAL PROTECTED!)`);
console.log(`  -> Remaining Junior Capital: ${stroopsToUsdc(juniorPostDefault)} USDC`);
console.log(`  -> Remaining Senior Capital: ${stroopsToUsdc(seniorPostDefault)} USDC`);

console.log(`\n[STEP 8] 10% DEPLOYED CAPITAL COVERAGE GUARD (FINDING F-3)`);
const deployedAdvances = usdcToStroops(40000); // 40k active advances
const requiredJuniorCoverage = (deployedAdvances * 1000n) / 10000n; // 10% = 4k USDC
console.log(`  -> Outstanding Deployed Advances: ${stroopsToUsdc(deployedAdvances)} USDC`);
console.log(`  -> Mandatory 10% Junior Capital Floor: ${stroopsToUsdc(requiredJuniorCoverage)} USDC`);
console.log(`  -> Junior Capital Available: ${stroopsToUsdc(juniorPostDefault)} USDC`);
console.log(`  -> Maximum Permitted Junior Withdrawal: ${stroopsToUsdc(juniorPostDefault - requiredJuniorCoverage)} USDC`);
console.log(`  -> Full Junior Withdrawal Attempt: REJECTED with JuniorCoverageTooLow (Safety Guard Active).`);

console.log('\n' + '='.repeat(80));
console.log('   RESULT: ALL 8 PHASES COMPUTED (OFFLINE)');
console.log('='.repeat(80));
