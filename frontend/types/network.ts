import * as StellarSdk from "@stellar/stellar-sdk";

export type NetworkType = "testnet" | "mainnet";

export interface NetworkConfig {
  network: NetworkType;
  horizonUrl: string;
  rpcUrl: string;
  passphrase: string;
  /**
   * Address of the token factory deployed on this network.
   *
   * Every token launch goes through the factory's atomic `deploy_token`, so a
   * network without one cannot launch tokens. Set the per-network variable;
   * `NEXT_PUBLIC_FACTORY_ADDRESS` is a single-network convenience fallback.
   */
  factoryAddress?: string;
}

export const NETWORKS: Record<NetworkType, NetworkConfig> = {
  testnet: {
    network: "testnet",
    horizonUrl: process.env.NEXT_PUBLIC_TESTNET_HORIZON_URL ?? "https://horizon-testnet.stellar.org",
    rpcUrl: process.env.NEXT_PUBLIC_TESTNET_RPC_URL ?? "https://soroban-testnet.stellar.org",
    passphrase: StellarSdk.Networks.TESTNET,
    factoryAddress:
      process.env.NEXT_PUBLIC_FACTORY_ADDRESS_TESTNET ??
      process.env.NEXT_PUBLIC_FACTORY_ADDRESS,
  },
  mainnet: {
    network: "mainnet",
    horizonUrl: process.env.NEXT_PUBLIC_MAINNET_HORIZON_URL ?? "https://horizon.stellar.org",
    rpcUrl: process.env.NEXT_PUBLIC_MAINNET_RPC_URL ?? "https://mainnet.sorobanrpc.com",
    passphrase: StellarSdk.Networks.PUBLIC,
    factoryAddress:
      process.env.NEXT_PUBLIC_FACTORY_ADDRESS_MAINNET ??
      process.env.NEXT_PUBLIC_FACTORY_ADDRESS,
  },
};
