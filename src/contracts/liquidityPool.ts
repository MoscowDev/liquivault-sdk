import {
  DepositPreview,
  LiquiVaultConfig,
  LPPosition,
  PoolState,
  TransactionResult,
  WithdrawPreview,
} from '../types';
import { LiquiVaultTransactionBuilder } from '../builders/transactionBuilder';
import { StellarRpcHelper } from '../wallet/rpc';

const SHARE_PRICE_SCALE = 10_000_000n;
const BPS_SCALE = 10_000n;

/**
 * Typed client wrapper for the `liquidity_pool` Soroban smart contract.
 */
export class LiquidityPoolClient {
  private readonly config: LiquiVaultConfig;
  private readonly rpc: StellarRpcHelper;
  private readonly builder: LiquiVaultTransactionBuilder;

  constructor(config: LiquiVaultConfig, rpc?: StellarRpcHelper) {
    this.config = config;
    this.rpc = rpc ?? new StellarRpcHelper(config);
    this.builder = new LiquiVaultTransactionBuilder(config);
  }

  /**
   * Deposits USDC into the liquidity pool and mints lvUSDC LP shares.
   */
  public async deposit(
    provider: string,
    amountUsdc: bigint,
    signTransaction: (xdr: string) => Promise<string>
  ): Promise<TransactionResult<bigint>> {
    if (amountUsdc <= 0n) {
      throw new Error('Deposit amount must be greater than zero');
    }
    const txXdr = await this.builder.buildDepositTx(provider, amountUsdc);
    return this.rpc.executeContractCall<bigint>(txXdr, signTransaction);
  }

  /**
   * Burns lvUSDC LP shares and withdraws underlying USDC + accrued yield.
   */
  public async withdraw(
    provider: string,
    sharesToBurn: bigint,
    signTransaction: (xdr: string) => Promise<string>
  ): Promise<TransactionResult<bigint>> {
    if (sharesToBurn <= 0n) {
      throw new Error('Shares to burn must be greater than zero');
    }
    const txXdr = await this.builder.buildWithdrawTx(provider, sharesToBurn);
    return this.rpc.executeContractCall<bigint>(txXdr, signTransaction);
  }

  /**
   * Retrieves the current global state of the USDC Liquidity Pool.
   */
  public async getPoolState(): Promise<PoolState> {
    return this.rpc.simulateViewCall<PoolState>(
      this.config.contracts.liquidityPool,
      'get_pool_state',
      []
    );
  }

  /**
   * Retrieves an investor's LP position and calculates current redemption value.
   */
  public async getLPPosition(provider: string): Promise<LPPosition> {
    return this.rpc.simulateViewCall<LPPosition>(
      this.config.contracts.liquidityPool,
      'get_position',
      [provider]
    );
  }

  /**
   * Converts a USDC deposit amount into expected LP shares based on pool state.
   */
  public convertToShares(assets: bigint, totalAssets: bigint, totalShares: bigint): bigint {
    if (assets <= 0n) throw new Error('Assets must be positive');
    if (totalShares === 0n || totalAssets === 0n) return assets;
    return (assets * totalShares) / totalAssets;
  }

  /**
   * Converts LP shares into redeemable USDC assets based on pool state.
   */
  public convertToAssets(shares: bigint, totalAssets: bigint, totalShares: bigint): bigint {
    if (shares <= 0n) throw new Error('Shares must be positive');
    if (totalShares === 0n) return 0n;
    return (shares * totalAssets) / totalShares;
  }

  /**
   * Previews a USDC deposit including share price and pool share percentage.
   */
  public previewDeposit(assets: bigint, pool: PoolState): DepositPreview {
    const sharesToMint = this.convertToShares(assets, pool.totalAssets, pool.totalShares);
    const sharePrice =
      pool.totalShares === 0n
        ? SHARE_PRICE_SCALE
        : (pool.totalAssets * SHARE_PRICE_SCALE) / pool.totalShares;
    const newTotalShares = pool.totalShares + sharesToMint;
    const poolShareBps =
      newTotalShares === 0n ? 10000 : Number((sharesToMint * BPS_SCALE) / newTotalShares);

    return {
      assetsDeposited: assets,
      sharesToMint,
      effectiveSharePrice: sharePrice,
      poolShareBps,
    };
  }

  /**
   * Previews an LP share withdrawal and checks idle liquidity sufficiency.
   */
  public previewWithdraw(sharesToBurn: bigint, pool: PoolState): WithdrawPreview {
    const assetsToReceive = this.convertToAssets(sharesToBurn, pool.totalAssets, pool.totalShares);
    const sharePrice =
      pool.totalShares === 0n
        ? SHARE_PRICE_SCALE
        : (pool.totalAssets * SHARE_PRICE_SCALE) / pool.totalShares;
    const idleLiquidity = pool.totalAssets - pool.deployedCapital;

    return {
      sharesBurned: sharesToBurn,
      assetsToReceive,
      effectiveSharePrice: sharePrice,
      sufficientIdleLiquidity: assetsToReceive <= idleLiquidity,
    };
  }

  /**
   * Calculates current annualized pool APY in basis points based on utilization and weighted tier APR.
   */
  public calculateCurrentAPY(
    pool: PoolState,
    weightedDiscountRateBps = 1050
  ): { utilizationBps: number; netApyBps: number } {
    if (pool.totalAssets <= 0n) {
      return { utilizationBps: 0, netApyBps: 0 };
    }
    const utilizationBps = Number((pool.deployedCapital * BPS_SCALE) / pool.totalAssets);
    const netFactorBps = 10_000 - pool.reserveFactorBps;
    const grossPoolYieldBps = Math.floor((utilizationBps * weightedDiscountRateBps) / 10_000);
    const netApyBps = Math.floor((grossPoolYieldBps * netFactorBps) / 10_000);
    return { utilizationBps, netApyBps };
  }
}
