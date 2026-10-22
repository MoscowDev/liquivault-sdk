import { createHash } from 'crypto';
import {
  CreateInvoiceParams,
  InvoiceRecord,
  InvoiceStatus,
  LiquiVaultConfig,
  RiskTier,
  TransactionResult,
} from '../types';
import { LiquiVaultTransactionBuilder } from '../builders/transactionBuilder';
import { StellarRpcHelper } from '../wallet/rpc';

/**
 * Typed client wrapper for the `invoice_registry` Soroban smart contract.
 */
export class InvoiceRegistryClient {
  private readonly config: LiquiVaultConfig;
  private readonly rpc: StellarRpcHelper;
  private readonly builder: LiquiVaultTransactionBuilder;

  constructor(config: LiquiVaultConfig, rpc?: StellarRpcHelper) {
    this.config = config;
    this.rpc = rpc ?? new StellarRpcHelper(config);
    this.builder = new LiquiVaultTransactionBuilder(config);
  }

  /**
   * Computes a deterministic 32-byte SHA-256 hex digest from canonical invoice metadata.
   */
  public computeMetadataHash(metadataJson: string | Record<string, unknown>): string {
    const payload =
      typeof metadataJson === 'string'
        ? metadataJson
        : JSON.stringify(metadataJson, Object.keys(metadataJson).sort());
    return createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Builds, simulates, signs, and submits a `mint_invoice` Soroban transaction.
   */
  public async createInvoice(
    params: CreateInvoiceParams,
    signTransaction: (xdr: string) => Promise<string>
  ): Promise<TransactionResult<bigint>> {
    if (params.faceValue <= 0n) {
      throw new Error('Invoice faceValue must be strictly positive');
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (params.maturityTimestamp <= nowSec) {
      throw new Error('Invoice maturityTimestamp must be in the future');
    }
    if (params.merchant === params.debtor) {
      throw new Error('Merchant and debtor cannot be the same Stellar address');
    }

    const txXdr = await this.builder.buildMintInvoiceTx(params);
    return this.rpc.executeContractCall<bigint>(txXdr, signTransaction);
  }

  /**
   * Builds and submits a `verify_invoice` transaction by an authorized verifier oracle or the admin (the debtor is not authorized).
   */
  public async verifyInvoice(
    caller: string,
    invoiceId: bigint,
    riskTier: RiskTier,
    signTransaction: (xdr: string) => Promise<string>
  ): Promise<TransactionResult<boolean>> {
    const txXdr = await this.builder.buildVerifyInvoiceTx(caller, invoiceId, riskTier);
    return this.rpc.executeContractCall<boolean>(txXdr, signTransaction);
  }

  /**
   * Queries an on-chain `InvoiceRecord` by ID via Soroban RPC simulation.
   */
  public async getInvoice(invoiceId: bigint): Promise<InvoiceRecord> {
    return this.rpc.simulateViewCall<InvoiceRecord>(
      this.config.contracts.invoiceRegistry,
      'get_invoice',
      [invoiceId]
    );
  }

  /**
   * Lists all invoice IDs minted by a merchant address.
   */
  public async getMerchantInvoices(merchant: string): Promise<bigint[]> {
    return this.rpc.simulateViewCall<bigint[]>(
      this.config.contracts.invoiceRegistry,
      'get_merchant_invoices',
      [merchant]
    );
  }

  /**
   * Verifies whether `candidateAddress` is the current on-chain owner of `invoiceId`.
   */
  public async verifyOwnership(invoiceId: bigint, candidateAddress: string): Promise<boolean> {
    const invoice = await this.getInvoice(invoiceId);
    return invoice.owner === candidateAddress;
  }

  /**
   * Checks whether an invoice is eligible for immediate factoring.
   */
  public isFactorable(invoice: InvoiceRecord, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
    return (
      invoice.status === InvoiceStatus.Verified &&
      invoice.maturityTimestamp > nowSeconds &&
      invoice.faceValue > 0n
    );
  }
}
