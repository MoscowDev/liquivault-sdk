/**
 * @module @liquivault/sdk/types
 * Core domain types, interfaces, and enums for the LiquiVault RWA Invoice Factoring Protocol.
 */

/**
 * Risk tier assigned to a debtor/invoice based on credit assessment and payment history.
 * Determines the annual discount rate in basis points (bps).
 */
export enum RiskTier {
  /** Prime corporate debtor: 600 bps (6.00% APR) */
  TierA = 'TierA',
  /** Mid-market debtor: 1000 bps (10.00% APR) */
  TierB = 'TierB',
  /** Emerging SME debtor: 1500 bps (15.00% APR) */
  TierC = 'TierC',
}

/**
 * Annualized discount rate in basis points mapped per RiskTier.
 */
export const RISK_TIER_RATES_BPS: Record<RiskTier, number> = {
  [RiskTier.TierA]: 600,
  [RiskTier.TierB]: 1000,
  [RiskTier.TierC]: 1500,
};

/**
 * Lifecycle state of an on-chain tokenized invoice.
 */
export enum InvoiceStatus {
  /** Minted on-chain by merchant, awaiting debtor or oracle verification */
  Issued = 'Issued',
  /** Cryptographically verified by debtor/oracle, eligible for factoring */
  Verified = 'Verified',
  /** Factored into the LiquiVault Escrow; upfront USDC paid to merchant */
  Factored = 'Factored',
  /** Repaid in full by debtor at maturity; yield distributed to LP vault */
  Settled = 'Settled',
  /** Past maturity grace period without full repayment */
  Defaulted = 'Defaulted',
}

/**
 * Canonical on-chain invoice record stored in the `invoice_registry` Soroban contract.
 */
export interface InvoiceRecord {
  /** Unique numeric identifier of the invoice */
  invoiceId: bigint;
  /** Stellar public key (G...) of the issuing merchant */
  merchant: string;
  /** Stellar public key (G...) of the obligated corporate debtor */
  debtor: string;
  /** Current owner of the invoice claim (merchant or factoring escrow contract C...) */
  owner: string;
  /** Gross face value in 7-decimal stroops / USDC smallest units (1 USDC = 10_000_000) */
  faceValue: bigint;
  /** Advance payout received upon factoring (0n before factoring) */
  advanceAmount: bigint;
  /** Protocol reserve fee held or collected in stroops */
  protocolFee: bigint;
  /** Unix timestamp (seconds) when invoice was issued */
  issuedAt: number;
  /** Unix timestamp (seconds) when invoice payment is due */
  dueDate: number;
  /** Assigned debtor risk tier */
  riskTier: RiskTier;
  /** Current lifecycle status */
  status: InvoiceStatus;
  /** SHA-256 hex digest (64 hex chars / 32 bytes) of off-chain ERP/PDF invoice document */
  metadataHash: string;
  /** External ERP invoice reference code (e.g. "INV-2025-0084") */
  referenceCode: string;
}

/**
 * Input parameters required to tokenize (mint) a new RWA invoice on-chain.
 */
export interface CreateInvoiceParams {
  /** Stellar address of the issuing merchant */
  merchant: string;
  /** Stellar address of the debtor */
  debtor: string;
  /** Face value in USDC stroops (e.g., 10_000_0000000n for $10,000.00 USDC) */
  faceValue: bigint;
  /** Maturity Unix timestamp in seconds */
  dueDate: number;
  /** Debtor credit risk tier */
  riskTier: RiskTier;
  /** Raw metadata string or precomputed 64-char hex SHA-256 hash */
  metadataHash: string;
  /** Human-readable ERP invoice reference */
  referenceCode: string;
}

/**
 * Detailed pricing quote returned before executing an atomic factoring swap.
 */
export interface FactoringQuote {
  /** Target invoice ID */
  invoiceId: bigint;
  /** Gross face value of the invoice (stroops) */
  faceValue: bigint;
  /** Number of days remaining until maturity */
  daysToMaturity: number;
  /** Annual discount rate in basis points (bps) for the invoice's risk tier */
  annualRateBps: number;
  /** Effective discount rate in basis points prorated for duration */
  effectiveDiscountBps: number;
  /** Total LP discount (yield earned by liquidity providers at maturity) */
  discountAmount: bigint;
  /** Protocol reserve fee (50 bps = 0.50% of face value) */
  protocolFee: bigint;
  /** Net immediate USDC payout transferred to merchant */
  netAdvancePayout: bigint;
  /** Implied annualized yield (APY %) for liquidity providers on this invoice */
  impliedLpAprPercent: number;
}

/**
 * Record of an active or settled factoring escrow agreement in `factoring_escrow`.
 */
export interface EscrowRecord {
  /** Associated invoice ID */
  invoiceId: bigint;
  /** Original merchant who factored the invoice */
  merchant: string;
  /** Obligated debtor expected to settle at maturity */
  debtor: string;
  /** Gross face value due at settlement */
  faceValue: bigint;
  /** Net USDC advance disbursed to merchant at factoring time */
  advancePaid: bigint;
  /** Discount yield owed to the Liquidity Pool upon settlement */
  lpYieldAmount: bigint;
  /** Protocol treasury fee amount */
  protocolFeeAmount: bigint;
  /** Unix timestamp when the invoice was factored */
  factoredAt: number;
  /** Maturity Unix timestamp */
  dueDate: number;
  /** Whether the debtor has completed repayment */
  isSettled: boolean;
  /** Unix timestamp of settlement (if settled) */
  settledAt?: number;
}

/**
 * Global state of the `liquidity_pool` Soroban vault contract.
 */
