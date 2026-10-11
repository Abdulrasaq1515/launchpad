/**
 * Freighter wallet adapter
 */

import {
  isConnected as freighterIsConnected,
  isAllowed as freighterIsAllowed,
  setAllowed as freighterSetAllowed,
  getAddress as freighterGetAddress,
  signTransaction as freighterSignTransaction,
} from "@stellar/freighter-api";
import type { WalletAdapter } from "./types";

export const freighterAdapter: WalletAdapter = {
  id: "freighter",
  name: "Freighter",
  icon: "FR",

  async isAvailable(): Promise<boolean> {
    try {
      const { isConnected } = await freighterIsConnected();
      return isConnected;
    } catch {
      return false;
    }
  },

  async connect(): Promise<string> {
    const { isConnected } = await freighterIsConnected();
    if (!isConnected) {
      window.open("https://www.freighter.app/", "_blank");
      throw new Error("Freighter not installed");
    }

    await freighterSetAllowed();
    const { address, error } = await freighterGetAddress();
    
    if (error) {
      throw new Error(error);
    }
    
    if (!address) {
      throw new Error("Failed to get address from Freighter");
    }

    return address;
  },

  async disconnect(): Promise<void> {
    // Freighter doesn't have a disconnect method
    // Connection state is managed by the provider
  },

  async signTransaction(
    xdr: string,
    opts?: { networkPassphrase?: string; address?: string }
  ): Promise<string> {
    const { signedTxXdr, error } = await freighterSignTransaction(xdr, opts);
    
    if (error) {
      throw new Error(error);
    }
    
    return signedTxXdr;
  },

  async getPublicKey(): Promise<string | null> {
    try {
      const { isAllowed } = await freighterIsAllowed();
      if (!isAllowed) return null;

      const { address } = await freighterGetAddress();
      return address || null;
    } catch {
      return null;
    }
  },
};
