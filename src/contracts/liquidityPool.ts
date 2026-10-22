import {
  DepositPreview,
  JuniorState,
  JuniorWithdrawPreview,
  LossSplit,
  YieldSplit,
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
  public previewWithdraw(sharesToBurn: bigint, pool: PoolState, junior?: JuniorState): WithdrawPreview {
    const assetsToReceive = this.convertToAssets(sharesToBurn, pool.totalAssets, pool.totalShares);
    const sharePrice =
      pool.totalShares === 0n
        ? SHARE_PRICE_SCALE
        : (pool.totalAssets * SHARE_PRICE_SCALE) / pool.totalShares;
    const idleLiquidity = pool.totalAssets + (junior?.totalAssets ?? 0n) - pool.deployedCapital;

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

  // ---------------------------------------------------------------------------
  // Junior (first-loss) tranche
  // ---------------------------------------------------------------------------

  /** Junior capital must stay >= this share of deployed capital (mirrors the contract). */
  public static readonly JUNIOR_MIN_COVERAGE_BPS = 1_000n;
  /** Default share of LP yield paid to junior while it holds capital (mirrors the contract). */
  public static readonly DEFAULT_JUNIOR_YIELD_BPS = 3_000n;

  /**
   * Deposits USDC into the junior (first-loss) tranche. Junior capital absorbs defaults first
   * and earns a larger share of LP yield in return.
   */
  public async depositJunior(
    provider: string,
    amountUsdc: bigint,
    signTransaction: (xdr: string) => Promise<string>
  ): Promise<TransactionResult<bigint>> {
    if (amountUsdc <= 0n) {
      throw new Error('Deposit amount must be greater than zero');
    }
    const txXdr = await this.builder.buildDepositJuniorTx(provider, amountUsdc);
    return this.rpc.executeContractCall<bigint>(txXdr, signTransaction);
  }

  /**
   * Burns junior shares and withdraws USDC. The contract rejects withdrawals that would leave
   * junior capital below the coverage requirement; use `previewWithdrawJunior` first.
   */
  public async withdrawJunior(
    provider: string,
    sharesToBurn: bigint,
    signTransaction: (xdr: string) => Promise<string>
  ): Promise<TransactionResult<bigint>> {
    if (sharesToBurn <= 0n) {
      throw new Error('Shares to burn must be greater than zero');
    }
    const txXdr = await this.builder.buildWithdrawJuniorTx(provider, sharesToBurn);
    return this.rpc.executeContractCall<bigint>(txXdr, signTransaction);
  }

  /** Retrieves the junior tranche totals. */
  public async getJuniorState(): Promise<JuniorState> {
    return this.rpc.simulateViewCall<JuniorState>(
      this.config.contracts.liquidityPool,
      'get_junior_state',
      []
    );
  }

  /** Retrieves an investor's junior tranche position. */
  public async getJuniorPosition(provider: string): Promise<LPPosition> {
    return this.rpc.simulateViewCall<LPPosition>(
      this.config.contracts.liquidityPool,
      'get_junior_position',
      [provider]
    );
  }

  /**
   * Previews a junior share withdrawal, including the 10% coverage rule and idle liquidity
   * (idle liquidity is senior + junior assets minus deployed capital).
   */
  public previewWithdrawJunior(
    sharesToBurn: bigint,
    pool: PoolState,
    junior: JuniorState
  ): JuniorWithdrawPreview {
    const assetsToReceive = this.convertToAssets(sharesToBurn, junior.totalAssets, junior.totalShares);
    const sharePrice =
      junior.totalShares === 0n
        ? SHARE_PRICE_SCALE
        : (junior.totalAssets * SHARE_PRICE_SCALE) / junior.totalShares;
    const idleLiquidity = pool.totalAssets + junior.totalAssets - pool.deployedCapital;
    const remainingJuniorAssets = junior.totalAssets - assetsToReceive;
    const coverageSatisfied =
      remainingJuniorAssets * BPS_SCALE >=
      pool.deployedCapital * LiquidityPoolClient.JUNIOR_MIN_COVERAGE_BPS;

    return {
      sharesBurned: sharesToBurn,
      assetsToReceive,
      effectiveSharePrice: sharePrice,
      sufficientIdleLiquidity: assetsToReceive <= idleLiquidity,
      coverageSatisfied,
      remainingJuniorAssets,
    };
  }

  /**
   * Splits gross invoice yield into protocol cut, junior yield and senior yield, matching
   * `repay_liquidity`. With no junior capital, senior receives all LP yield.
   */
  public splitYield(
    grossYield: bigint,
    reserveFactorBps: number,
    junior: JuniorState,
    juniorYieldBps: bigint = LiquidityPoolClient.DEFAULT_JUNIOR_YIELD_BPS
  ): YieldSplit {
    const protocolCut = (grossYield * BigInt(reserveFactorBps)) / BPS_SCALE;
    const lpYield = grossYield - protocolCut;
    const juniorYield = junior.totalAssets > 0n ? (lpYield * juniorYieldBps) / BPS_SCALE : 0n;
    return { juniorYield, seniorYield: lpYield - juniorYield, protocolCut };
  }

  /**
   * Splits a default loss between tranches, matching `write_off_default`: junior absorbs first.
   */
  public splitLoss(defaultedPrincipal: bigint, junior: JuniorState): LossSplit {
    const juniorLoss =
      defaultedPrincipal < junior.totalAssets ? defaultedPrincipal : junior.totalAssets;
    return { juniorLoss, seniorLoss: defaultedPrincipal - juniorLoss };
  }}
