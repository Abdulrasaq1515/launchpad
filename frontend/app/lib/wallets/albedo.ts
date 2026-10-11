/**
 * Albedo wallet adapter
 */

import type { WalletAdapter } from "./types";

declare global {
  interface Window {
    albedo?: {
      publicKey: (opts?: { require_existing?: boolean }) => Promise<{ pubkey: string; signed_message?: string; message?: string }>;
      tx: (opts: { xdr: string; network?: string; submit?: boolean }) => Promise<{ signed_xdr: string; tx_hash?: string }>;
    };
  }
}

export const albedoAdapter: WalletAdapter = {
  id: "albedo",
  name: "Albedo",
  icon: "AL",

  async isAvailable(): Promise<boolean> {
    return typeof window !== "undefined" && typeof window.albedo !== "undefined";
  },

  async connect(): Promise<string> {
    if (!window.albedo) {
      window.open("https://albedo.link/", "_blank");
      throw new Error("Albedo not available");
    }

    const result = await window.albedo.publicKey();
    return result.pubkey;
  },

  async disconnect(): Promise<void> {
    // Albedo doesn't require explicit disconnect
  },

  async signTransaction(
    xdr: string,
    opts?: { networkPassphrase?: string; address?: string }
  ): Promise<string> {
    if (!window.albedo) {
      throw new Error("Albedo not available");
    }

    const result = await window.albedo.tx({
      xdr,
      network: opts?.networkPassphrase,
      submit: false,
    });

    return result.signed_xdr;
  },

  async getPublicKey(): Promise<string | null> {
    if (!window.albedo) return null;

    try {
      const result = await window.albedo.publicKey({ require_existing: true });
      return result.pubkey;
    } catch {
      return null;
    }
  },
};
