"use client";

import { useCallback } from "react";
import * as StellarSdk from "@stellar/stellar-sdk";
import { useWallet } from "./useWallet";
import { useNetwork } from "../providers/NetworkProvider";
import { toBaseUnits } from "@/lib/utils";
import { verifyFactory } from "@/lib/stellar";
import { Client as TokenClient } from "@/lib/bindings/token/src/index";
import type { AssembledTransaction } from "@stellar/stellar-sdk/contract";
import { saveMetadataForContract } from "../deploy/utils/metadata";

/**
 * Cryptographically secure random bytes for the deploy salt.
 *
 * The salt determines the token's address, so a predictable salt lets anyone
 * precompute that address and interact with it before the issuer does. There
 * is deliberately no non-cryptographic fallback: if Web Crypto is missing,
 * something is wrong with the environment and the deploy is refused.
 */
function randomBytes(length: number): Buffer {
  const webCrypto = globalThis.crypto;
  if (!webCrypto || typeof webCrypto.getRandomValues !== "function") {
    throw {
      message:
        "Secure random number generation (crypto.getRandomValues) is unavailable in this browser, so a deploy salt cannot be generated safely. Please use an up-to-date browser and try again.",
      type: "validation",
    } as DeployTokenError;
  }
  const array = new Uint8Array(length);
  webCrypto.getRandomValues(array);
  return Buffer.from(array);
}

// ---------------------------------------------------------------------------

// Types
// ---------------------------------------------------------------------------

export interface DeployTokenParams {
  name: string;
  symbol: string;
  decimals: number;
  initialSupply: string;
  maxSupply?: string;
  adminAddress: string;
  authorizationRequired?: boolean;
  authorizationRevocable?: boolean;
  complianceNodeAddress?: string;
  /**
   * Canonical metadata JSON to be keccak256-hashed into the registry in the
   * same transaction as the deploy. `undefined` → `None` in the contract,
   * which leaves `metadata_digest` as `None` in the registry record.
   */
  metadata?: string;
  /**
   * Optional `https://` or `ipfs://` URI forwarded to the token's own
   * `contract_uri` storage so the document location is on-chain from day one.
   */
  contractUri?: string;
  /**
   * Immutable transfer fee in basis points, forwarded to the token's
   * `initialize`. Range 0..1000 (0%..10%). Defaults to 0 — no fee.
   * Issue #497.
   */
  feeBps?: number;
  /**
   * Address that receives the immutable transfer fee. Defaults to the
   * deployer's own public key when unset. Issue #497.
   */
  feeRecipient?: string;
  /**
   * Pre-generated deploy salt. When supplied the factory will use this salt
   * to derive the deterministic token address shown in the attestation panel
   * (same bytes, same address). When omitted a fresh random salt is generated
   * at deploy time.
   */
  salt?: Uint8Array;
  // Issue #451: Optional metadata fields for off-chain storage
  description?: string;
  logoUrl?: string;
  website?: string;
  twitter?: string;
  discord?: string;
}

export interface DeployTokenResult {
  contractId: string;
  transactionHash: string;
}

