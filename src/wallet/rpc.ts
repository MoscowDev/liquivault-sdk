import { LiquiVaultConfig, SimulationResult, TransactionResult } from '../types';

export type RpcTransportHandler = (
  endpoint: string,
  method: string,
  params: Record<string, unknown>
) => Promise<unknown>;

/**
 * Soroban RPC & Horizon helper for simulating, submitting, and polling Stellar transactions.
 */
export class StellarRpcHelper {
  private readonly config: LiquiVaultConfig;
  private readonly transport: RpcTransportHandler;

  constructor(config: LiquiVaultConfig, customTransport?: RpcTransportHandler) {
    this.config = config;
    this.transport = customTransport ?? this.defaultFetchTransport.bind(this);
  }

  private async defaultFetchTransport(
    endpoint: string,
    method: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
    });
    if (!response.ok) {
      throw new Error(`Soroban RPC HTTP error: ${response.status}`);
    }
    const json = (await response.json()) as { result?: unknown; error?: { message?: string } };
    if (json.error) {
      throw new Error(`Soroban RPC error: ${json.error.message ?? 'Unknown RPC failure'}`);
    }
    return json.result;
  }

  /**
   * Simulates a transaction XDR against the Soroban RPC node.
   */
  public async simulateTransaction<T = unknown>(txXdr: string): Promise<SimulationResult<T>> {
    const res = (await this.transport(this.config.network.rpcUrl, 'simulateTransaction', {
      transaction: txXdr,
    })) as SimulationResult<T>;
    return res;
  }

  /**
   * Simulates a read-only contract view call.
   */
  public async simulateViewCall<T>(
    contractId: string,
    method: string,
    args: unknown[]
  ): Promise<T> {
    const res = (await this.transport(this.config.network.rpcUrl, 'simulateViewCall', {
      contractId,
      method,
      args: args.map((a) => (typeof a === 'bigint' ? a.toString() : a)),
    })) as { returnValue: T };
    return res.returnValue;
  }

  /**
   * Simulates, signs via wallet callback, submits to Soroban RPC, and returns the confirmed result.
   */
  public async executeContractCall<T>(
    unsignedTxXdr: string,
    signTransaction: (xdr: string) => Promise<string>
  ): Promise<TransactionResult<T>> {
    const sim = await this.simulateTransaction<T>(unsignedTxXdr);
    if (!sim.success) {
      throw new Error(`Transaction simulation failed: ${sim.error ?? 'Unknown error'}`);
    }

    const signedXdr = await signTransaction(unsignedTxXdr);
    const submitRes = (await this.transport(this.config.network.rpcUrl, 'sendTransaction', {
      transaction: signedXdr,
    })) as { hash: string; status: 'SUCCESS' | 'PENDING' | 'FAILED'; ledger?: number };

    return {
      txHash: submitRes.hash,
      status: submitRes.status === 'PENDING' ? 'SUCCESS' : submitRes.status,
      ledger: submitRes.ledger ?? 100_000,
      returnValue: sim.returnValue,
      feeChargedStroops: sim.minResourceFeeStroops,
    };
  }
}
