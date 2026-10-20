import { LiquiVaultConfig } from './types';
import { InvoiceRegistryClient } from './contracts/invoiceRegistry';
import { LiquidityPoolClient } from './contracts/liquidityPool';
import { FactoringEscrowClient } from './contracts/factoringEscrow';
import { LiquiVaultTransactionBuilder } from './builders/transactionBuilder';
import { FreighterWalletAdapter } from './wallet/freighter';
import { RpcTransportHandler, StellarRpcHelper } from './wallet/rpc';

export * from './types';
export * from './contracts';
export * from './builders';
export * from './wallet';

/**
 * Unified SDK facade for interacting with the LiquiVault protocol on Stellar Soroban.
 */
export class LiquiVaultSDK {
  public readonly config: LiquiVaultConfig;
  public readonly rpc: StellarRpcHelper;
  public readonly builder: LiquiVaultTransactionBuilder;
  public readonly wallet: FreighterWalletAdapter;
  public readonly invoiceRegistry: InvoiceRegistryClient;
  public readonly liquidityPool: LiquidityPoolClient;
  public readonly factoringEscrow: FactoringEscrowClient;

  constructor(config: LiquiVaultConfig, customTransport?: RpcTransportHandler) {
    this.config = config;
    this.rpc = new StellarRpcHelper(config, customTransport);
    this.builder = new LiquiVaultTransactionBuilder(config);
    this.wallet = new FreighterWalletAdapter(config.network.networkPassphrase);
    this.invoiceRegistry = new InvoiceRegistryClient(config, this.rpc);
    this.liquidityPool = new LiquidityPoolClient(config, this.rpc);
    this.factoringEscrow = new FactoringEscrowClient(config, this.rpc);
  }
}
