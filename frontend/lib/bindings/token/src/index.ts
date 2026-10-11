import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}





/**
 * Continuous-vesting schedule for a single recipient.
 * 
 * Accrual is pure arithmetic over the ledger sequence: nothing here is
 * touched by the token, so `stream_accrued` reads without a transaction and
 * a paused or frozen token only stops the withdrawal, never the accounting.
 */
export interface Stream {
  end_ledger: u32;
  max_per_claim: i128;
  released: i128;
  start_ledger: u32;
  total: i128;
}

export type DataKey = {tag: "Admin", values: void} | {tag: "PendingAdmin", values: void} | {tag: "PendingAdminExpiry", values: void} | {tag: "ComplianceNode", values: void} | {tag: "Name", values: void} | {tag: "Symbol", values: void} | {tag: "Decimals", values: void} | {tag: "TotalSupply", values: void} | {tag: "TotalBurned", values: void} | {tag: "MaxSupply", values: void} | {tag: "MaxBalancePerAccount", values: void} | {tag: "ContractUri", values: void} | {tag: "Balance", values: readonly [string]} | {tag: "Allowance", values: readonly [string, string]} | {tag: "Frozen", values: readonly [string]} | {tag: "IsPaused", values: void} | {tag: "Locked", values: void} | {tag: "Initialized", values: void} | {tag: "AuthorizationRequired", values: void} | {tag: "AuthorizationRevocable", values: void} | {tag: "AuthorizedHolder", values: readonly [string]} | {tag: "LaunchSeal", values: void} | {tag: "Stream", values: readonly [string]} | {tag: "StreamReleased", values: readonly [string]} | {tag: "FeeBps", values: void} | {tag: "FeeRecipient", values: void};


/**
 * Creator-attested record that a launch reached the issuer's success
 * threshold. Written once by `launch_seal` and never modified.
 */
export interface LaunchSeal {
  commitment: Buffer;
  ledger: u32;
  supply: i128;
}

/**
 * Typed contract errors — surfaced in release WASM as numeric codes.
 * 
 * Codes 1–3 pre-existed for compliance-node paths and are preserved at those
 * values so that existing clients do not break. The remainder cover every
 * other failure mode so that `try_*` client calls can distinguish failures
 * even in release builds where panic strings are stripped.
 */
export const TokenError = {
  /**
   * The compliance node answered `can_trade` with `false`.
   */
  1: {message:"ComplianceRejected"},
  /**
   * The compliance node could not be called or returned a non-`bool`.
   */
  2: {message:"ComplianceNodeUnavailable"},
  /**
   * The address passed to `set_compliance_node` failed the probe.
   */
  3: {message:"InvalidComplianceNode"},
  /**
   * `initialize` was called on a contract that is already initialized.
   */
  4: {message:"AlreadyInitialized"},
  /**
   * The contract is permanently locked (`revoke_admin` was called).
   */
  5: {message:"Locked"},
  /**
   * The contract is paused.
   */
  6: {message:"Paused"},
  /**
   * Amount is zero or negative where a positive value is required.
   */
  7: {message:"InvalidAmount"},
  /**
   * Sender has insufficient token balance.
   */
  8: {message:"InsufficientBalance"},
  /**
   * Spender has insufficient allowance.
   */
  9: {message:"InsufficientAllowance"},
  /**
   * The account is frozen and cannot send tokens.
   */
  10: {message:"Frozen"},
  /**
   * Recipient is not on the authorized-holders list.
   */
  11: {message:"NotAuthorizedHolder"},
  /**
   * `revoke_authorization` was called but authorization is not revocable.
   */
  12: {message:"NotRevocable"},
  /**
   * Mint would exceed the `max_supply` cap.
   */
  13: {message:"ExceedsMaxSupply"},
  /**
   * WASM hash supplied to `upgrade` is the all-zeros sentinel.
   */
  14: {message:"InvalidWasmHash"},
  /**
   * `expiration_ledger` is not strictly greater than the current ledger.
   */
  15: {message:"InvalidLedgerRange"},
  /**
   * Transfer or mint would push the recipient above the per-account cap.
   */
  16: {message:"ExceedsMaxBalance"},
  /**
   * `accept_admin` was called with no pending proposal.
   */
  17: {message:"NoPendingAdmin"},
  /**
   * `initial_supply` exceeds `max_supply` in `initialize`.
   */
  18: {message:"ExceedsInitialSupply"},
  /**
   * Decimal value exceeds 18.
   */
  19: {message:"InvalidDecimals"},
  /**
   * `mint_batch` received vectors of different lengths.
   */
  20: {message:"BatchLengthMismatch"},
  /**
   * `mint_batch` received a batch larger than 100.
   */
  21: {message:"BatchTooLarge"},
  /**
   * `contract_uri` getter called before a URI has been set.
   */
  22: {message:"ContractUriNotSet"},
  /**
   * A storage getter was called before `initialize`.
   */
  23: {message:"NotInitialized"},
  /**
   * `revoke_admin` requires the compliance node to be cleared first.
   */
  24: {message:"ComplianceNodeMustBeCleared"},
  /**
   * Contract URI is empty, too long, contains whitespace or control
   * characters, or uses a scheme other than `https://` or `ipfs://`.
   */
  25: {message:"InvalidContractUri"},
  /**
   * `stream_grant` was called with a non-positive total, an end ledger not
   * strictly after the start ledger, or a non-positive `max_per_claim`.
   */
  26: {message:"InvalidStreamSchedule"},
  /**
   * `claim_stream` was called with no schedule for the recipient.
   */
  27: {message:"NoStream"},
  /**
   * The authorised invocation does not cover the requested claim range.
   */
  28: {message:"UnauthorizedClaim"},
  /**
   * `fee_bps` exceeds `MAX_FEE_BPS` in `initialize` (issue #497).
   */
  29: {message:"InvalidFeeBps"},
  /**
   * `propose_admin` was called with the address that is already admin.
   */
  30: {message:"AlreadyAdmin"},
  /**
   * `accept_admin` was called after the proposal's expiry ledger.
   */
  31: {message:"ProposalExpired"}
}


export interface AllowanceValue {
  amount: i128;
  expiration_ledger: u32;
}

