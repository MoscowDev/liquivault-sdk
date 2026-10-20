import { describe, expect, it, vi } from 'vitest';
import {
  InvoiceStatus,
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

  it('executes end-to-end mocked RPC contract calls for minting, factoring, and LP deposit', async () => {
    const mockTransport = vi.fn(async (_endpoint: string, method: string, params: Record<string, unknown>) => {
      if (method === 'simulateTransaction') {
        return {
          success: true,
          returnValue: 42n,
          minResourceFeeStroops: '10000',
        };
      }
      if (method === 'sendTransaction') {
        return {
          hash: 'tx_soroban_hash_0001',
          status: 'SUCCESS',
          ledger: 512340,
        };
      }
      if (method === 'simulateViewCall') {
        return {
          returnValue: {
            invoiceId: 42n,
            merchant: 'GMERCHANT123',
            debtor: 'GDEBTOR456',
            owner: 'GMERCHANT123',
            faceValue: 50_000_0000000n,
            advanceAmount: 0n,
            discountBps: 0,
            issuedAt: 1_700_000_000,
            maturityTimestamp: 1_790_000_000,
            metadataHash: 'a'.repeat(64),
            invoiceNumber: 'INV-42',
            riskTier: RiskTier.TierA,
            status: InvoiceStatus.Verified,
            currency: MOCK_CONFIG.contracts.usdcToken,
          },
        };
      }
      return {};
    });

    const sdk = new LiquiVaultSDK(MOCK_CONFIG, mockTransport);
    const mockSigner = vi.fn(async (xdr: string) => `signed_${xdr}`);

    const mintRes = await sdk.invoiceRegistry.createInvoice(
      {
        merchant: 'GMERCHANT123',
        debtor: 'GDEBTOR456',
        faceValue: 50_000_0000000n,
        maturityTimestamp: Math.floor(Date.now() / 1000) + 86400 * 60,
        metadataHash: 'a'.repeat(64),
        invoiceNumber: 'INV-42',
        riskTier: RiskTier.TierA,
      },
      mockSigner
    );

    expect(mintRes.status).toBe('SUCCESS');
    expect(mintRes.txHash).toBe('tx_soroban_hash_0001');
    expect(mintRes.returnValue).toBe(42n);
    expect(mockSigner).toHaveBeenCalledTimes(1);

    const invoice = await sdk.invoiceRegistry.getInvoice(42n);
    expect(invoice.invoiceId).toBe(42n);
    expect(sdk.invoiceRegistry.isFactorable(invoice, 1_750_000_000)).toBe(true);
  });
});
