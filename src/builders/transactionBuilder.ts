import { CreateInvoiceParams, LiquiVaultConfig, RiskTier } from '../types';

export interface BuiltTransactionEnvelope {
  contractId: string;
  method: string;
  signer: string;
  networkPassphrase: string;
  args: unknown[];
  xdr: string;
}

/**
 * Builds deterministic Stellar Soroban contract invocation transactions for LiquiVault operations.
 */
export class LiquiVaultTransactionBuilder {
  private readonly config: LiquiVaultConfig;

  constructor(config: LiquiVaultConfig) {
    this.config = config;
  }

  private encodeEnvelope(
    contractId: string,
    method: string,
    signer: string,
    args: unknown[]
  ): string {
    const payload: BuiltTransactionEnvelope = {
      contractId,
      method,
      signer,
      networkPassphrase: this.config.network.networkPassphrase,
      args: args.map((a) => (typeof a === 'bigint' ? a.toString() : a)),
      xdr: '',
    };
    const serialized = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
    return serialized;
  }

  public decodeEnvelope(xdr: string): BuiltTransactionEnvelope {
    const raw = Buffer.from(xdr, 'base64').toString('utf8');
    return JSON.parse(raw) as BuiltTransactionEnvelope;
  }

  /**
   * Builds a Soroban transaction invoking `invoice_registry.mint_invoice`.
   */
  public async buildMintInvoiceTx(params: CreateInvoiceParams): Promise<string> {
    if (!params.metadataHash || !/^[0-9a-fA-F]{64}$/.test(params.metadataHash)) {
      throw new Error('metadataHash must be a valid 64-character hex SHA-256 digest');
    }
    return this.encodeEnvelope(
      this.config.contracts.invoiceRegistry,
      'mint_invoice',
      params.merchant,
      [
        params.merchant,
        params.debtor,
        params.currency ?? this.config.contracts.usdcToken,
        params.faceValue,
        params.maturityTimestamp,
        params.metadataHash,
        params.invoiceNumber,
        params.riskTier,
      ]
    );
  }

  /**
   * Builds a Soroban transaction invoking `invoice_registry.verify_invoice`.
   */
  public async buildVerifyInvoiceTx(
    caller: string,
    invoiceId: bigint,
    riskTier: RiskTier
  ): Promise<string> {
    return this.encodeEnvelope(
      this.config.contracts.invoiceRegistry,
      'verify_invoice',
      caller,
      [caller, invoiceId, riskTier]
    );
  }

  /**
   * Builds a Soroban transaction invoking `factoring_escrow.factor_invoice`.
   */
  public async buildFactorInvoiceTx(merchant: string, invoiceId: bigint): Promise<string> {
    return this.encodeEnvelope(
      this.config.contracts.factoringEscrow,
      'factor_invoice',
      merchant,
      [merchant, invoiceId]
    );
  }

  /**
   * Builds a Soroban transaction invoking `factoring_escrow.settle_invoice`.
   */
  public async buildSettleInvoiceTx(payer: string, invoiceId: bigint): Promise<string> {
    return this.encodeEnvelope(
      this.config.contracts.factoringEscrow,
      'settle_invoice',
      payer,
      [payer, invoiceId]
    );
  }

  /**
   * Builds a Soroban transaction invoking `liquidity_pool.deposit`.
   */
  public async buildDepositTx(provider: string, amountUsdc: bigint): Promise<string> {
    return this.encodeEnvelope(
      this.config.contracts.liquidityPool,
      'deposit',
      provider,
      [provider, amountUsdc]
    );
  }

  /**
   * Builds a Soroban transaction invoking `liquidity_pool.withdraw`.
   */
  public async buildWithdrawTx(provider: string, sharesToBurn: bigint): Promise<string> {
    return this.encodeEnvelope(
      this.config.contracts.liquidityPool,
      'withdraw',
      provider,
      [provider, sharesToBurn]
    );
  }

  /**
   * Builds a Soroban transaction invoking `liquidity_pool.deposit_junior` (first-loss tranche).
   */
  public async buildDepositJuniorTx(provider: string, amountUsdc: bigint): Promise<string> {
    return this.encodeEnvelope(
      this.config.contracts.liquidityPool,
      'deposit_junior',
      provider,
      [provider, amountUsdc]
    );
  }

  /**
   * Builds a Soroban transaction invoking `liquidity_pool.withdraw_junior`.
   */
  public async buildWithdrawJuniorTx(provider: string, sharesToBurn: bigint): Promise<string> {
    return this.encodeEnvelope(
      this.config.contracts.liquidityPool,
      'withdraw_junior',
      provider,
      [provider, sharesToBurn]
    );
  }

  /**
   * Builds a Soroban transaction invoking `liquidity_pool.set_junior_yield_bps` (admin only).
   */
  public async buildSetJuniorYieldBpsTx(admin: string, bps: number): Promise<string> {
    return this.encodeEnvelope(
      this.config.contracts.liquidityPool,
      'set_junior_yield_bps',
      admin,
      [admin, bps]
    );
  }
}