export interface DeployTokenError {
  message: string;
  type: "validation" | "simulation" | "wallet" | "broadcast" | "timeout" | "network";
  /**
   * Set on `timeout` errors when the token address is already known. It comes
   * from simulation, so it is authoritative whether or not the transaction
   * has landed yet, and callers can route to the token's dashboard.
   */
  contractId?: string;
  /** Hash of the broadcast transaction, set on `timeout` errors. */
  transactionHash?: string;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Custom hook for deploying a Soroban SEP-41 token contract.
 *
 * The token is deployed through the atomic factory: a single `deploy_token`
 * invocation that both creates the contract and calls `initialize` on it, so
 * either both happen or neither does. There is no half-initialised token to
 * clean up if the second half fails, because there is no second half.
 *
 * The factory address comes from the active network's config, so testnet and
 * mainnet factories coexist without an env-var swap.
 */
export function useDeployToken() {
  const { connected, publicKey, signTransaction } = useWallet();
  const { networkConfig } = useNetwork();

  const deployToken = useCallback(
    async (params: DeployTokenParams): Promise<DeployTokenResult> => {
      if (!connected || !publicKey || !signTransaction) {
        throw {
          message: "Connect a wallet before deploying a token.",
          type: "wallet",
        } as DeployTokenError;
      }

      const factoryAddress = networkConfig.factoryAddress;
      if (!factoryAddress) {
        throw {
          message:
            `No token factory is configured for ${networkConfig.network}. Set ` +
            `NEXT_PUBLIC_FACTORY_ADDRESS_${networkConfig.network.toUpperCase()} in your environment.`,
          type: "validation",
        } as DeployTokenError;
      }

      const ctx: DeployContext = {
        publicKey,
        signTransaction,
        rpcUrl: networkConfig.rpcUrl,
        passphrase: networkConfig.passphrase,
      };

      const check = await verifyFactory(factoryAddress, networkConfig);
      if (!check.ok) {
        const hashes =
          check.expected || check.actual
            ? ` Expected: ${check.expected ?? "n/a"}. Found: ${check.actual ?? "n/a"}.`
            : "";
        throw {
          message: `Deployment blocked: ${check.reason}${hashes}`,
          type: "validation",
        } as DeployTokenError;
      }

      return deployViaFactory(params, ctx, factoryAddress);
    },
    [
      connected,
      publicKey,
      signTransaction,
      networkConfig,
    ],
  );

  return { deployToken };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Convert a decimal string to base units, translating the `RangeError` thrown
 * by `toBaseUnits` when the input has more decimal places than the token
 * supports into a `DeployTokenError` with `type: "validation"`.
 */
function toBaseUnitsOrThrow(
  value: string,
  decimals: number,
  field: string,
): bigint {
  try {
    return toBaseUnits(value, decimals);
  } catch (err) {
    if (err instanceof RangeError) {
      throw {
        message: `${field}: ${err.message}`,
        type: "validation",
      } as DeployTokenError;
    }
    throw err;
  }
}

interface DeployContext {
  publicKey: string;
  signTransaction: (xdr: string, opts?: { networkPassphrase?: string }) => Promise<string>;
  rpcUrl: string;
  passphrase: string;
}

/**
 * Load the deployer's account, turning "not found" into an actionable
 * validation error. A freshly created or unfunded address has no ledger
 * entry until its first transaction, which is a funding problem rather than
 * a deploy failure.
 */
async function loadSourceAccount(
  rpc: StellarSdk.rpc.Server,
  publicKey: string,
): Promise<StellarSdk.Account> {
  try {
    return await rpc.getAccount(publicKey);
  } catch (err) {
    const status = (err as { response?: { status?: number } } | null)?.response?.status;
    const errorMsg = err instanceof Error ? err.message : String(err);
    // stellar-sdk reports *any* getLedgerEntry failure, transport errors
    // included, as "Account not found", so only blame the account once the
    // RPC has been shown to answer.
    const notFound =
      (status === 404 || /not found/i.test(errorMsg)) &&
      (await rpc.getLatestLedger().then(
        () => true,
        () => false,
      ));
    if (notFound) {
      throw {
        message: `Account ${publicKey} has no transactions on this network yet. Fund it with XLM (on testnet, use Friendbot) and try again.`,
        type: "validation",
      } as DeployTokenError;
    }
    throw {
      message: `Could not load account ${publicKey} from the Soroban RPC: ${errorMsg}`,
      type: "network",
    } as DeployTokenError;
  }
}

const POLL_INTERVAL_MS = 2_000;
/**
 * How long to wait for a broadcast transaction to settle. A mainnet
 * transaction in a busy ledger can legitimately take longer than a minute.
 */
const POLL_BUDGET_MS = 180_000;

/**
 * Broadcast a signed XDR and poll until the transaction settles.
 *
 * `contractId`, when the caller already knows it, is attached to the timeout
 * error so the UI can still send the user to the token rather than asking
 * them to look it up by transaction hash.
 */
async function sendAndPoll(
  signedXdr: string,
  ctx: DeployContext,
  contractId?: string,
): Promise<string> {
  const rpc = new StellarSdk.rpc.Server(ctx.rpcUrl);
  const signedTx = StellarSdk.TransactionBuilder.fromXDR(
    signedXdr,
    ctx.passphrase,
  ) as StellarSdk.Transaction;

  let sendResult: StellarSdk.rpc.Api.SendTransactionResponse;
  try {
    sendResult = await rpc.sendTransaction(signedTx);
  } catch (err) {
    throw {
      message: `Broadcast failed: ${err instanceof Error ? err.message : String(err)}`,
      type: "broadcast",
    } as DeployTokenError;
  }

  if (sendResult.status === "ERROR") {
    throw {
      message: `Transaction submission failed: ${sendResult.errorResult?.toXDR("base64") || "Unknown error"}`,
      type: "broadcast",
    } as DeployTokenError;
  }

  const txHash = sendResult.hash;
  const maxAttempts = Math.ceil(POLL_BUDGET_MS / POLL_INTERVAL_MS);
  // Transport error from the most recent poll, if it failed. Lets a timeout
  // say "the RPC is unreachable" instead of "the transaction has not settled".
  let lastPollError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    let getResult: StellarSdk.rpc.Api.GetTransactionResponse;
    try {
      getResult = await rpc.getTransaction(txHash);
    } catch (err) {
      lastPollError = err;
      continue;
    }
    lastPollError = null;

    if (getResult.status === "SUCCESS") {
      return txHash;
    }
    if (getResult.status === "FAILED") {
      throw {
        message: `Transaction failed: ${getResult.resultXdr?.toXDR("base64") || "Unknown failure"}`,
        type: "broadcast",
      } as DeployTokenError;
    }
  }

  const tokenNote = contractId ? ` The token address is ${contractId}.` : "";
  const message = lastPollError
    ? `Could not reach the Soroban RPC to confirm transaction ${txHash} (${
        lastPollError instanceof Error ? lastPollError.message : String(lastPollError)
      }). The transaction may still have succeeded.${tokenNote}`
    : `Transaction ${txHash} has not settled after ${
        POLL_BUDGET_MS / 1000
      } seconds. It may still be included in a later ledger.${tokenNote}`;

  throw {
    message,
    type: "timeout",
    contractId,
    transactionHash: txHash,
  } as DeployTokenError;
}

/** Ask the wallet to sign a prepared transaction, normalising user rejection. */
async function signPrepared(prepared: StellarSdk.Transaction, ctx: DeployContext): Promise<string> {
  try {
    return await ctx.signTransaction(prepared.toXDR(), {
      networkPassphrase: ctx.passphrase,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (
      errorMsg.toLowerCase().includes("user declined") ||
      errorMsg.toLowerCase().includes("user rejected") ||
      errorMsg.toLowerCase().includes("cancelled")
    ) {
      throw {
        message: "Transaction signature was rejected. Please try again.",
        type: "wallet",
      } as DeployTokenError;
    }
    throw {
      message: `Wallet signing failed: ${errorMsg}`,
      type: "wallet",
    } as DeployTokenError;
  }
}

/**
 * Build the `TokenConfig` struct ScVal for the factory's `deploy_token` call.
 * The struct is encoded as a map with symbol keys; `admin` / `compliance_node`
 * are Addresses, numeric fields get explicit widths, and optional fields pass
 * `null` for `None`.
 */
export function buildTokenConfigScVals(
  params: DeployTokenParams,
  deployer: string,
): StellarSdk.xdr.ScVal {
  const maxSupply = params.maxSupply
    ? toBaseUnitsOrThrow(params.maxSupply, params.decimals, "maxSupply")
    : null;
  const complianceNode =
    params.complianceNodeAddress && params.complianceNodeAddress.trim().length > 0
      ? params.complianceNodeAddress.trim()
      : null;

  return StellarSdk.nativeToScVal(
    {
      admin: params.adminAddress || deployer,
      authorization_required: params.authorizationRequired ?? false,
      authorization_revocable: params.authorizationRevocable ?? false,
      compliance_node: complianceNode,
      contract_uri: params.contractUri ?? null,
      decimal: params.decimals,
      fee_bps: params.feeBps ?? 0,
      fee_recipient: params.feeRecipient || params.adminAddress || deployer,
      initial_supply: toBaseUnitsOrThrow(params.initialSupply, params.decimals, "initialSupply"),
      max_supply: maxSupply,
      metadata: params.metadata ?? null,
      name: params.name,
      symbol: params.symbol,
    },
    {
      // Every key must be declared, and every key must be a `symbol`.
      // nativeToScVal defaults an undeclared key to ScVal::String, and the
      // contract's #[contracttype] struct is an ScMap keyed by Symbol. Mixing
      // the two also breaks the host's key-ordering check, because ScVal sorts
      // by type tag before value — which is the
      //   "ScMap was not sorted by key for conversion to host object"
      // the deploy simulation used to fail with.
      type: {
        admin: ["symbol", "address"],
        authorization_required: ["symbol", "bool"],
        authorization_revocable: ["symbol", "bool"],
        compliance_node: ["symbol", "address"],
        contract_uri: ["symbol", "string"],
        decimal: ["symbol", "u32"],
        fee_bps: ["symbol", "u32"],
        fee_recipient: ["symbol", "address"],
        initial_supply: ["symbol", "i128"],
        max_supply: ["symbol", "i128"],
        name: ["symbol", "string"],
        symbol: ["symbol", "string"],
        metadata: ["symbol", "string"],
      },
    },
  );
}

// ---------------------------------------------------------------------------
// Factory path
// ---------------------------------------------------------------------------

/**
 * Deploy + initialise a token in a single atomic transaction via the factory.
 *
 * `deploy_token(deployer, salt, config)` returns the deterministic token
 * address. The factory enforces `deployer.require_auth()` and the token's own
 * `initialize` enforces `admin.require_auth()`. The frontend passes the
 * deployer's own public key as `admin`, so a single wallet signature covers
 * both authorisations. The call is forwarded here as a raw contract invocation
 * (the factory WASM embeds the token spec, which trips up the TS binding
 * generator, so we hand-roll it).
 */
async function deployViaFactory(
  params: DeployTokenParams,
  ctx: DeployContext,
  factoryAddress: string,
): Promise<DeployTokenResult> {
  const rpc = new StellarSdk.rpc.Server(ctx.rpcUrl);
  const contract = new StellarSdk.Contract(factoryAddress);
  // Use the caller-supplied salt (shown in the attestation panel) so the
  // on-chain address matches the one the user saw before signing. Fall back
  // to a fresh random salt when none was provided (e.g. legacy callers).
  const salt = params.salt ? Buffer.from(params.salt) : randomBytes(32);

  const account = await loadSourceAccount(rpc, ctx.publicKey);

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: ctx.passphrase,
  })
    .addOperation(
      contract.call(
        "deploy_token",
        new StellarSdk.Address(ctx.publicKey).toScVal(),
        StellarSdk.nativeToScVal(salt),
        buildTokenConfigScVals(params, ctx.publicKey),
      ),
    )
    .setTimeout(300)
    .build();

  const sim = await rpc.simulateTransaction(tx);

  if (StellarSdk.rpc.Api.isSimulationError(sim)) {
    throw {
      message: `Deployment simulation failed: ${sim.error}`,
      type: "simulation",
    } as DeployTokenError;
  }
  if (!StellarSdk.rpc.Api.isSimulationSuccess(sim) || !sim.result) {
    throw {
      message: "Deployment simulation did not produce a result. Please check your parameters and try again.",
      type: "simulation",
    } as DeployTokenError;
  }

  // The factory returns the deterministic token address.
  const contractId = StellarSdk.Address.fromScVal(sim.result.retval).toString();

  const assembled = StellarSdk.rpc.assembleTransaction(tx, sim).build();
  const signedXdr = await signPrepared(assembled, ctx);
  const transactionHash = await sendAndPoll(signedXdr, ctx, contractId);

  // ── Step 2: Save metadata off-chain ─────────────────────────────────
  // Store the five metadata fields client-side after successful deploy.
  // This is the off-chain fix for issue #451 - the on-chain registry
  // (issue #204) is the intended long-term destination.
  try {
    saveMetadataForContract(contractId, {
      name: params.name,
      symbol: params.symbol,
      description: params.description,
      logoUrl: params.logoUrl,
      website: params.website,
      twitter: params.twitter,
      discord: params.discord,
    });
  } catch (metadataError) {
    // Non-fatal - don't fail the entire deployment for metadata storage issues
    console.warn("Failed to save metadata for contract:", metadataError);
  }

  return { contractId, transactionHash };
}

