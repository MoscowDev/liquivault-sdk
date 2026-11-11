import { describe, expect, it } from 'vitest';
import {
  LiquiVaultConfig,
  LiquiVaultSDK,
  PoolState,
  RiskTier,
} from '../src';

const MOCK_CONFIG: LiquiVaultConfig = {
  network: {
    network: 'testnet',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  },
  contracts: {
    invoiceRegistry: 'CCINVOICEREGISTRY111111111111111111111111111111111111111',
    liquidityPool: 'CCLIQUIDITYPOOL11111111111111111111111111111111111111111',
    factoringEscrow: 'CCFACTORINGESCROW111111111111111111111111111111111111111',
    usdcToken: 'CCUSDCTOKEN111111111111111111111111111111111111111111111',
  },
};

describe('@liquivault/sdk Unit Tests', () => {
  it('computes deterministic 64-char SHA-256 metadata hashes', () => {
    const sdk = new LiquiVaultSDK(MOCK_CONFIG);
    const hash1 = sdk.invoiceRegistry.computeMetadataHash({
      invoiceNumber: 'INV-2026-001',
      amount: 100000,
      debtor: 'Siemens AG',
    });
    const hash2 = sdk.invoiceRegistry.computeMetadataHash({
      debtor: 'Siemens AG',
      amount: 100000,
      invoiceNumber: 'INV-2026-001',
    });
    expect(hash1).toHaveLength(64);
    expect(hash1).toBe(hash2);
  });

  it('calculates algorithmic factoring discount accurately matching Soroban i128 math', () => {
    const sdk = new LiquiVaultSDK(MOCK_CONFIG);
    const now = 1_700_000_000;
    const maturity = now + 86_400 * 73; // 73 days = 0.20 year (1/5 of 365 days)
    const faceValue = 100_000_0000000n; // 100,000 USDC

    // TierB = 1000 bps (10% APR) -> 2.00% for 73 days = 2,000 USDC
    // Origination fee = 50 bps (0.50%) = 500 USDC
    // Total discount = 2,500 USDC; Net Payout = 97,500 USDC
    const quote = sdk.factoringEscrow.calculateAlgorithmicDiscount(
      1n,
      faceValue,
      RiskTier.TierB,
      maturity,
      now,
      50
    );

    expect(quote.timeDiscountAmount).toBe(2_000_0000000n);
    expect(quote.originationFeeAmount).toBe(500_0000000n);
    expect(quote.totalDiscount).toBe(2_500_0000000n);
    expect(quote.netPayout).toBe(97_500_0000000n);
    expect(quote.effectiveDiscountBps).toBe(250);
  });

  it('calculates LP share conversions and real-time APY accurately', () => {
    const sdk = new LiquiVaultSDK(MOCK_CONFIG);
    const mockPool: PoolState = {
      admin: 'GADMIN',
      usdcToken: MOCK_CONFIG.contracts.usdcToken,
      factoringEscrow: MOCK_CONFIG.contracts.factoringEscrow,
      treasury: 'GTREASURY',
      totalAssets: 1_050_000_0000000n, // 1,050,000 USDC (5% yield accrued)
      totalShares: 1_000_000_0000000n, // 1,000,000 lvUSDC shares
      deployedCapital: 840_000_0000000n, // 80% utilization
      cumulativeYield: 50_000_0000000n,
      reserveFactorBps: 1000, // 10% protocol reserve cut
      sharePrice: 10_500_000n,
      utilizationBps: 8000,
      estimatedApyBps: 756,
      paused: false,
    };

    const depositPreview = sdk.liquidityPool.previewDeposit(105_000_0000000n, mockPool);
    expect(depositPreview.sharesToMint).toBe(100_000_0000000n);
    expect(depositPreview.effectiveSharePrice).toBe(10_500_000n);

    const withdrawPreview = sdk.liquidityPool.previewWithdraw(100_000_0000000n, mockPool);
    expect(withdrawPreview.assetsToReceive).toBe(105_000_0000000n);
    expect(withdrawPreview.sufficientIdleLiquidity).toBe(true);

    const apy = sdk.liquidityPool.calculateCurrentAPY(mockPool, 1100);
    expect(apy.utilizationBps).toBe(8000);
    expect(apy.netApyBps).toBe(792); // 80% * 11% * 90% = 7.92%
  });

  describe('junior tranche', () => {
    const pool: PoolState = {
      admin: 'GADMIN',
      usdcToken: MOCK_CONFIG.contracts.usdcToken,
      factoringEscrow: MOCK_CONFIG.contracts.factoringEscrow,
      treasury: 'GTREASURY',
      totalAssets: 60_000_0000000n,
      totalShares: 60_000_0000000n,
      deployedCapital: 50_000_0000000n,
      cumulativeYield: 0n,
      reserveFactorBps: 1000,
      paused: false,
    };
    const junior = { totalAssets: 20_000_0000000n, totalShares: 20_000_0000000n };

    it('splits yield like the contract (10% cut, 30% of LP yield to junior)', () => {
      const sdk = new LiquiVaultSDK(MOCK_CONFIG);
      const split = sdk.liquidityPool.splitYield(2_000_0000000n, 1000, junior, pool.totalAssets);
      expect(split.protocolCut).toBe(200_0000000n);
      expect(split.juniorYield).toBe(450_0000000n);
      expect(split.seniorYield).toBe(1_350_0000000n);
    });

    it('gives senior all LP yield when junior is empty', () => {
      const sdk = new LiquiVaultSDK(MOCK_CONFIG);
      const split = sdk.liquidityPool.splitYield(1_000_0000000n, 1000, {
        totalAssets: 0n,
        totalShares: 0n,
      }, pool.totalAssets);
      expect(split.juniorYield).toBe(0n);
      expect(split.seniorYield).toBe(900_0000000n);
    });

    it('applies losses to junior first', () => {
      const sdk = new LiquiVaultSDK(MOCK_CONFIG);
      expect(sdk.liquidityPool.splitLoss(15_000_0000000n, junior)).toEqual({
        juniorLoss: 15_000_0000000n,
        seniorLoss: 0n,
      });
      expect(sdk.liquidityPool.splitLoss(25_000_0000000n, junior)).toEqual({
        juniorLoss: 20_000_0000000n,
        seniorLoss: 5_000_0000000n,
      });
    });

    it('previews junior withdrawals against the 10% coverage rule', () => {
      const sdk = new LiquiVaultSDK(MOCK_CONFIG);
      // Deployed 50k -> junior must keep >= 5k.
      const half = sdk.liquidityPool.previewWithdrawJunior(10_000_0000000n, pool, junior);
      expect(half.coverageSatisfied).toBe(true);
      expect(half.assetsToReceive).toBe(10_000_0000000n);
      expect(half.sufficientIdleLiquidity).toBe(true);

      const all = sdk.liquidityPool.previewWithdrawJunior(20_000_0000000n, pool, junior);
      expect(all.coverageSatisfied).toBe(false);
    });

    it('counts junior assets as idle liquidity for senior withdrawals', () => {
      const sdk = new LiquiVaultSDK(MOCK_CONFIG);
      const tight = { ...pool, deployedCapital: 70_000_0000000n };
      expect(
        sdk.liquidityPool.previewWithdraw(5_000_0000000n, tight).sufficientIdleLiquidity
      ).toBe(false);
      expect(
        sdk.liquidityPool.previewWithdraw(5_000_0000000n, tight, junior).sufficientIdleLiquidity
      ).toBe(true);
    });
  });
    it('generates authentic native Soroban InvokeHostFunction operation XDR using @stellar/stellar-sdk', () => {
      const sdk = new LiquiVaultSDK(MOCK_CONFIG);
      // Valid contract address on Stellar
      const contractId = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';
      const opXdr = sdk.builder.buildOperationXdr(contractId, 'deposit_junior', [
        'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
        500_0000000n,
      ]);
      expect(typeof opXdr).toBe('string');
      expect(opXdr.length).toBeGreaterThan(20);
      
      const op = sdk.builder.buildOperation(contractId, 'deposit_junior', [
        'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
        500_0000000n,
      ]);
      expect(op.body.type).toBe('invokeHostFunction');
    });});
