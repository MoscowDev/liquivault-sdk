import {
  EscrowRecord,
  FactoringQuote,
  LiquiVaultConfig,
  RISK_TIER_RATES_BPS,
  RiskTier,
  TransactionResult,
} from '../types';
import { LiquiVaultTransactionBuilder } from '../builders/transactionBuilder';
import { StellarRpcHelper } from '../wallet/rpc';

const BPS_DENOMINATOR = 10_000n;
const SECONDS_PER_YEAR = 31_536_000n; // 365 * 86,400

/**
 * Typed client wrapper for the `factoring_escrow` Soroban smart contract.
 */
export class FactoringEscrowClient {
  private readonly config: LiquiVaultConfig;
  private readonly rpc: StellarRpcHelper;
  private readonly builder: LiquiVaultTransactionBuilder;

  constructor(config: LiquiVaultConfig, rpc?: StellarRpcHelper) {
    this.config = config;
    this.rpc = rpc ?? new StellarRpcHelper(config);
    this.builder = new LiquiVaultTransactionBuilder(config);
  }

  /**
   * Computes a deterministic algorithmic factoring quote matching the Soroban contract formula.
   */
  public calculateAlgorithmicDiscount(
    invoiceId: bigint,
    faceValue: bigint,
    riskTier: RiskTier,
    maturityTimestamp: number,
    nowTimestamp = Math.floor(Date.now() / 1000),
    originationFeeBps = 50
  ): FactoringQuote {
    if (faceValue <= 0n) {
      throw new Error('Invoice face value must be positive');
    }
    if (maturityTimestamp <= nowTimestamp) {
      throw new Error('Invoice has already reached or passed maturity');
    }

    const durationSeconds = BigInt(maturityTimestamp - nowTimestamp);
    const annualRateBps = BigInt(RISK_TIER_RATES_BPS[riskTier]);

    const timeDiscountAmount =
      (faceValue * annualRateBps * durationSeconds) / (BPS_DENOMINATOR * SECONDS_PER_YEAR);
    const originationFeeAmount = (faceValue * BigInt(originationFeeBps)) / BPS_DENOMINATOR;
    const totalDiscount = timeDiscountAmount + originationFeeAmount;

    if (totalDiscount >= faceValue) {
      throw new Error('Computed discount exceeds or equals invoice face value');
    }

    const netPayout = faceValue - totalDiscount;
    const effectiveDiscountBps = Number((totalDiscount * BPS_DENOMINATOR) / faceValue);

    return {
      invoiceId,
      faceValue,
      riskTier,
      durationSeconds: Number(durationSeconds),
      annualRateBps: Number(annualRateBps),
      originationFeeBps,
      timeDiscountAmount,
      originationFeeAmount,
      totalDiscount,
      netPayout,
      effectiveDiscountBps,
    };
  }

  /**
   * Executes an atomic swap of a verified invoice for immediate USDC liquidity.
   */
  public async factorInvoice(
    merchant: string,
    invoiceId: bigint,
    signTransaction: (xdr: string) => Promise<string>
  ): Promise<TransactionResult<FactoringQuote>> {
    const txXdr = await this.builder.buildFactorInvoiceTx(merchant, invoiceId);
    return this.rpc.executeContractCall<FactoringQuote>(txXdr, signTransaction);
  }

  /**
   * Settles a factored invoice at maturity by transferring full face value from debtor/payer.
   */
  public async settleInvoice(
    payer: string,
    invoiceId: bigint,
    signTransaction: (xdr: string) => Promise<string>
  ): Promise<TransactionResult<{ lpYield: bigint; protocolCut: bigint }>> {
    const txXdr = await this.builder.buildSettleInvoiceTx(payer, invoiceId);
    return this.rpc.executeContractCall<{ lpYield: bigint; protocolCut: bigint }>(
      txXdr,
      signTransaction
    );
  }

  /**
   * Previews the on-chain factoring quote via Soroban RPC simulation.
   */
  public async previewFactoringQuote(invoiceId: bigint): Promise<FactoringQuote> {
    return this.rpc.simulateViewCall<FactoringQuote>(
      this.config.contracts.factoringEscrow,
      'preview_factoring_quote',
      [invoiceId]
    );
  }

  /**
   * Fetches an on-chain EscrowRecord by invoice ID.
   */
  public async getEscrowRecord(invoiceId: bigint): Promise<EscrowRecord> {
    return this.rpc.simulateViewCall<EscrowRecord>(
      this.config.contracts.factoringEscrow,
      'get_escrow_record',
      [invoiceId]
    );
  }
}
