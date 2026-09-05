/**
 * LOBSTR wallet adapter
 */

import type { WalletAdapter } from "./types";

declare global {
  interface Window {
    lobstrWallet?: {
      isConnected: () => Promise<boolean>;
      connect: () => Promise<{ publicKey: string }>;
      signTransaction: (xdr: string, opts?: { network?: string }) => Promise<{ signedXDR: string }>;
      getPublicKey: () => Promise<string | null>;
    };
  }
}

export const lobstrAdapter: WalletAdapter = {
  id: "lobstr",
  name: "LOBSTR",
  icon: "LO",

  async isAvailable(): Promise<boolean> {
    return typeof window !== "undefined" && typeof window.lobstrWallet !== "undefined";
  },

  async connect(): Promise<string> {
    if (!window.lobstrWallet) {
      window.open("https://lobstr.co/", "_blank");
      throw new Error("LOBSTR wallet not available");
    }

    const result = await window.lobstrWallet.connect();
    return result.publicKey;
  },

  async disconnect(): Promise<void> {
    // LOBSTR doesn't require explicit disconnect
  },

  async signTransaction(
    xdr: string,
    opts?: { networkPassphrase?: string; address?: string }
  ): Promise<string> {
    if (!window.lobstrWallet) {
      throw new Error("LOBSTR wallet not available");
    }

    const result = await window.lobstrWallet.signTransaction(xdr, {
      network: opts?.networkPassphrase,
    });

    return result.signedXDR;
  },

  async getPublicKey(): Promise<string | null> {
    if (!window.lobstrWallet) return null;

    try {
      return await window.lobstrWallet.getPublicKey();
    } catch {
      return null;
    }
  },
};
