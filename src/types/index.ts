/**
 * @module @liquivault/sdk/types
 * Core domain types, interfaces, and enums for the LiquiVault RWA Invoice Factoring Protocol.
 */

export enum RiskTier {
  /** Prime corporate debtor: 600 bps (6.00% APR) */
  TierA = 'TierA',
  /** Mid-market debtor: 1000 bps (10.00% APR) */
  TierB = 'TierB',
  /** Emerging SME debtor: 1500 bps (15.00% APR) */
  TierC = 'TierC',
}

export const RISK_TIER_RATES_BPS: Record<RiskTier, number> = {
  [RiskTier.TierA]: 600,
  [RiskTier.TierB]: 1000,
  [RiskTier.TierC]: 1500,
};

export enum InvoiceStatus {
  Issued = 'Issued',
  Verified = 'Verified',
  Factored = 'Factored',
  Settled = 'Settled',
  Defaulted = 'Defaulted',
}

export interface InvoiceRecord {
  invoiceId: bigint;
  merchant: string;
  debtor: string;
  owner: string;
  faceValue: bigint;
  advanceAmount?: bigint;
  discountBps?: number;
  issuedAt: number;
  maturityTimestamp: number;
  metadataHash: string;
  invoiceNumber: string;
  riskTier: RiskTier;
  status: InvoiceStatus;
  currency: string;
}

export interface CreateInvoiceParams {
  merchant: string;
  debtor: string;
  currency?: string;
  faceValue: bigint;
  maturityTimestamp: number;
  metadataHash: string;
  invoiceNumber: string;
  riskTier: RiskTier;
}

export interface FactoringQuote {
  invoiceId: bigint;
  faceValue: bigint;
  riskTier: RiskTier;
  durationSeconds: number;
  annualRateBps: number;
  originationFeeBps: number;
  timeDiscountAmount: bigint;
  originationFeeAmount: bigint;
  totalDiscount: bigint;
  netPayout: bigint;
  effectiveDiscountBps: number;
}

export enum EscrowStatus {
  Active = 'Active',
  Settled = 'Settled',
  Defaulted = 'Defaulted',
}

export interface EscrowRecord {
  invoiceId: bigint;
  merchant: string;
  debtor: string;
  faceValue: bigint;
  netPayout: bigint;
  totalDiscount: bigint;
  riskTier: RiskTier;
  factoredAt: number;
  maturityTimestamp: number;
  settledAt: number;
  status: EscrowStatus;
}

export interface PoolState {
  admin: string;
  usdcToken: string;
  factoringEscrow: string;
  treasury: string;
  totalAssets: bigint;
  totalShares: bigint;
  deployedCapital: bigint;
  cumulativeYield: bigint;
  reserveFactorBps: number;
  sharePrice?: bigint;
  utilizationBps?: number;
  estimatedApyBps?: number;
  paused: boolean;
}

export interface LPPosition {
  provider: string;
  shares: bigint;
  depositedUsdc: bigint;
  lastDepositTimestamp: number;
}

export interface DepositPreview {
  assetsDeposited: bigint;
  sharesToMint: bigint;
  effectiveSharePrice: bigint;
  poolShareBps: number;
}

export interface WithdrawPreview {
  sharesBurned: bigint;
  assetsToReceive: bigint;
  effectiveSharePrice: bigint;
  sufficientIdleLiquidity: boolean;
}

export interface ProtocolAnalytics {
  tvlUsdc: bigint;
  totalFactoredVolumeUsdc: bigint;
  activeEscrowCount: number;
  currentApyBps: number;
  utilizationBps: number;
  defaultRateBps: number;
}

export interface NetworkConfig {
  network: 'testnet' | 'mainnet' | 'standalone';
  rpcUrl: string;
  horizonUrl: string;
  networkPassphrase: string;
}

export interface ContractAddresses {
  invoiceRegistry: string;
  liquidityPool: string;
  factoringEscrow: string;
  usdcToken: string;
}

export interface LiquiVaultConfig {
  network: NetworkConfig;
  contracts: ContractAddresses;
}

export interface SimulationResult<T = unknown> {
  success: boolean;
  returnValue: T;
  minResourceFeeStroops: string;
  error?: string;
}

export interface TransactionResult<T = unknown> {
  txHash: string;
  status: 'SUCCESS' | 'FAILED';
  ledger: number;
  returnValue: T;
  feeChargedStroops: string;
}

/** First-loss (junior) tranche of the liquidity pool. Senior capital is tracked in `PoolState`. */
export interface JuniorState {
  totalAssets: bigint;
  totalShares: bigint;
}

export interface JuniorWithdrawPreview extends WithdrawPreview {
  /** True if the withdrawal leaves junior capital >= 10% of deployed capital. */
  coverageSatisfied: boolean;
  /** Junior capital remaining after the withdrawal. */
  remainingJuniorAssets: bigint;
}

export interface YieldSplit {
  juniorYield: bigint;
  seniorYield: bigint;
  protocolCut: bigint;
}

export interface LossSplit {
  juniorLoss: bigint;
  seniorLoss: bigint;
}

export interface RateConfig {
  tierAAnnualBps: number;
  tierBAnnualBps: number;
  tierCAnnualBps: number;
  originationFeeBps: number;
  gracePeriodSeconds: bigint;
}