export interface Client {
  /**
   * Construct and simulate a burn transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Burn `amount` tokens from `from`. Owner only (standard burn).
   * Refuses to run when the account is frozen so a holder cannot
   * dodge a freeze by destroying tokens.
   */
  burn: ({from, amount}: {from: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a mint transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Mint `amount` tokens to `to`. Admin only.
   * 
   * Subject to the compliance node: issuance is a value-moving path, so a
   * node that rejects `to` blocks the mint. See [`Self::_check_compliance`]
   * for the scope of the policy.
   */
  mint: ({to, amount}: {to: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a name transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  name: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  admin: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a pause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Pause the contract, halting all state-changing operations. Admin only.
   */
  pause: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a sealed transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns `true` once `launch_seal` has been called.
   */
  sealed: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a symbol transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  symbol: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a approve transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Approve `spender` to spend up to `amount` on behalf of `from`.
   * 
   * When `amount > 0`, `expiration_ledger` must be strictly greater than
   * the current ledger sequence. The allowance is stored in temporary
   * storage and its TTL is clamped to `env.storage().max_ttl()` to avoid
   * exceeding the network-enforced ceiling.
   * 
   * When `amount == 0`, the call is treated as a **revocation**: the
   * allowance entry is removed from storage and `expiration_ledger` is
   * ignored. This is the canonical, wallet-emitted way to revoke an
   * allowance (SEP-41 §4.1) and works regardless of the value passed for
   * `expiration_ledger`.
   */
  approve: ({from, spender, amount, expiration_ledger}: {from: string, spender: string, amount: i128, expiration_ledger: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  balance: ({id}: {id: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a unpause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Unpause the contract. Admin only.
   */
  unpause: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Upgrade this contract's WASM code hash in place. Admin only.
   * 
   * Security note: this preserves existing storage and contract address, so
   * new WASM must remain storage-compatible with previous deployments.
   */
  upgrade: ({new_wasm_hash}: {new_wasm_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a clawback transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Forcefully move `amount` tokens from `from` into the admin balance.
   * Admin only.
   * 
   * Deliberate freeze bypass: this is the sanctioned recovery path, so it
   * moves value even when `from` is frozen and even when the admin
   * recipient would otherwise be gated by the receive-side freeze check.
   * Every other credit path (transfer, transfer_from, mint) refuses a
   * frozen recipient; clawback is the single documented exception so an
   * issuer can always recover funds from a blacklisted account.
   */
  clawback: ({from, amount}: {from: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a decimals transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  decimals: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a transfer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Transfer `amount` from `from` to `to`. Caller must be `from`.
   */
  transfer: ({from, to, amount}: {from: string, to: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a allowance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  allowance: ({from, spender}: {from: string, spender: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a burn_from transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Burn `amount` tokens from `from` using `spender`'s allowance.
   * Refuses to run when `from` is frozen so a holder cannot dodge a
   * freeze by having an approved spender destroy their tokens.
   */
  burn_from: ({spender, from, amount}: {spender: string, from: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a burn_self transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Burn `amount` tokens from the caller's own balance. Refuses to
   * run when the account is frozen so a holder cannot dodge a freeze
   * by destroying tokens.
   * 
   * **Alias for `burn`, not a second implementation of it.** `burn` is the
   * SEP-41 entry point; this name is not, and it is not on the standard
   * for any wallet to discover. The two were byte-identical including their
   * doc comments, which made the choice between them arbitrary at the API
   * surface and doubled the test suite over one body (#107, #468).
   * 
   * Retained because the launchpad's own UI calls this name
   * (`buildBurnTransaction` in `frontend/lib/stellar.ts`). Forwarding keeps
   * that working with `burn` as the single implementation and `burn`'s
   * suite as the single test suite.
   */
  burn_self: ({from, amount}: {from: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a is_frozen transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns `true` if the given address is frozen.
   */
  is_frozen: ({addr}: {addr: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a is_locked transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns `true` once `revoke_admin` has been called. Once locked, no
   * admin operation can ever succeed again.
   */
  is_locked: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a is_paused transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns `true` if the contract is currently paused.
   */
  is_paused: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a burn_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Forced burn of `amount` tokens from `from`. Admin only.
   */
  burn_admin: ({from, amount}: {from: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Initialize the token with metadata and an initial supply minted to `admin`.
   * 
   * `admin.require_auth()` is enforced so the caller must prove they control
   * the admin address. This prevents a front-runner from setting admin to an
   * address they do *not* control. The frontend should **always** pass the
   * deployer's own public key as `admin` so that the wallet's signature
   * satisfies `require_auth` and the attacker cannot steal the role.
   * 
   * `authorization_required`: when true, recipients must be explicitly
   * authorized by the admin before they can receive or hold tokens.
   * 
   * `authorization_revocable`: when true, the admin may revoke a holder's
   * authorization, preventing them from receiving further transfers.
   */
  initialize: ({admin, decimal, name, symbol, initial_supply, max_supply, authorization_required, authorization_revocable, compliance_node, contract_uri, fee_bps, fee_recipient}: {admin: string, decimal: u32, name: string, symbol: string, initial_supply: i128, max_supply: Option<i128>, authorization_required: boolean, authorization_revocable: boolean, compliance_node: Option<string>, contract_uri: Option<string>, fee_bps: u32, fee_recipient: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a max_supply transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the immutable supply ceiling recorded at initialization.
   * It remains useful after admin revocation as a historical token fact.
   */
  max_supply: (options?: MethodOptions) => Promise<AssembledTransaction<Option<i128>>>

  /**
   * Construct and simulate a mint_batch transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Mint `amount` tokens to multiple recipients. Admin only.
   * 
   * Maximum batch size is 100 to stay within Soroban's compute budget.
   * 
   * Each recipient is checked against the compliance node individually, so
   * one rejected recipient reverts the whole batch. Note that a compliance
   * node makes the effective batch limit smaller in practice, because every
   * entry adds a cross-contract call to the invocation's budget.
   */
  mint_batch: ({to, amounts}: {to: Array<string>, amounts: Array<i128>}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a launch_seal transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Record that this launch reached the issuer's definition of success.
   * Admin only, and can only be called once.
   * 
   * `commitment` is an opaque 32-byte value chosen by the issuer (e.g. the
   * hash of a published success criterion). The ledger sequence and total
   * supply at the moment of sealing are stored alongside it, giving
   * indexers an objective, on-chain signal to sort launches by.
   */
  launch_seal: ({commitment}: {commitment: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a stream_info transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the schedule for `recipient`, or `None` if none exists.
   */
  stream_info: ({recipient}: {recipient: string}, options?: MethodOptions) => Promise<AssembledTransaction<Option<Stream>>>

  /**
   * Construct and simulate a accept_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Accept the admin role. Must be called by the pending admin.
   */
  accept_admin: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a admin_if_any transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the current administrator without treating an intentionally
   * locked token as an error. `admin()` remains the strict compatibility
   * view for callers that require an active administrator.
   */
  admin_if_any: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a claim_stream transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Release accrued tokens to `recipient` against a scoped authorisation.
   * 
   * The recipient pre-authorises a bounded claim range once, off-chain;
   * a relayer submits the claim, and `require_auth_for_args` makes the
   * host enforce that the signature covers exactly `(recipient,
   * from_ledger, to_ledger)` before the contract pays
   * `accrued(to_ledger) - released`, capped at the schedule's
   * `max_per_claim`.
   */
  claim_stream: ({recipient, from_ledger, to_ledger}: {recipient: string, from_ledger: u32, to_ledger: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a contract_uri transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the contract metadata URI, if one has been configured. The URI
   * remains readable after locking because it is historical metadata, not
   * an active administrative policy.
   */
  contract_uri: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a revoke_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Permanently revoke the admin role and lock the contract.
   * 
   * After this call:
   * - No further `mint`, `burn_admin`, `freeze`, `unfreeze`,
   * `propose_admin`, `accept_admin`, `pause`, or
   * `unpause` operation can ever succeed.
   * - The Admin storage entry is removed and a `Locked` flag is set.
   * - `is_locked()` returns `true` from then on.
   * 
   * A configured compliance node must be cleared first. Its failure mode is
   * fail-closed, and no administrator remains after this call to clear it.
   * Once revocation succeeds, holders can still `transfer`, `approve`,
   * `transfer_from`, `burn`, and `burn_self`; the token becomes trustless /
   * immutable.
   * 
   * Any max-balance-per-account cap set via
   * [`set_max_balance_per_account`](Self::set_max_balance_per_account) is
   * also deactivated — the cap is only enforced while an admin exists.
   * 
   * **This action is irreversible.**
   */
  revoke_admin: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a stream_grant transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Create a continuous-vesting stream for `recipient`. Admin only.
   * 
   * `total` accrues linearly from `start_ledger` to `end_ledger`, and the
   * recipient may release accrued tokens with `claim_stream` up to
   * `max_per_claim` per call. The bound is what keeps a single authorised
   * invocation from draining the contract.
   */
  stream_grant: ({recipient, total, start_ledger, end_ledger, max_per_claim}: {recipient: string, total: i128, start_ledger: u32, end_ledger: u32, max_per_claim: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a total_burned transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  total_burned: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a total_supply transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  total_supply: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a is_authorized transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns `true` if `holder` is authorized to receive tokens.
   * Always returns `true` when `authorization_required` is disabled.
   */
  is_authorized: ({holder}: {holder: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a pending_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the address proposed via `propose_admin` that has not yet
   * accepted the role, or `None` when no two-step transfer is in
   * progress. The entry is written by `propose_admin` and cleared by
   * `accept_admin`, `cancel_admin_proposal`, or `revoke_admin`; if the
   * proposal has expired it is also cleared so stale state does not linger.
   */
  pending_admin: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a propose_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Propose a new admin. Must be called by the current admin.
   * The new admin must call `accept_admin` to finalize the transfer.
   */
  propose_admin: ({new_admin}: {new_admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a transfer_from transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Transfer `amount` from `from` to `to` using `spender`'s allowance.
   */
  transfer_from: ({spender, from, to, amount}: {spender: string, from: string, to: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a freeze_account transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Freeze an account (blacklist): it cannot send or receive tokens, and
   * the admin cannot mint into it. Admin only.
   * 
   * Admin [`clawback`](Self::clawback) is the sole exception and may still
   * pull tokens from a frozen account back to the admin.
   */
  freeze_account: ({addr}: {addr: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a stream_accrued transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Pure-arithmetic view of how much has accrued to `recipient` by
   * `ledger`. Never touches the token, so it is safe to call while the
   * contract is paused or the recipient is frozen (#168).
   */
  stream_accrued: ({recipient, ledger}: {recipient: string, ledger: u32}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a compliance_node transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the configured compliance node, if any.
   */
  compliance_node: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a authorize_holder transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Grant authorization to `holder`, allowing them to receive tokens when
   * `authorization_required` is enabled. Admin only.
   */
  authorize_holder: ({holder}: {holder: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a launch_seal_info transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the seal record, or `None` if the launch has not been sealed.
   */
  launch_seal_info: (options?: MethodOptions) => Promise<AssembledTransaction<Option<LaunchSeal>>>

  /**
   * Construct and simulate a unfreeze_account transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Unfreeze a previously frozen account. Admin only.
   */
  unfreeze_account: ({addr}: {addr: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_compliance_node transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set, update, or remove the optional compliance node address.
   * Admin only. Pass `None` to remove the compliance node.
   * 
   * The candidate address is **probed before it is stored**: the contract
   * calls `can_trade` on it once with its own address on both sides and
   * rejects the address with [`TokenError::InvalidComplianceNode`] unless
   * the call succeeds and returns a `bool`. The probe's answer is ignored —
   * only its callability matters. This is what stops the common bricking
   * mistake of pointing the token at a non-contract address, at a contract
   * without `can_trade`, or at the token's own address (which fails as
   * re-entry).
   * 
   * Clearing the node (`None`) never probes anything, so an admin can always
   * recover from a node that has since been archived or has started failing.
   */
  set_compliance_node: ({node}: {node: Option<string>}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a update_contract_uri transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set or update the contract URI pointing to off-chain metadata JSON.
   * Admin only.
   * 
   * Only `https://` and `ipfs://` URIs of at most `MAX_CONTRACT_URI_LEN`
   * bytes are accepted; anything else panics with `InvalidContractUri`.
   */
  update_contract_uri: ({uri}: {uri: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a revoke_authorization transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Revoke authorization from `holder`. Only allowed when
   * `authorization_revocable` is enabled. Admin only.
   */
  revoke_authorization: ({holder}: {holder: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a cancel_admin_proposal transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Cancel a pending admin transfer. Must be called by the current admin.
   */
  cancel_admin_proposal: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a authorization_required transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns `true` if this token requires holders to be authorized before
   * receiving transfers.
   */
  authorization_required: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a authorization_revocable transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns `true` if the admin may revoke holder authorization.
   */
  authorization_revocable: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a max_balance_per_account transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Optional whale protection: max balance per account as a percentage of total supply.
   * 
   * If set to `p`, then for any transfer/mint to a non-admin recipient:
   * `balance(recipient) <= total_supply * p / 100`.
   * 
   * The cap is only enforced while an admin exists. After
   * [`revoke_admin`](Self::revoke_admin) removes the admin the cap becomes
   * inactive so the token remains fully transferable.
   * 
   * Once the contract is locked this returns `None` even if a percentage was
   * stored, so the getter never reports a limit that is not being enforced.
   * The stored value is deliberately left in place (so a counterfactual
   * re-init after a future upgrade sees it) but is masked by the lock state.
   */
  max_balance_per_account: (options?: MethodOptions) => Promise<AssembledTransaction<Option<u32>>>

  /**
   * Construct and simulate a set_authorization_required transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Enable or disable the authorization-gate policy after deploy. Admin
   * only. Previously `authorization_required` was written once at
   * `initialize` with no way to change it later, so a token deployed
   * without gating could never add it for a later regulated raise, and one
   * deployed with gating could never turn it off for its holders (issue
   * #404). `_require_admin` already covers both the admin check and
   * `_require_not_locked`.
   */
  set_authorization_required: ({required}: {required: boolean}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_max_balance_per_account transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set the optional max balance per account as a percentage of total supply.
   * Admin only.
   * 
   * - `None` disables whale protection
   * - `Some(p)` enables it, where `p` must be between 1 and 100 (inclusive)
   * 
   * The cap is only enforced while an admin exists. After
   * [`revoke_admin`](Self::revoke_admin) removes the admin the cap becomes
   * inactive so the token remains fully transferable.
   */
  set_max_balance_per_account: ({max_balance_per_account}: {max_balance_per_account: Option<u32>}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a renounce_authorization_revocable transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Permanently give up the admin's ability to revoke holder
   * authorization. One-way only: this can turn `authorization_revocable`
   * from `true` to `false`, never back. That direction only ever *reduces*
   * admin power, so it is safe to allow without a second confirmation
   * step; the reverse (granting revocation power the deploy-time choice
   * declined) is not offered, matching #404's "one-way" requirement.
   */
  renounce_authorization_revocable: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAQAAAQ1Db250aW51b3VzLXZlc3Rpbmcgc2NoZWR1bGUgZm9yIGEgc2luZ2xlIHJlY2lwaWVudC4KCkFjY3J1YWwgaXMgcHVyZSBhcml0aG1ldGljIG92ZXIgdGhlIGxlZGdlciBzZXF1ZW5jZTogbm90aGluZyBoZXJlIGlzCnRvdWNoZWQgYnkgdGhlIHRva2VuLCBzbyBgc3RyZWFtX2FjY3J1ZWRgIHJlYWRzIHdpdGhvdXQgYSB0cmFuc2FjdGlvbiBhbmQKYSBwYXVzZWQgb3IgZnJvemVuIHRva2VuIG9ubHkgc3RvcHMgdGhlIHdpdGhkcmF3YWwsIG5ldmVyIHRoZSBhY2NvdW50aW5nLgAAAAAAAAAAAAAGU3RyZWFtAAAAAAAFAAAAAAAAAAplbmRfbGVkZ2VyAAAAAAAEAAAAAAAAAA1tYXhfcGVyX2NsYWltAAAAAAAACwAAAAAAAAAIcmVsZWFzZWQAAAALAAAAAAAAAAxzdGFydF9sZWRnZXIAAAAEAAAAAAAAAAV0b3RhbAAAAAAAAAs=",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAAGgAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAAMUGVuZGluZ0FkbWluAAAAAAAAAAAAAAASUGVuZGluZ0FkbWluRXhwaXJ5AAAAAAAAAAAAAAAAAA5Db21wbGlhbmNlTm9kZQAAAAAAAAAAAAAAAAAETmFtZQAAAAAAAAAAAAAABlN5bWJvbAAAAAAAAAAAAAAAAAAIRGVjaW1hbHMAAAAAAAAAAAAAAAtUb3RhbFN1cHBseQAAAAAAAAAAAAAAAAtUb3RhbEJ1cm5lZAAAAAAAAAAAAAAAAAlNYXhTdXBwbHkAAAAAAAAAAAAAAAAAABRNYXhCYWxhbmNlUGVyQWNjb3VudAAAAAAAAAAAAAAAC0NvbnRyYWN0VXJpAAAAAAEAAAAAAAAAB0JhbGFuY2UAAAAAAQAAABMAAAABAAAAAAAAAAlBbGxvd2FuY2UAAAAAAAACAAAAEwAAABMAAAABAAAAAAAAAAZGcm96ZW4AAAAAAAEAAAATAAAAAAAAAAAAAAAISXNQYXVzZWQAAAAAAAAAu1NldCB0byBgdHJ1ZWAgYWZ0ZXIgYHJldm9rZV9hZG1pbmAgaXMgY2FsbGVkLiBPbmNlIGxvY2tlZCwgbm8gYWRtaW4Kb3BlcmF0aW9uIChtaW50LCBidXJuX2FkbWluLCBmcmVlemUsIHByb3Bvc2VfYWRtaW4pIGNhbgpldmVyIHN1Y2NlZWQgYWdhaW4g4oCUIHRoZSB0b2tlbiBiZWNvbWVzIGVmZmVjdGl2ZWx5IGltbXV0YWJsZS4AAAAABkxvY2tlZAAAAAAAAAAAAM9TZXQgb25jZSBvbiB0aGUgZmlyc3Qgc3VjY2Vzc2Z1bCBgaW5pdGlhbGl6ZWAgY2FsbCBhbmQgbmV2ZXIgcmVtb3ZlZC4KVW5saWtlIGBBZG1pbmAgKHdoaWNoIGByZXZva2VfYWRtaW5gIGRlbGV0ZXMpLCB0aGlzIGlzIHRoZSBzb2xlCnJlLWluaXRpYWxpemF0aW9uIGd1YXJkLCBzbyByZXZva2luZyBhZG1pbiBjYW4gbmV2ZXIgcmVvcGVuIGBpbml0aWFsaXplYC4AAAAAC0luaXRpYWxpemVkAAAAAAAAAAAAAAAAFUF1dGhvcml6YXRpb25SZXF1aXJlZAAAAAAAAAAAAAAAAAAAFkF1dGhvcml6YXRpb25SZXZvY2FibGUAAAAAAAEAAAAAAAAAEEF1dGhvcml6ZWRIb2xkZXIAAAABAAAAEwAAAAAAAACDU2V0IG9uY2UgYnkgYGxhdW5jaF9zZWFsYC4gSG9sZHMgdGhlIGlzc3VlcidzIGNvbW1pdG1lbnQgdG9nZXRoZXIgd2l0aAp0aGUgbGVkZ2VyIGFuZCB0b3RhbCBzdXBwbHkgYXQgdGhlIG1vbWVudCBvZiBzZWFsaW5nICgjNDkzKS4AAAAACkxhdW5jaFNlYWwAAAAAAAEAAABHQ29udGludW91cy12ZXN0aW5nIHNjaGVkdWxlIGZvciBhIHJlY2lwaWVudCwgd3JpdHRlbiBieSBgc3RyZWFtX2dyYW50YC4AAAAABlN0cmVhbQAAAAAAAQAAABMAAAABAAAAP1RvdGFsIGFtb3VudCBhbHJlYWR5IHJlbGVhc2VkIHRvIGEgcmVjaXBpZW50IGJ5IGBjbGFpbV9zdHJlYW1gLgAAAAAOU3RyZWFtUmVsZWFzZWQAAAAAAAEAAAATAAAAAAAAAHVJbW11dGFibGUgdHJhbnNmZXIgZmVlLCBpbiBiYXNpcyBwb2ludHMuIFdyaXR0ZW4gZXhhY3RseSBvbmNlIGJ5CmBpbml0aWFsaXplYCBhbmQgbmV2ZXIgd3JpdHRlbiBhZ2FpbiDigJQgaXNzdWUgIzQ5Ny4AAAAAAAAGRmVlQnBzAAAAAAAAAAAAaUFkZHJlc3MgdGhhdCByZWNlaXZlcyB0aGUgaW1tdXRhYmxlIHRyYW5zZmVyIGZlZS4gV3JpdHRlbiBleGFjdGx5Cm9uY2UgYWxvbmdzaWRlIGBGZWVCcHNgIOKAlCBpc3N1ZSAjNDk3LgAAAAAAAAxGZWVSZWNpcGllbnQ=",
        "AAAAAQAAAH9DcmVhdG9yLWF0dGVzdGVkIHJlY29yZCB0aGF0IGEgbGF1bmNoIHJlYWNoZWQgdGhlIGlzc3VlcidzIHN1Y2Nlc3MKdGhyZXNob2xkLiBXcml0dGVuIG9uY2UgYnkgYGxhdW5jaF9zZWFsYCBhbmQgbmV2ZXIgbW9kaWZpZWQuAAAAAAAAAAAKTGF1bmNoU2VhbAAAAAAAAwAAAAAAAAAKY29tbWl0bWVudAAAAAAD7gAAACAAAAAAAAAABmxlZGdlcgAAAAAABAAAAAAAAAAGc3VwcGx5AAAAAAAL",
        "AAAABAAAAVxUeXBlZCBjb250cmFjdCBlcnJvcnMg4oCUIHN1cmZhY2VkIGluIHJlbGVhc2UgV0FTTSBhcyBudW1lcmljIGNvZGVzLgoKQ29kZXMgMeKAkzMgcHJlLWV4aXN0ZWQgZm9yIGNvbXBsaWFuY2Utbm9kZSBwYXRocyBhbmQgYXJlIHByZXNlcnZlZCBhdCB0aG9zZQp2YWx1ZXMgc28gdGhhdCBleGlzdGluZyBjbGllbnRzIGRvIG5vdCBicmVhay4gVGhlIHJlbWFpbmRlciBjb3ZlciBldmVyeQpvdGhlciBmYWlsdXJlIG1vZGUgc28gdGhhdCBgdHJ5XypgIGNsaWVudCBjYWxscyBjYW4gZGlzdGluZ3Vpc2ggZmFpbHVyZXMKZXZlbiBpbiByZWxlYXNlIGJ1aWxkcyB3aGVyZSBwYW5pYyBzdHJpbmdzIGFyZSBzdHJpcHBlZC4AAAAAAAAAClRva2VuRXJyb3IAAAAAAB8AAAA2VGhlIGNvbXBsaWFuY2Ugbm9kZSBhbnN3ZXJlZCBgY2FuX3RyYWRlYCB3aXRoIGBmYWxzZWAuAAAAAAASQ29tcGxpYW5jZVJlamVjdGVkAAAAAAABAAAAQVRoZSBjb21wbGlhbmNlIG5vZGUgY291bGQgbm90IGJlIGNhbGxlZCBvciByZXR1cm5lZCBhIG5vbi1gYm9vbGAuAAAAAAAAGUNvbXBsaWFuY2VOb2RlVW5hdmFpbGFibGUAAAAAAAACAAAAPVRoZSBhZGRyZXNzIHBhc3NlZCB0byBgc2V0X2NvbXBsaWFuY2Vfbm9kZWAgZmFpbGVkIHRoZSBwcm9iZS4AAAAAAAAVSW52YWxpZENvbXBsaWFuY2VOb2RlAAAAAAAAAwAAAEJgaW5pdGlhbGl6ZWAgd2FzIGNhbGxlZCBvbiBhIGNvbnRyYWN0IHRoYXQgaXMgYWxyZWFkeSBpbml0aWFsaXplZC4AAAAAABJBbHJlYWR5SW5pdGlhbGl6ZWQAAAAAAAQAAAA/VGhlIGNvbnRyYWN0IGlzIHBlcm1hbmVudGx5IGxvY2tlZCAoYHJldm9rZV9hZG1pbmAgd2FzIGNhbGxlZCkuAAAAAAZMb2NrZWQAAAAAAAUAAAAXVGhlIGNvbnRyYWN0IGlzIHBhdXNlZC4AAAAABlBhdXNlZAAAAAAABgAAAD5BbW91bnQgaXMgemVybyBvciBuZWdhdGl2ZSB3aGVyZSBhIHBvc2l0aXZlIHZhbHVlIGlzIHJlcXVpcmVkLgAAAAAADUludmFsaWRBbW91bnQAAAAAAAAHAAAAJlNlbmRlciBoYXMgaW5zdWZmaWNpZW50IHRva2VuIGJhbGFuY2UuAAAAAAATSW5zdWZmaWNpZW50QmFsYW5jZQAAAAAIAAAAI1NwZW5kZXIgaGFzIGluc3VmZmljaWVudCBhbGxvd2FuY2UuAAAAABVJbnN1ZmZpY2llbnRBbGxvd2FuY2UAAAAAAAAJAAAALVRoZSBhY2NvdW50IGlzIGZyb3plbiBhbmQgY2Fubm90IHNlbmQgdG9rZW5zLgAAAAAAAAZGcm96ZW4AAAAAAAoAAAAwUmVjaXBpZW50IGlzIG5vdCBvbiB0aGUgYXV0aG9yaXplZC1ob2xkZXJzIGxpc3QuAAAAE05vdEF1dGhvcml6ZWRIb2xkZXIAAAAACwAAAEVgcmV2b2tlX2F1dGhvcml6YXRpb25gIHdhcyBjYWxsZWQgYnV0IGF1dGhvcml6YXRpb24gaXMgbm90IHJldm9jYWJsZS4AAAAAAAAMTm90UmV2b2NhYmxlAAAADAAAACdNaW50IHdvdWxkIGV4Y2VlZCB0aGUgYG1heF9zdXBwbHlgIGNhcC4AAAAAEEV4Y2VlZHNNYXhTdXBwbHkAAAANAAAAOldBU00gaGFzaCBzdXBwbGllZCB0byBgdXBncmFkZWAgaXMgdGhlIGFsbC16ZXJvcyBzZW50aW5lbC4AAAAAAA9JbnZhbGlkV2FzbUhhc2gAAAAADgAAAERgZXhwaXJhdGlvbl9sZWRnZXJgIGlzIG5vdCBzdHJpY3RseSBncmVhdGVyIHRoYW4gdGhlIGN1cnJlbnQgbGVkZ2VyLgAAABJJbnZhbGlkTGVkZ2VyUmFuZ2UAAAAAAA8AAABEVHJhbnNmZXIgb3IgbWludCB3b3VsZCBwdXNoIHRoZSByZWNpcGllbnQgYWJvdmUgdGhlIHBlci1hY2NvdW50IGNhcC4AAAARRXhjZWVkc01heEJhbGFuY2UAAAAAAAAQAAAAM2BhY2NlcHRfYWRtaW5gIHdhcyBjYWxsZWQgd2l0aCBubyBwZW5kaW5nIHByb3Bvc2FsLgAAAAAOTm9QZW5kaW5nQWRtaW4AAAAAABEAAAA2YGluaXRpYWxfc3VwcGx5YCBleGNlZWRzIGBtYXhfc3VwcGx5YCBpbiBgaW5pdGlhbGl6ZWAuAAAAAAAURXhjZWVkc0luaXRpYWxTdXBwbHkAAAASAAAAGURlY2ltYWwgdmFsdWUgZXhjZWVkcyAxOC4AAAAAAAAPSW52YWxpZERlY2ltYWxzAAAAABMAAAAzYG1pbnRfYmF0Y2hgIHJlY2VpdmVkIHZlY3RvcnMgb2YgZGlmZmVyZW50IGxlbmd0aHMuAAAAABNCYXRjaExlbmd0aE1pc21hdGNoAAAAABQAAAAuYG1pbnRfYmF0Y2hgIHJlY2VpdmVkIGEgYmF0Y2ggbGFyZ2VyIHRoYW4gMTAwLgAAAAAADUJhdGNoVG9vTGFyZ2UAAAAAAAAVAAAAN2Bjb250cmFjdF91cmlgIGdldHRlciBjYWxsZWQgYmVmb3JlIGEgVVJJIGhhcyBiZWVuIHNldC4AAAAAEUNvbnRyYWN0VXJpTm90U2V0AAAAAAAAFgAAADBBIHN0b3JhZ2UgZ2V0dGVyIHdhcyBjYWxsZWQgYmVmb3JlIGBpbml0aWFsaXplYC4AAAAOTm90SW5pdGlhbGl6ZWQAAAAAABcAAABAYHJldm9rZV9hZG1pbmAgcmVxdWlyZXMgdGhlIGNvbXBsaWFuY2Ugbm9kZSB0byBiZSBjbGVhcmVkIGZpcnN0LgAAABtDb21wbGlhbmNlTm9kZU11c3RCZUNsZWFyZWQAAAAAGAAAAIBDb250cmFjdCBVUkkgaXMgZW1wdHksIHRvbyBsb25nLCBjb250YWlucyB3aGl0ZXNwYWNlIG9yIGNvbnRyb2wKY2hhcmFjdGVycywgb3IgdXNlcyBhIHNjaGVtZSBvdGhlciB0aGFuIGBodHRwczovL2Agb3IgYGlwZnM6Ly9gLgAAABJJbnZhbGlkQ29udHJhY3RVcmkAAAAAABkAAACKYHN0cmVhbV9ncmFudGAgd2FzIGNhbGxlZCB3aXRoIGEgbm9uLXBvc2l0aXZlIHRvdGFsLCBhbiBlbmQgbGVkZ2VyIG5vdApzdHJpY3RseSBhZnRlciB0aGUgc3RhcnQgbGVkZ2VyLCBvciBhIG5vbi1wb3NpdGl2ZSBgbWF4X3Blcl9jbGFpbWAuAAAAAAAVSW52YWxpZFN0cmVhbVNjaGVkdWxlAAAAAAAAGgAAAD1gY2xhaW1fc3RyZWFtYCB3YXMgY2FsbGVkIHdpdGggbm8gc2NoZWR1bGUgZm9yIHRoZSByZWNpcGllbnQuAAAAAAAACE5vU3RyZWFtAAAAGwAAAENUaGUgYXV0aG9yaXNlZCBpbnZvY2F0aW9uIGRvZXMgbm90IGNvdmVyIHRoZSByZXF1ZXN0ZWQgY2xhaW0gcmFuZ2UuAAAAABFVbmF1dGhvcml6ZWRDbGFpbQAAAAAAABwAAAA9YGZlZV9icHNgIGV4Y2VlZHMgYE1BWF9GRUVfQlBTYCBpbiBgaW5pdGlhbGl6ZWAgKGlzc3VlICM0OTcpLgAAAAAAAA1JbnZhbGlkRmVlQnBzAAAAAAAAHQAAAEJgcHJvcG9zZV9hZG1pbmAgd2FzIGNhbGxlZCB3aXRoIHRoZSBhZGRyZXNzIHRoYXQgaXMgYWxyZWFkeSBhZG1pbi4AAAAAAAxBbHJlYWR5QWRtaW4AAAAeAAAAPWBhY2NlcHRfYWRtaW5gIHdhcyBjYWxsZWQgYWZ0ZXIgdGhlIHByb3Bvc2FsJ3MgZXhwaXJ5IGxlZGdlci4AAAAAAAAPUHJvcG9zYWxFeHBpcmVkAAAAAB8=",
        "AAAAAQAAAAAAAAAAAAAADkFsbG93YW5jZVZhbHVlAAAAAAACAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAEWV4cGlyYXRpb25fbGVkZ2VyAAAAAAAABA==",
        "AAAAAAAAAJ9CdXJuIGBhbW91bnRgIHRva2VucyBmcm9tIGBmcm9tYC4gT3duZXIgb25seSAoc3RhbmRhcmQgYnVybikuClJlZnVzZXMgdG8gcnVuIHdoZW4gdGhlIGFjY291bnQgaXMgZnJvemVuIHNvIGEgaG9sZGVyIGNhbm5vdApkb2RnZSBhIGZyZWV6ZSBieSBkZXN0cm95aW5nIHRva2Vucy4AAAAABGJ1cm4AAAACAAAAAAAAAARmcm9tAAAAEwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAA==",
        "AAAAAAAAANVNaW50IGBhbW91bnRgIHRva2VucyB0byBgdG9gLiBBZG1pbiBvbmx5LgoKU3ViamVjdCB0byB0aGUgY29tcGxpYW5jZSBub2RlOiBpc3N1YW5jZSBpcyBhIHZhbHVlLW1vdmluZyBwYXRoLCBzbyBhCm5vZGUgdGhhdCByZWplY3RzIGB0b2AgYmxvY2tzIHRoZSBtaW50LiBTZWUgW2BTZWxmOjpfY2hlY2tfY29tcGxpYW5jZWBdCmZvciB0aGUgc2NvcGUgb2YgdGhlIHBvbGljeS4AAAAAAAAEbWludAAAAAIAAAAAAAAAAnRvAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAA",
        "AAAAAAAAAAAAAAAEbmFtZQAAAAAAAAABAAAAEA==",
        "AAAAAAAAAAAAAAAFYWRtaW4AAAAAAAAAAAAAAQAAABM=",
        "AAAAAAAAAEZQYXVzZSB0aGUgY29udHJhY3QsIGhhbHRpbmcgYWxsIHN0YXRlLWNoYW5naW5nIG9wZXJhdGlvbnMuIEFkbWluIG9ubHkuAAAAAAAFcGF1c2UAAAAAAAAAAAAAAA==",
        "AAAAAAAAADJSZXR1cm5zIGB0cnVlYCBvbmNlIGBsYXVuY2hfc2VhbGAgaGFzIGJlZW4gY2FsbGVkLgAAAAAABnNlYWxlZAAAAAAAAAAAAAEAAAAB",
        "AAAAAAAAAAAAAAAGc3ltYm9sAAAAAAAAAAAAAQAAABA=",
        "AAAAAAAAAlNBcHByb3ZlIGBzcGVuZGVyYCB0byBzcGVuZCB1cCB0byBgYW1vdW50YCBvbiBiZWhhbGYgb2YgYGZyb21gLgoKV2hlbiBgYW1vdW50ID4gMGAsIGBleHBpcmF0aW9uX2xlZGdlcmAgbXVzdCBiZSBzdHJpY3RseSBncmVhdGVyIHRoYW4KdGhlIGN1cnJlbnQgbGVkZ2VyIHNlcXVlbmNlLiBUaGUgYWxsb3dhbmNlIGlzIHN0b3JlZCBpbiB0ZW1wb3JhcnkKc3RvcmFnZSBhbmQgaXRzIFRUTCBpcyBjbGFtcGVkIHRvIGBlbnYuc3RvcmFnZSgpLm1heF90dGwoKWAgdG8gYXZvaWQKZXhjZWVkaW5nIHRoZSBuZXR3b3JrLWVuZm9yY2VkIGNlaWxpbmcuCgpXaGVuIGBhbW91bnQgPT0gMGAsIHRoZSBjYWxsIGlzIHRyZWF0ZWQgYXMgYSAqKnJldm9jYXRpb24qKjogdGhlCmFsbG93YW5jZSBlbnRyeSBpcyByZW1vdmVkIGZyb20gc3RvcmFnZSBhbmQgYGV4cGlyYXRpb25fbGVkZ2VyYCBpcwppZ25vcmVkLiBUaGlzIGlzIHRoZSBjYW5vbmljYWwsIHdhbGxldC1lbWl0dGVkIHdheSB0byByZXZva2UgYW4KYWxsb3dhbmNlIChTRVAtNDEgwqc0LjEpIGFuZCB3b3JrcyByZWdhcmRsZXNzIG9mIHRoZSB2YWx1ZSBwYXNzZWQgZm9yCmBleHBpcmF0aW9uX2xlZGdlcmAuAAAAAAdhcHByb3ZlAAAAAAQAAAAAAAAABGZyb20AAAATAAAAAAAAAAdzcGVuZGVyAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAARZXhwaXJhdGlvbl9sZWRnZXIAAAAAAAAEAAAAAA==",
        "AAAAAAAAAAAAAAAHYmFsYW5jZQAAAAABAAAAAAAAAAJpZAAAAAAAEwAAAAEAAAAL",
        "AAAAAAAAACFVbnBhdXNlIHRoZSBjb250cmFjdC4gQWRtaW4gb25seS4AAAAAAAAHdW5wYXVzZQAAAAAAAAAAAA==",
        "AAAAAAAAAMhVcGdyYWRlIHRoaXMgY29udHJhY3QncyBXQVNNIGNvZGUgaGFzaCBpbiBwbGFjZS4gQWRtaW4gb25seS4KClNlY3VyaXR5IG5vdGU6IHRoaXMgcHJlc2VydmVzIGV4aXN0aW5nIHN0b3JhZ2UgYW5kIGNvbnRyYWN0IGFkZHJlc3MsIHNvCm5ldyBXQVNNIG11c3QgcmVtYWluIHN0b3JhZ2UtY29tcGF0aWJsZSB3aXRoIHByZXZpb3VzIGRlcGxveW1lbnRzLgAAAAd1cGdyYWRlAAAAAAEAAAAAAAAADW5ld193YXNtX2hhc2gAAAAAAAPuAAAAIAAAAAA=",
        "AAAAAAAAAdxGb3JjZWZ1bGx5IG1vdmUgYGFtb3VudGAgdG9rZW5zIGZyb20gYGZyb21gIGludG8gdGhlIGFkbWluIGJhbGFuY2UuCkFkbWluIG9ubHkuCgpEZWxpYmVyYXRlIGZyZWV6ZSBieXBhc3M6IHRoaXMgaXMgdGhlIHNhbmN0aW9uZWQgcmVjb3ZlcnkgcGF0aCwgc28gaXQKbW92ZXMgdmFsdWUgZXZlbiB3aGVuIGBmcm9tYCBpcyBmcm96ZW4gYW5kIGV2ZW4gd2hlbiB0aGUgYWRtaW4KcmVjaXBpZW50IHdvdWxkIG90aGVyd2lzZSBiZSBnYXRlZCBieSB0aGUgcmVjZWl2ZS1zaWRlIGZyZWV6ZSBjaGVjay4KRXZlcnkgb3RoZXIgY3JlZGl0IHBhdGggKHRyYW5zZmVyLCB0cmFuc2Zlcl9mcm9tLCBtaW50KSByZWZ1c2VzIGEKZnJvemVuIHJlY2lwaWVudDsgY2xhd2JhY2sgaXMgdGhlIHNpbmdsZSBkb2N1bWVudGVkIGV4Y2VwdGlvbiBzbyBhbgppc3N1ZXIgY2FuIGFsd2F5cyByZWNvdmVyIGZ1bmRzIGZyb20gYSBibGFja2xpc3RlZCBhY2NvdW50LgAAAAhjbGF3YmFjawAAAAIAAAAAAAAABGZyb20AAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAA",
        "AAAAAAAAAAAAAAAIZGVjaW1hbHMAAAAAAAAAAQAAAAQ=",
        "AAAAAAAAAD1UcmFuc2ZlciBgYW1vdW50YCBmcm9tIGBmcm9tYCB0byBgdG9gLiBDYWxsZXIgbXVzdCBiZSBgZnJvbWAuAAAAAAAACHRyYW5zZmVyAAAAAwAAAAAAAAAEZnJvbQAAABMAAAAAAAAAAnRvAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAA",
        "AAAAAAAAAAAAAAAJYWxsb3dhbmNlAAAAAAAAAgAAAAAAAAAEZnJvbQAAABMAAAAAAAAAB3NwZW5kZXIAAAAAEwAAAAEAAAAL",
        "AAAAAAAAALhCdXJuIGBhbW91bnRgIHRva2VucyBmcm9tIGBmcm9tYCB1c2luZyBgc3BlbmRlcmAncyBhbGxvd2FuY2UuClJlZnVzZXMgdG8gcnVuIHdoZW4gYGZyb21gIGlzIGZyb3plbiBzbyBhIGhvbGRlciBjYW5ub3QgZG9kZ2UgYQpmcmVlemUgYnkgaGF2aW5nIGFuIGFwcHJvdmVkIHNwZW5kZXIgZGVzdHJveSB0aGVpciB0b2tlbnMuAAAACWJ1cm5fZnJvbQAAAAAAAAMAAAAAAAAAB3NwZW5kZXIAAAAAEwAAAAAAAAAEZnJvbQAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAA=",
        "AAAAAAAAAtJCdXJuIGBhbW91bnRgIHRva2VucyBmcm9tIHRoZSBjYWxsZXIncyBvd24gYmFsYW5jZS4gUmVmdXNlcyB0bwpydW4gd2hlbiB0aGUgYWNjb3VudCBpcyBmcm96ZW4gc28gYSBob2xkZXIgY2Fubm90IGRvZGdlIGEgZnJlZXplCmJ5IGRlc3Ryb3lpbmcgdG9rZW5zLgoKKipBbGlhcyBmb3IgYGJ1cm5gLCBub3QgYSBzZWNvbmQgaW1wbGVtZW50YXRpb24gb2YgaXQuKiogYGJ1cm5gIGlzIHRoZQpTRVAtNDEgZW50cnkgcG9pbnQ7IHRoaXMgbmFtZSBpcyBub3QsIGFuZCBpdCBpcyBub3Qgb24gdGhlIHN0YW5kYXJkCmZvciBhbnkgd2FsbGV0IHRvIGRpc2NvdmVyLiBUaGUgdHdvIHdlcmUgYnl0ZS1pZGVudGljYWwgaW5jbHVkaW5nIHRoZWlyCmRvYyBjb21tZW50cywgd2hpY2ggbWFkZSB0aGUgY2hvaWNlIGJldHdlZW4gdGhlbSBhcmJpdHJhcnkgYXQgdGhlIEFQSQpzdXJmYWNlIGFuZCBkb3VibGVkIHRoZSB0ZXN0IHN1aXRlIG92ZXIgb25lIGJvZHkgKCMxMDcsICM0NjgpLgoKUmV0YWluZWQgYmVjYXVzZSB0aGUgbGF1bmNocGFkJ3Mgb3duIFVJIGNhbGxzIHRoaXMgbmFtZQooYGJ1aWxkQnVyblRyYW5zYWN0aW9uYCBpbiBgZnJvbnRlbmQvbGliL3N0ZWxsYXIudHNgKS4gRm9yd2FyZGluZyBrZWVwcwp0aGF0IHdvcmtpbmcgd2l0aCBgYnVybmAgYXMgdGhlIHNpbmdsZSBpbXBsZW1lbnRhdGlvbiBhbmQgYGJ1cm5gJ3MKc3VpdGUgYXMgdGhlIHNpbmdsZSB0ZXN0IHN1aXRlLgAAAAAACWJ1cm5fc2VsZgAAAAAAAAIAAAAAAAAABGZyb20AAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAA",
        "AAAAAAAAAC5SZXR1cm5zIGB0cnVlYCBpZiB0aGUgZ2l2ZW4gYWRkcmVzcyBpcyBmcm96ZW4uAAAAAAAJaXNfZnJvemVuAAAAAAAAAQAAAAAAAAAEYWRkcgAAABMAAAABAAAAAQ==",
        "AAAAAAAAAGtSZXR1cm5zIGB0cnVlYCBvbmNlIGByZXZva2VfYWRtaW5gIGhhcyBiZWVuIGNhbGxlZC4gT25jZSBsb2NrZWQsIG5vCmFkbWluIG9wZXJhdGlvbiBjYW4gZXZlciBzdWNjZWVkIGFnYWluLgAAAAAJaXNfbG9ja2VkAAAAAAAAAAAAAAEAAAAB",
        "AAAAAAAAADNSZXR1cm5zIGB0cnVlYCBpZiB0aGUgY29udHJhY3QgaXMgY3VycmVudGx5IHBhdXNlZC4AAAAACWlzX3BhdXNlZAAAAAAAAAAAAAABAAAAAQ==",
        "AAAAAAAAADdGb3JjZWQgYnVybiBvZiBgYW1vdW50YCB0b2tlbnMgZnJvbSBgZnJvbWAuIEFkbWluIG9ubHkuAAAAAApidXJuX2FkbWluAAAAAAACAAAAAAAAAARmcm9tAAAAEwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAA==",
        "AAAAAAAAArZJbml0aWFsaXplIHRoZSB0b2tlbiB3aXRoIG1ldGFkYXRhIGFuZCBhbiBpbml0aWFsIHN1cHBseSBtaW50ZWQgdG8gYGFkbWluYC4KCmBhZG1pbi5yZXF1aXJlX2F1dGgoKWAgaXMgZW5mb3JjZWQgc28gdGhlIGNhbGxlciBtdXN0IHByb3ZlIHRoZXkgY29udHJvbAp0aGUgYWRtaW4gYWRkcmVzcy4gVGhpcyBwcmV2ZW50cyBhIGZyb250LXJ1bm5lciBmcm9tIHNldHRpbmcgYWRtaW4gdG8gYW4KYWRkcmVzcyB0aGV5IGRvICpub3QqIGNvbnRyb2wuIFRoZSBmcm9udGVuZCBzaG91bGQgKiphbHdheXMqKiBwYXNzIHRoZQpkZXBsb3llcidzIG93biBwdWJsaWMga2V5IGFzIGBhZG1pbmAgc28gdGhhdCB0aGUgd2FsbGV0J3Mgc2lnbmF0dXJlCnNhdGlzZmllcyBgcmVxdWlyZV9hdXRoYCBhbmQgdGhlIGF0dGFja2VyIGNhbm5vdCBzdGVhbCB0aGUgcm9sZS4KCmBhdXRob3JpemF0aW9uX3JlcXVpcmVkYDogd2hlbiB0cnVlLCByZWNpcGllbnRzIG11c3QgYmUgZXhwbGljaXRseQphdXRob3JpemVkIGJ5IHRoZSBhZG1pbiBiZWZvcmUgdGhleSBjYW4gcmVjZWl2ZSBvciBob2xkIHRva2Vucy4KCmBhdXRob3JpemF0aW9uX3Jldm9jYWJsZWA6IHdoZW4gdHJ1ZSwgdGhlIGFkbWluIG1heSByZXZva2UgYSBob2xkZXIncwphdXRob3JpemF0aW9uLCBwcmV2ZW50aW5nIHRoZW0gZnJvbSByZWNlaXZpbmcgZnVydGhlciB0cmFuc2ZlcnMuAAAAAAAKaW5pdGlhbGl6ZQAAAAAADAAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAdkZWNpbWFsAAAAAAQAAAAAAAAABG5hbWUAAAAQAAAAAAAAAAZzeW1ib2wAAAAAABAAAAAAAAAADmluaXRpYWxfc3VwcGx5AAAAAAALAAAAAAAAAAptYXhfc3VwcGx5AAAAAAPoAAAACwAAAAAAAAAWYXV0aG9yaXphdGlvbl9yZXF1aXJlZAAAAAAAAQAAAAAAAAAXYXV0aG9yaXphdGlvbl9yZXZvY2FibGUAAAAAAQAAAAAAAAAPY29tcGxpYW5jZV9ub2RlAAAAA+gAAAATAAAAAAAAAAxjb250cmFjdF91cmkAAAPoAAAAEAAAAAAAAAAHZmVlX2JwcwAAAAAEAAAAAAAAAA1mZWVfcmVjaXBpZW50AAAAAAAAEwAAAAA=",
        "AAAAAAAAAIVSZXR1cm5zIHRoZSBpbW11dGFibGUgc3VwcGx5IGNlaWxpbmcgcmVjb3JkZWQgYXQgaW5pdGlhbGl6YXRpb24uCkl0IHJlbWFpbnMgdXNlZnVsIGFmdGVyIGFkbWluIHJldm9jYXRpb24gYXMgYSBoaXN0b3JpY2FsIHRva2VuIGZhY3QuAAAAAAAACm1heF9zdXBwbHkAAAAAAAAAAAABAAAD6AAAAAs=",
        "AAAAAAAAAZBNaW50IGBhbW91bnRgIHRva2VucyB0byBtdWx0aXBsZSByZWNpcGllbnRzLiBBZG1pbiBvbmx5LgoKTWF4aW11bSBiYXRjaCBzaXplIGlzIDEwMCB0byBzdGF5IHdpdGhpbiBTb3JvYmFuJ3MgY29tcHV0ZSBidWRnZXQuCgpFYWNoIHJlY2lwaWVudCBpcyBjaGVja2VkIGFnYWluc3QgdGhlIGNvbXBsaWFuY2Ugbm9kZSBpbmRpdmlkdWFsbHksIHNvCm9uZSByZWplY3RlZCByZWNpcGllbnQgcmV2ZXJ0cyB0aGUgd2hvbGUgYmF0Y2guIE5vdGUgdGhhdCBhIGNvbXBsaWFuY2UKbm9kZSBtYWtlcyB0aGUgZWZmZWN0aXZlIGJhdGNoIGxpbWl0IHNtYWxsZXIgaW4gcHJhY3RpY2UsIGJlY2F1c2UgZXZlcnkKZW50cnkgYWRkcyBhIGNyb3NzLWNvbnRyYWN0IGNhbGwgdG8gdGhlIGludm9jYXRpb24ncyBidWRnZXQuAAAACm1pbnRfYmF0Y2gAAAAAAAIAAAAAAAAAAnRvAAAAAAPqAAAAEwAAAAAAAAAHYW1vdW50cwAAAAPqAAAACwAAAAA=",
        "AAAAAAAAAXZSZWNvcmQgdGhhdCB0aGlzIGxhdW5jaCByZWFjaGVkIHRoZSBpc3N1ZXIncyBkZWZpbml0aW9uIG9mIHN1Y2Nlc3MuCkFkbWluIG9ubHksIGFuZCBjYW4gb25seSBiZSBjYWxsZWQgb25jZS4KCmBjb21taXRtZW50YCBpcyBhbiBvcGFxdWUgMzItYnl0ZSB2YWx1ZSBjaG9zZW4gYnkgdGhlIGlzc3VlciAoZS5nLiB0aGUKaGFzaCBvZiBhIHB1Ymxpc2hlZCBzdWNjZXNzIGNyaXRlcmlvbikuIFRoZSBsZWRnZXIgc2VxdWVuY2UgYW5kIHRvdGFsCnN1cHBseSBhdCB0aGUgbW9tZW50IG9mIHNlYWxpbmcgYXJlIHN0b3JlZCBhbG9uZ3NpZGUgaXQsIGdpdmluZwppbmRleGVycyBhbiBvYmplY3RpdmUsIG9uLWNoYWluIHNpZ25hbCB0byBzb3J0IGxhdW5jaGVzIGJ5LgAAAAAAC2xhdW5jaF9zZWFsAAAAAAEAAAAAAAAACmNvbW1pdG1lbnQAAAAAA+4AAAAgAAAAAA==",
        "AAAAAAAAAD9SZXR1cm5zIHRoZSBzY2hlZHVsZSBmb3IgYHJlY2lwaWVudGAsIG9yIGBOb25lYCBpZiBub25lIGV4aXN0cy4AAAAAC3N0cmVhbV9pbmZvAAAAAAEAAAAAAAAACXJlY2lwaWVudAAAAAAAABMAAAABAAAD6AAAB9AAAAAGU3RyZWFtAAA=",
        "AAAAAAAAADtBY2NlcHQgdGhlIGFkbWluIHJvbGUuIE11c3QgYmUgY2FsbGVkIGJ5IHRoZSBwZW5kaW5nIGFkbWluLgAAAAAMYWNjZXB0X2FkbWluAAAAAAAAAAA=",
        "AAAAAAAAAL9SZXR1cm5zIHRoZSBjdXJyZW50IGFkbWluaXN0cmF0b3Igd2l0aG91dCB0cmVhdGluZyBhbiBpbnRlbnRpb25hbGx5CmxvY2tlZCB0b2tlbiBhcyBhbiBlcnJvci4gYGFkbWluKClgIHJlbWFpbnMgdGhlIHN0cmljdCBjb21wYXRpYmlsaXR5CnZpZXcgZm9yIGNhbGxlcnMgdGhhdCByZXF1aXJlIGFuIGFjdGl2ZSBhZG1pbmlzdHJhdG9yLgAAAAAMYWRtaW5faWZfYW55AAAAAAAAAAEAAAPoAAAAEw==",
        "AAAAAAAAAYZSZWxlYXNlIGFjY3J1ZWQgdG9rZW5zIHRvIGByZWNpcGllbnRgIGFnYWluc3QgYSBzY29wZWQgYXV0aG9yaXNhdGlvbi4KClRoZSByZWNpcGllbnQgcHJlLWF1dGhvcmlzZXMgYSBib3VuZGVkIGNsYWltIHJhbmdlIG9uY2UsIG9mZi1jaGFpbjsKYSByZWxheWVyIHN1Ym1pdHMgdGhlIGNsYWltLCBhbmQgYHJlcXVpcmVfYXV0aF9mb3JfYXJnc2AgbWFrZXMgdGhlCmhvc3QgZW5mb3JjZSB0aGF0IHRoZSBzaWduYXR1cmUgY292ZXJzIGV4YWN0bHkgYChyZWNpcGllbnQsCmZyb21fbGVkZ2VyLCB0b19sZWRnZXIpYCBiZWZvcmUgdGhlIGNvbnRyYWN0IHBheXMKYGFjY3J1ZWQodG9fbGVkZ2VyKSAtIHJlbGVhc2VkYCwgY2FwcGVkIGF0IHRoZSBzY2hlZHVsZSdzCmBtYXhfcGVyX2NsYWltYC4AAAAAAAxjbGFpbV9zdHJlYW0AAAADAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAAAAAAAAtmcm9tX2xlZGdlcgAAAAAEAAAAAAAAAAl0b19sZWRnZXIAAAAAAAAEAAAAAA==",
        "AAAAAAAAAK1SZXR1cm5zIHRoZSBjb250cmFjdCBtZXRhZGF0YSBVUkksIGlmIG9uZSBoYXMgYmVlbiBjb25maWd1cmVkLiBUaGUgVVJJCnJlbWFpbnMgcmVhZGFibGUgYWZ0ZXIgbG9ja2luZyBiZWNhdXNlIGl0IGlzIGhpc3RvcmljYWwgbWV0YWRhdGEsIG5vdAphbiBhY3RpdmUgYWRtaW5pc3RyYXRpdmUgcG9saWN5LgAAAAAAAAxjb250cmFjdF91cmkAAAAAAAAAAQAAA+gAAAAQ",
        "AAAAAAAAA0BQZXJtYW5lbnRseSByZXZva2UgdGhlIGFkbWluIHJvbGUgYW5kIGxvY2sgdGhlIGNvbnRyYWN0LgoKQWZ0ZXIgdGhpcyBjYWxsOgotIE5vIGZ1cnRoZXIgYG1pbnRgLCBgYnVybl9hZG1pbmAsIGBmcmVlemVgLCBgdW5mcmVlemVgLApgcHJvcG9zZV9hZG1pbmAsIGBhY2NlcHRfYWRtaW5gLCBgcGF1c2VgLCBvcgpgdW5wYXVzZWAgb3BlcmF0aW9uIGNhbiBldmVyIHN1Y2NlZWQuCi0gVGhlIEFkbWluIHN0b3JhZ2UgZW50cnkgaXMgcmVtb3ZlZCBhbmQgYSBgTG9ja2VkYCBmbGFnIGlzIHNldC4KLSBgaXNfbG9ja2VkKClgIHJldHVybnMgYHRydWVgIGZyb20gdGhlbiBvbi4KCkEgY29uZmlndXJlZCBjb21wbGlhbmNlIG5vZGUgbXVzdCBiZSBjbGVhcmVkIGZpcnN0LiBJdHMgZmFpbHVyZSBtb2RlIGlzCmZhaWwtY2xvc2VkLCBhbmQgbm8gYWRtaW5pc3RyYXRvciByZW1haW5zIGFmdGVyIHRoaXMgY2FsbCB0byBjbGVhciBpdC4KT25jZSByZXZvY2F0aW9uIHN1Y2NlZWRzLCBob2xkZXJzIGNhbiBzdGlsbCBgdHJhbnNmZXJgLCBgYXBwcm92ZWAsCmB0cmFuc2Zlcl9mcm9tYCwgYGJ1cm5gLCBhbmQgYGJ1cm5fc2VsZmA7IHRoZSB0b2tlbiBiZWNvbWVzIHRydXN0bGVzcyAvCmltbXV0YWJsZS4KCkFueSBtYXgtYmFsYW5jZS1wZXItYWNjb3VudCBjYXAgc2V0IHZpYQpbYHNldF9tYXhfYmFsYW5jZV9wZXJfYWNjb3VudGBdKFNlbGY6OnNldF9tYXhfYmFsYW5jZV9wZXJfYWNjb3VudCkgaXMKYWxzbyBkZWFjdGl2YXRlZCDigJQgdGhlIGNhcCBpcyBvbmx5IGVuZm9yY2VkIHdoaWxlIGFuIGFkbWluIGV4aXN0cy4KCioqVGhpcyBhY3Rpb24gaXMgaXJyZXZlcnNpYmxlLioqAAAADHJldm9rZV9hZG1pbgAAAAAAAAAA",
        "AAAAAAAAATJDcmVhdGUgYSBjb250aW51b3VzLXZlc3Rpbmcgc3RyZWFtIGZvciBgcmVjaXBpZW50YC4gQWRtaW4gb25seS4KCmB0b3RhbGAgYWNjcnVlcyBsaW5lYXJseSBmcm9tIGBzdGFydF9sZWRnZXJgIHRvIGBlbmRfbGVkZ2VyYCwgYW5kIHRoZQpyZWNpcGllbnQgbWF5IHJlbGVhc2UgYWNjcnVlZCB0b2tlbnMgd2l0aCBgY2xhaW1fc3RyZWFtYCB1cCB0bwpgbWF4X3Blcl9jbGFpbWAgcGVyIGNhbGwuIFRoZSBib3VuZCBpcyB3aGF0IGtlZXBzIGEgc2luZ2xlIGF1dGhvcmlzZWQKaW52b2NhdGlvbiBmcm9tIGRyYWluaW5nIHRoZSBjb250cmFjdC4AAAAAAAxzdHJlYW1fZ3JhbnQAAAAFAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAAAAAAAAV0b3RhbAAAAAAAAAsAAAAAAAAADHN0YXJ0X2xlZGdlcgAAAAQAAAAAAAAACmVuZF9sZWRnZXIAAAAAAAQAAAAAAAAADW1heF9wZXJfY2xhaW0AAAAAAAALAAAAAA==",
        "AAAAAAAAAAAAAAAMdG90YWxfYnVybmVkAAAAAAAAAAEAAAAL",
        "AAAAAAAAAAAAAAAMdG90YWxfc3VwcGx5AAAAAAAAAAEAAAAL",
        "AAAAAAAAAHxSZXR1cm5zIGB0cnVlYCBpZiBgaG9sZGVyYCBpcyBhdXRob3JpemVkIHRvIHJlY2VpdmUgdG9rZW5zLgpBbHdheXMgcmV0dXJucyBgdHJ1ZWAgd2hlbiBgYXV0aG9yaXphdGlvbl9yZXF1aXJlZGAgaXMgZGlzYWJsZWQuAAAADWlzX2F1dGhvcml6ZWQAAAAAAAABAAAAAAAAAAZob2xkZXIAAAAAABMAAAABAAAAAQ==",
        "AAAAAAAAAUpSZXR1cm5zIHRoZSBhZGRyZXNzIHByb3Bvc2VkIHZpYSBgcHJvcG9zZV9hZG1pbmAgdGhhdCBoYXMgbm90IHlldAphY2NlcHRlZCB0aGUgcm9sZSwgb3IgYE5vbmVgIHdoZW4gbm8gdHdvLXN0ZXAgdHJhbnNmZXIgaXMgaW4KcHJvZ3Jlc3MuIFRoZSBlbnRyeSBpcyB3cml0dGVuIGJ5IGBwcm9wb3NlX2FkbWluYCBhbmQgY2xlYXJlZCBieQpgYWNjZXB0X2FkbWluYCwgYGNhbmNlbF9hZG1pbl9wcm9wb3NhbGAsIG9yIGByZXZva2VfYWRtaW5gOyBpZiB0aGUKcHJvcG9zYWwgaGFzIGV4cGlyZWQgaXQgaXMgYWxzbyBjbGVhcmVkIHNvIHN0YWxlIHN0YXRlIGRvZXMgbm90IGxpbmdlci4AAAAAAA1wZW5kaW5nX2FkbWluAAAAAAAAAAAAAAEAAAPoAAAAEw==",
        "AAAAAAAAAHpQcm9wb3NlIGEgbmV3IGFkbWluLiBNdXN0IGJlIGNhbGxlZCBieSB0aGUgY3VycmVudCBhZG1pbi4KVGhlIG5ldyBhZG1pbiBtdXN0IGNhbGwgYGFjY2VwdF9hZG1pbmAgdG8gZmluYWxpemUgdGhlIHRyYW5zZmVyLgAAAAAADXByb3Bvc2VfYWRtaW4AAAAAAAABAAAAAAAAAAluZXdfYWRtaW4AAAAAAAATAAAAAA==",
        "AAAAAAAAAEJUcmFuc2ZlciBgYW1vdW50YCBmcm9tIGBmcm9tYCB0byBgdG9gIHVzaW5nIGBzcGVuZGVyYCdzIGFsbG93YW5jZS4AAAAAAA10cmFuc2Zlcl9mcm9tAAAAAAAABAAAAAAAAAAHc3BlbmRlcgAAAAATAAAAAAAAAARmcm9tAAAAEwAAAAAAAAACdG8AAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAA=",
        "AAAAAAAAAOxGcmVlemUgYW4gYWNjb3VudCAoYmxhY2tsaXN0KTogaXQgY2Fubm90IHNlbmQgb3IgcmVjZWl2ZSB0b2tlbnMsIGFuZAp0aGUgYWRtaW4gY2Fubm90IG1pbnQgaW50byBpdC4gQWRtaW4gb25seS4KCkFkbWluIFtgY2xhd2JhY2tgXShTZWxmOjpjbGF3YmFjaykgaXMgdGhlIHNvbGUgZXhjZXB0aW9uIGFuZCBtYXkgc3RpbGwKcHVsbCB0b2tlbnMgZnJvbSBhIGZyb3plbiBhY2NvdW50IGJhY2sgdG8gdGhlIGFkbWluLgAAAA5mcmVlemVfYWNjb3VudAAAAAAAAQAAAAAAAAAEYWRkcgAAABMAAAAA",
        "AAAAAAAAALdQdXJlLWFyaXRobWV0aWMgdmlldyBvZiBob3cgbXVjaCBoYXMgYWNjcnVlZCB0byBgcmVjaXBpZW50YCBieQpgbGVkZ2VyYC4gTmV2ZXIgdG91Y2hlcyB0aGUgdG9rZW4sIHNvIGl0IGlzIHNhZmUgdG8gY2FsbCB3aGlsZSB0aGUKY29udHJhY3QgaXMgcGF1c2VkIG9yIHRoZSByZWNpcGllbnQgaXMgZnJvemVuICgjMTY4KS4AAAAADnN0cmVhbV9hY2NydWVkAAAAAAACAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAAAAAAAAZsZWRnZXIAAAAAAAQAAAABAAAACw==",
        "AAAAAAAAAC9SZXR1cm5zIHRoZSBjb25maWd1cmVkIGNvbXBsaWFuY2Ugbm9kZSwgaWYgYW55LgAAAAAPY29tcGxpYW5jZV9ub2RlAAAAAAAAAAABAAAD6AAAABM=",
        "AAAAAAAAAHZHcmFudCBhdXRob3JpemF0aW9uIHRvIGBob2xkZXJgLCBhbGxvd2luZyB0aGVtIHRvIHJlY2VpdmUgdG9rZW5zIHdoZW4KYGF1dGhvcml6YXRpb25fcmVxdWlyZWRgIGlzIGVuYWJsZWQuIEFkbWluIG9ubHkuAAAAAAAQYXV0aG9yaXplX2hvbGRlcgAAAAEAAAAAAAAABmhvbGRlcgAAAAAAEwAAAAA=",
        "AAAAAAAAAEVSZXR1cm5zIHRoZSBzZWFsIHJlY29yZCwgb3IgYE5vbmVgIGlmIHRoZSBsYXVuY2ggaGFzIG5vdCBiZWVuIHNlYWxlZC4AAAAAAAAQbGF1bmNoX3NlYWxfaW5mbwAAAAAAAAABAAAD6AAAB9AAAAAKTGF1bmNoU2VhbAAA",
        "AAAAAAAAADFVbmZyZWV6ZSBhIHByZXZpb3VzbHkgZnJvemVuIGFjY291bnQuIEFkbWluIG9ubHkuAAAAAAAAEHVuZnJlZXplX2FjY291bnQAAAABAAAAAAAAAARhZGRyAAAAEwAAAAA=",
        "AAAAAAAAAvtTZXQsIHVwZGF0ZSwgb3IgcmVtb3ZlIHRoZSBvcHRpb25hbCBjb21wbGlhbmNlIG5vZGUgYWRkcmVzcy4KQWRtaW4gb25seS4gUGFzcyBgTm9uZWAgdG8gcmVtb3ZlIHRoZSBjb21wbGlhbmNlIG5vZGUuCgpUaGUgY2FuZGlkYXRlIGFkZHJlc3MgaXMgKipwcm9iZWQgYmVmb3JlIGl0IGlzIHN0b3JlZCoqOiB0aGUgY29udHJhY3QKY2FsbHMgYGNhbl90cmFkZWAgb24gaXQgb25jZSB3aXRoIGl0cyBvd24gYWRkcmVzcyBvbiBib3RoIHNpZGVzIGFuZApyZWplY3RzIHRoZSBhZGRyZXNzIHdpdGggW2BUb2tlbkVycm9yOjpJbnZhbGlkQ29tcGxpYW5jZU5vZGVgXSB1bmxlc3MKdGhlIGNhbGwgc3VjY2VlZHMgYW5kIHJldHVybnMgYSBgYm9vbGAuIFRoZSBwcm9iZSdzIGFuc3dlciBpcyBpZ25vcmVkIOKAlApvbmx5IGl0cyBjYWxsYWJpbGl0eSBtYXR0ZXJzLiBUaGlzIGlzIHdoYXQgc3RvcHMgdGhlIGNvbW1vbiBicmlja2luZwptaXN0YWtlIG9mIHBvaW50aW5nIHRoZSB0b2tlbiBhdCBhIG5vbi1jb250cmFjdCBhZGRyZXNzLCBhdCBhIGNvbnRyYWN0CndpdGhvdXQgYGNhbl90cmFkZWAsIG9yIGF0IHRoZSB0b2tlbidzIG93biBhZGRyZXNzICh3aGljaCBmYWlscyBhcwpyZS1lbnRyeSkuCgpDbGVhcmluZyB0aGUgbm9kZSAoYE5vbmVgKSBuZXZlciBwcm9iZXMgYW55dGhpbmcsIHNvIGFuIGFkbWluIGNhbiBhbHdheXMKcmVjb3ZlciBmcm9tIGEgbm9kZSB0aGF0IGhhcyBzaW5jZSBiZWVuIGFyY2hpdmVkIG9yIGhhcyBzdGFydGVkIGZhaWxpbmcuAAAAABNzZXRfY29tcGxpYW5jZV9ub2RlAAAAAAEAAAAAAAAABG5vZGUAAAPoAAAAEwAAAAA=",
        "AAAAAAAAANlTZXQgb3IgdXBkYXRlIHRoZSBjb250cmFjdCBVUkkgcG9pbnRpbmcgdG8gb2ZmLWNoYWluIG1ldGFkYXRhIEpTT04uCkFkbWluIG9ubHkuCgpPbmx5IGBodHRwczovL2AgYW5kIGBpcGZzOi8vYCBVUklzIG9mIGF0IG1vc3QgYE1BWF9DT05UUkFDVF9VUklfTEVOYApieXRlcyBhcmUgYWNjZXB0ZWQ7IGFueXRoaW5nIGVsc2UgcGFuaWNzIHdpdGggYEludmFsaWRDb250cmFjdFVyaWAuAAAAAAAAE3VwZGF0ZV9jb250cmFjdF91cmkAAAAAAQAAAAAAAAADdXJpAAAAABAAAAAA",
        "AAAAAAAAAGdSZXZva2UgYXV0aG9yaXphdGlvbiBmcm9tIGBob2xkZXJgLiBPbmx5IGFsbG93ZWQgd2hlbgpgYXV0aG9yaXphdGlvbl9yZXZvY2FibGVgIGlzIGVuYWJsZWQuIEFkbWluIG9ubHkuAAAAABRyZXZva2VfYXV0aG9yaXphdGlvbgAAAAEAAAAAAAAABmhvbGRlcgAAAAAAEwAAAAA=",
        "AAAAAAAAAEVDYW5jZWwgYSBwZW5kaW5nIGFkbWluIHRyYW5zZmVyLiBNdXN0IGJlIGNhbGxlZCBieSB0aGUgY3VycmVudCBhZG1pbi4AAAAAAAAVY2FuY2VsX2FkbWluX3Byb3Bvc2FsAAAAAAAAAAAAAAA=",
        "AAAAAAAAAFpSZXR1cm5zIGB0cnVlYCBpZiB0aGlzIHRva2VuIHJlcXVpcmVzIGhvbGRlcnMgdG8gYmUgYXV0aG9yaXplZCBiZWZvcmUKcmVjZWl2aW5nIHRyYW5zZmVycy4AAAAAABZhdXRob3JpemF0aW9uX3JlcXVpcmVkAAAAAAAAAAAAAQAAAAE=",
        "AAAAAAAAADxSZXR1cm5zIGB0cnVlYCBpZiB0aGUgYWRtaW4gbWF5IHJldm9rZSBob2xkZXIgYXV0aG9yaXphdGlvbi4AAAAXYXV0aG9yaXphdGlvbl9yZXZvY2FibGUAAAAAAAAAAAEAAAAB",
        "AAAAAAAAApdPcHRpb25hbCB3aGFsZSBwcm90ZWN0aW9uOiBtYXggYmFsYW5jZSBwZXIgYWNjb3VudCBhcyBhIHBlcmNlbnRhZ2Ugb2YgdG90YWwgc3VwcGx5LgoKSWYgc2V0IHRvIGBwYCwgdGhlbiBmb3IgYW55IHRyYW5zZmVyL21pbnQgdG8gYSBub24tYWRtaW4gcmVjaXBpZW50OgpgYmFsYW5jZShyZWNpcGllbnQpIDw9IHRvdGFsX3N1cHBseSAqIHAgLyAxMDBgLgoKVGhlIGNhcCBpcyBvbmx5IGVuZm9yY2VkIHdoaWxlIGFuIGFkbWluIGV4aXN0cy4gQWZ0ZXIKW2ByZXZva2VfYWRtaW5gXShTZWxmOjpyZXZva2VfYWRtaW4pIHJlbW92ZXMgdGhlIGFkbWluIHRoZSBjYXAgYmVjb21lcwppbmFjdGl2ZSBzbyB0aGUgdG9rZW4gcmVtYWlucyBmdWxseSB0cmFuc2ZlcmFibGUuCgpPbmNlIHRoZSBjb250cmFjdCBpcyBsb2NrZWQgdGhpcyByZXR1cm5zIGBOb25lYCBldmVuIGlmIGEgcGVyY2VudGFnZSB3YXMKc3RvcmVkLCBzbyB0aGUgZ2V0dGVyIG5ldmVyIHJlcG9ydHMgYSBsaW1pdCB0aGF0IGlzIG5vdCBiZWluZyBlbmZvcmNlZC4KVGhlIHN0b3JlZCB2YWx1ZSBpcyBkZWxpYmVyYXRlbHkgbGVmdCBpbiBwbGFjZSAoc28gYSBjb3VudGVyZmFjdHVhbApyZS1pbml0IGFmdGVyIGEgZnV0dXJlIHVwZ3JhZGUgc2VlcyBpdCkgYnV0IGlzIG1hc2tlZCBieSB0aGUgbG9jayBzdGF0ZS4AAAAAF21heF9iYWxhbmNlX3Blcl9hY2NvdW50AAAAAAAAAAABAAAD6AAAAAQ=",
        "AAAAAAAAAaRFbmFibGUgb3IgZGlzYWJsZSB0aGUgYXV0aG9yaXphdGlvbi1nYXRlIHBvbGljeSBhZnRlciBkZXBsb3kuIEFkbWluCm9ubHkuIFByZXZpb3VzbHkgYGF1dGhvcml6YXRpb25fcmVxdWlyZWRgIHdhcyB3cml0dGVuIG9uY2UgYXQKYGluaXRpYWxpemVgIHdpdGggbm8gd2F5IHRvIGNoYW5nZSBpdCBsYXRlciwgc28gYSB0b2tlbiBkZXBsb3llZAp3aXRob3V0IGdhdGluZyBjb3VsZCBuZXZlciBhZGQgaXQgZm9yIGEgbGF0ZXIgcmVndWxhdGVkIHJhaXNlLCBhbmQgb25lCmRlcGxveWVkIHdpdGggZ2F0aW5nIGNvdWxkIG5ldmVyIHR1cm4gaXQgb2ZmIGZvciBpdHMgaG9sZGVycyAoaXNzdWUKIzQwNCkuIGBfcmVxdWlyZV9hZG1pbmAgYWxyZWFkeSBjb3ZlcnMgYm90aCB0aGUgYWRtaW4gY2hlY2sgYW5kCmBfcmVxdWlyZV9ub3RfbG9ja2VkYC4AAAAac2V0X2F1dGhvcml6YXRpb25fcmVxdWlyZWQAAAAAAAEAAAAAAAAACHJlcXVpcmVkAAAAAQAAAAA=",
        "AAAAAAAAAXFTZXQgdGhlIG9wdGlvbmFsIG1heCBiYWxhbmNlIHBlciBhY2NvdW50IGFzIGEgcGVyY2VudGFnZSBvZiB0b3RhbCBzdXBwbHkuCkFkbWluIG9ubHkuCgotIGBOb25lYCBkaXNhYmxlcyB3aGFsZSBwcm90ZWN0aW9uCi0gYFNvbWUocClgIGVuYWJsZXMgaXQsIHdoZXJlIGBwYCBtdXN0IGJlIGJldHdlZW4gMSBhbmQgMTAwIChpbmNsdXNpdmUpCgpUaGUgY2FwIGlzIG9ubHkgZW5mb3JjZWQgd2hpbGUgYW4gYWRtaW4gZXhpc3RzLiBBZnRlcgpbYHJldm9rZV9hZG1pbmBdKFNlbGY6OnJldm9rZV9hZG1pbikgcmVtb3ZlcyB0aGUgYWRtaW4gdGhlIGNhcCBiZWNvbWVzCmluYWN0aXZlIHNvIHRoZSB0b2tlbiByZW1haW5zIGZ1bGx5IHRyYW5zZmVyYWJsZS4AAAAAAAAbc2V0X21heF9iYWxhbmNlX3Blcl9hY2NvdW50AAAAAAEAAAAAAAAAF21heF9iYWxhbmNlX3Blcl9hY2NvdW50AAAAA+gAAAAEAAAAAA==",
        "AAAAAAAAAYtQZXJtYW5lbnRseSBnaXZlIHVwIHRoZSBhZG1pbidzIGFiaWxpdHkgdG8gcmV2b2tlIGhvbGRlcgphdXRob3JpemF0aW9uLiBPbmUtd2F5IG9ubHk6IHRoaXMgY2FuIHR1cm4gYGF1dGhvcml6YXRpb25fcmV2b2NhYmxlYApmcm9tIGB0cnVlYCB0byBgZmFsc2VgLCBuZXZlciBiYWNrLiBUaGF0IGRpcmVjdGlvbiBvbmx5IGV2ZXIgKnJlZHVjZXMqCmFkbWluIHBvd2VyLCBzbyBpdCBpcyBzYWZlIHRvIGFsbG93IHdpdGhvdXQgYSBzZWNvbmQgY29uZmlybWF0aW9uCnN0ZXA7IHRoZSByZXZlcnNlIChncmFudGluZyByZXZvY2F0aW9uIHBvd2VyIHRoZSBkZXBsb3ktdGltZSBjaG9pY2UKZGVjbGluZWQpIGlzIG5vdCBvZmZlcmVkLCBtYXRjaGluZyAjNDA0J3MgIm9uZS13YXkiIHJlcXVpcmVtZW50LgAAAAAgcmVub3VuY2VfYXV0aG9yaXphdGlvbl9yZXZvY2FibGUAAAAAAAAAAA==" ]),
      options
    )
  }
  public readonly fromJSON = {
    burn: this.txFromJSON<null>,
        mint: this.txFromJSON<null>,
        name: this.txFromJSON<string>,
        admin: this.txFromJSON<string>,
        pause: this.txFromJSON<null>,
        sealed: this.txFromJSON<boolean>,
        symbol: this.txFromJSON<string>,
        approve: this.txFromJSON<null>,
        balance: this.txFromJSON<i128>,
        unpause: this.txFromJSON<null>,
        upgrade: this.txFromJSON<null>,
        clawback: this.txFromJSON<null>,
        decimals: this.txFromJSON<u32>,
        transfer: this.txFromJSON<null>,
        allowance: this.txFromJSON<i128>,
        burn_from: this.txFromJSON<null>,
        burn_self: this.txFromJSON<null>,
        is_frozen: this.txFromJSON<boolean>,
        is_locked: this.txFromJSON<boolean>,
        is_paused: this.txFromJSON<boolean>,
        burn_admin: this.txFromJSON<null>,
        initialize: this.txFromJSON<null>,
        max_supply: this.txFromJSON<Option<i128>>,
        mint_batch: this.txFromJSON<null>,
        launch_seal: this.txFromJSON<null>,
        stream_info: this.txFromJSON<Option<Stream>>,
        accept_admin: this.txFromJSON<null>,
        admin_if_any: this.txFromJSON<Option<string>>,
        claim_stream: this.txFromJSON<null>,
        contract_uri: this.txFromJSON<Option<string>>,
        revoke_admin: this.txFromJSON<null>,
        stream_grant: this.txFromJSON<null>,
        total_burned: this.txFromJSON<i128>,
        total_supply: this.txFromJSON<i128>,
        is_authorized: this.txFromJSON<boolean>,
        pending_admin: this.txFromJSON<Option<string>>,
        propose_admin: this.txFromJSON<null>,
        transfer_from: this.txFromJSON<null>,
        freeze_account: this.txFromJSON<null>,
        stream_accrued: this.txFromJSON<i128>,
        compliance_node: this.txFromJSON<Option<string>>,
        authorize_holder: this.txFromJSON<null>,
        launch_seal_info: this.txFromJSON<Option<LaunchSeal>>,
        unfreeze_account: this.txFromJSON<null>,
        set_compliance_node: this.txFromJSON<null>,
        update_contract_uri: this.txFromJSON<null>,
        revoke_authorization: this.txFromJSON<null>,
        cancel_admin_proposal: this.txFromJSON<null>,
        authorization_required: this.txFromJSON<boolean>,
        authorization_revocable: this.txFromJSON<boolean>,
        max_balance_per_account: this.txFromJSON<Option<u32>>,
        set_authorization_required: this.txFromJSON<null>,
        set_max_balance_per_account: this.txFromJSON<null>,
        renounce_authorization_revocable: this.txFromJSON<null>
  }
}