export interface PoolState {
  /** Total liquid USDC currently available in the pool (stroops) */
  availableLiquidity: bigint;
  /** Total principal currently deployed in active factored invoices (stroops) */
  deployedCapital: bigint;
  /** Cumulative realized yield distributed to LPs (stroops) */
  totalRealizedYield: bigint;
  /** Total managed assets (availableLiquidity + deployedCapital) */
  totalAssets: bigint;
  /** Total supply of LV-LP vault shares in circulation */
  totalShares: bigint;
  /** Current exchange rate of 1 LV-LP share in USDC (scaled by 1e7) */
  sharePriceStroops: bigint;
  /** Pool utilization ratio in basis points (0 - 10000) */
  utilizationBps: number;
  /** Current weighted average APY in basis points */
  currentApyBps: number;
  /** Total protocol reserve accumulated */
  protocolReserve: bigint;
}

/**
 * Liquidity Provider (LP) account position within the LiquiVault USDC pool.
 */
export interface LPPosition {
  /** LP Stellar account address */
  provider: string;
  /** LV-LP share balance owned by the provider */
  shares: bigint;
  /** Current underlying USDC value of the provider's shares */
  underlyingUsdcValue: bigint;
  /** Historical net deposited USDC principal */
  depositedPrincipal: bigint;
  /** Unrealized + realized net yield accrued in USDC stroops */
  accruedYield: bigint;
  /** Percentage share of the entire pool (0 - 100) */
  poolSharePercent: number;
  /** Timestamp of last deposit ( enables cooldown checks if configured) */
  lastDepositAt: number;
}

/**
 * Preview result for depositing USDC into the liquidity pool.
 */
export interface DepositPreview {
  /** USDC amount to deposit (stroops) */
  assetsIn: bigint;
  /** LV-LP shares to be minted */
  sharesToMint: bigint;
  /** Effective share price in USDC */
  sharePrice: number;
  /** Pool utilization after deposit (bps) */
  postDepositUtilizationBps: number;
}

/**
 * Preview result for redeeming LV-LP shares from the liquidity pool.
 */
export interface WithdrawPreview {
  /** LV-LP shares to burn */
  sharesToBurn: bigint;
  /** Net USDC assets to receive (stroops) */
  assetsOut: bigint;
  /** Whether sufficient liquid USDC is immediately available in the pool */
  hasSufficientLiquidity: boolean;
  /** Maximum withdrawable USDC right now given active invoice utilization */
  maxImmediateWithdrawAssets: bigint;
}

/**
 * Aggregated protocol-wide analytics for dashboards and monitoring.
 */
export interface ProtocolAnalytics {
  /** Total number of invoices minted */
  totalInvoicesMinted: number;
  /** Total cumulative volume of invoices factored (stroops) */
  totalFactoredVolume: bigint;
  /** Total cumulative volume settled (stroops) */
  totalSettledVolume: bigint;
  /** Current pool state snapshot */
  poolState: PoolState;
  /** Default rate in basis points */
  defaultRateBps: number;
}

/**
 * Network configuration for connecting to Stellar Soroban RPC & Horizon.
 */
export interface NetworkConfig {
  /** Stellar network passphrase (e.g., Networks.TESTNET or Networks.PUBLIC) */
  networkPassphrase: string;
  /** Soroban JSON-RPC endpoint URL */
  rpcUrl: string;
  /** Stellar Horizon REST API endpoint URL */
  horizonUrl: string;
  /** Default transaction fee in stroops (default: 100000 = 0.01 XLM) */
  defaultFeeStroops?: string;
  /** Default transaction timeout in seconds (default: 60) */
  defaultTimeoutSeconds?: number;
}

/**
 * Contract deployment addresses for the LiquiVault suite on Soroban.
 */
export interface ContractAddresses {
  /** `invoice_registry` Soroban contract ID (C...) */
  invoiceRegistryId: string;
  /** `liquidity_pool` Soroban contract ID (C...) */
  liquidityPoolId: string;
  /** `factoring_escrow` Soroban contract ID (C...) */
  factoringEscrowId: string;
  /** USDC SAC (Stellar Asset Contract) address (C...) */
  usdcTokenId: string;
}

/**
 * Unified configuration object for initializing `LiquiVaultSDK`.
 */
export interface LiquiVaultConfig {
  /** Network RPC & passphrase settings */
  network: NetworkConfig;
  /** Deployed Soroban smart contract addresses */
  contracts: ContractAddresses;
}

/**
 * Result of simulating a Soroban transaction via RPC before signing/submitting.
 */
export interface SimulationResult<T = unknown> {
  /** Whether simulation succeeded without contract errors */
  success: boolean;
  /** Decoded return value from the contract invocation (if any) */
  returnValue?: T;
  /** Raw XDR of the prepared/assembled transaction including footprint & auth */
  preparedTransactionXdr?: string;
  /** Estimated resource fee in stroops */
  minResourceFee?: string;
  /** Diagnostic error message if simulation failed */
  error?: string;
}

/**
 * Finalized transaction execution result on the Stellar network.
 */
export interface TransactionResult<T = unknown> {
  /** Transaction hash (64 hex chars) */
  txHash: string;
  /** Execution status ('SUCCESS' | 'FAILED' | 'NOT_FOUND') */
  status: 'SUCCESS' | 'FAILED' | 'NOT_FOUND';
  /** Ledger sequence number in which the tx was included */
  ledger?: number;
  /** Decoded contract return value */
  returnValue?: T;
  /** Raw result Meta XDR */
  resultMetaXdr?: string;
  /** Error message if failed */
  error?: string;
}
