import * as freighterApi from '@stellar/freighter-api';

export interface FreighterConnectionResult {
  publicKey: string;
  network: string;
  networkPassphrase: string;
}

/**
 * Adapter for the Stellar Freighter browser extension wallet, including SEP-10 authentication.
 */
export class FreighterWalletAdapter {
  private readonly networkPassphrase: string;

  constructor(networkPassphrase = 'Test SDF Network ; September 2015') {
    this.networkPassphrase = networkPassphrase;
  }

  /**
   * Checks whether the Freighter extension is installed and connected.
   */
  public async isConnected(): Promise<boolean> {
    try {
      const res = await freighterApi.isConnected();
      return Boolean(res && (typeof res === 'boolean' ? res : res.isConnected));
    } catch {
      return false;
    }
  }

  /**
   * Requests permission and retrieves the active user's Stellar public key and network.
   */
  public async connect(): Promise<FreighterConnectionResult> {
    const access = await freighterApi.requestAccess();
    if (access.error) {
      throw new Error(`Freighter access denied: ${access.error}`);
    }
    const netDetails = await freighterApi.getNetworkDetails();
    return {
      publicKey: access.address,
      network: netDetails.network || 'TESTNET',
      networkPassphrase: netDetails.networkPassphrase || this.networkPassphrase,
    };
  }

  /**
   * Signs a Soroban transaction XDR string using Freighter.
   */
  public async signTransaction(xdr: string, accountToSign?: string): Promise<string> {
    const signed = await freighterApi.signTransaction(xdr, {
      networkPassphrase: this.networkPassphrase,
      address: accountToSign,
    });
    if (signed.error) {
      throw new Error(`Freighter signing error: ${signed.error}`);
    }
    return signed.signedTxXdr;
  }

  /**
   * Signs a SEP-10 Web Authentication challenge transaction XDR with Freighter.
   */
  public async signSep10Challenge(challengeXdr: string, clientPublicKey: string): Promise<string> {
    return this.signTransaction(challengeXdr, clientPublicKey);
  }
}
