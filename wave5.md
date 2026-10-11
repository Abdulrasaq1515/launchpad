# 📋 SoroPad Issue Tracker — Wave 5

_Verified against the current codebase. Every issue below was confirmed by reading the relevant source files._

**Pending from Wave 4 (not yet implemented):** Issues 19, 20, 27, 28.

Complexity levels:

- 🟢 **Trivial** (100 pts) — Small, well-defined
- 🟡 **Medium** (150 pts) — Standard features or involved bug fixes
- 🔴 **High** (200 pts) — Complex features, integrations, or architectural changes

---

## Part 1: Critical Bugs (Broken in Production)

### 29. AdminPanel: Mint / Clawback / Vesting Amounts Are Not Decimal-Scaled

🔴 **High** · `frontend` `admin` `rpc`

**File:** `app/dashboard/[contractId]/components/AdminPanel.tsx` — `handleAction()` (lines 264–265, 268–269, 289)

**Issue:** All three write operations pass raw integer amounts to the contract without multiplying by `10^decimals`:

```ts
// mint
args = [addressToScVal(mintData.to), i128ToScVal(BigInt(mintData.amount))];
// clawback
args = [addressToScVal(burnData.from), i128ToScVal(BigInt(burnData.amount))];
// vesting
i128ToScVal(BigInt(vestingData.amount)),
```

An admin who types `100` intends to mint 100 display tokens. A token with 7 decimals expects `1_000_000_000` raw units. The current code sends `100`, which equals `0.0000100` tokens — off by seven orders of magnitude.

Additionally, `AdminPanel` receives no `decimals` prop (`AdminPanelProps` has only `contractId`, `maxSupply`, `totalSupply`), so the caller must be updated as well.

**Fix:** Add a `decimals: number` prop to `AdminPanel`. In `handleAction`, scale every amount before encoding:
```ts
i128ToScVal(BigInt(data.amount) * 10n ** BigInt(decimals))
```
Apply the same fix to `handleBatchMint` (line 200 — `BigInt(e.amount)` is also unscaled). Update `TokenDashboard` to pass `tokenInfo.decimals`.

---

### 30. TransferPanel: Amount Always Scales to 10⁷ Regardless of Token Decimals

🔴 **High** · `frontend` `rpc`

**File:** `app/dashboard/[contractId]/components/TransferPanel.tsx` — `handleTransfer()` (lines 190–192)

**Issue:**

```ts
const rawAmount =
  BigInt(Math.floor(parseFloat(data.amount) * 10 ** tokenDecimals)) *
  BigInt(10 ** Math.max(0, 7 - tokenDecimals));
```

This always produces `amount × 10^7` regardless of `tokenDecimals`. For a 6-decimal token the user wants `amount × 10^6` but instead gets `amount × 10^6 × 10^1 = amount × 10^7`, sending 10× the intended transfer. For a 7-decimal token it coincidentally works.

**Fix:** Remove the second multiplication. The correct expression is:
```ts
const rawAmount = BigInt(Math.round(parseFloat(data.amount) * 10 ** tokenDecimals));
```
Use `Math.round` instead of `Math.floor` to avoid systematic rounding-down errors.

---

### 31. Vesting Contract: `create_schedules_batch` Skips the Pause Guard

🟡 **Medium** · `contracts` `vesting`

**File:** `contracts/vesting/src/lib.rs` — `create_schedules_batch()` (line 168)

**Issue:** `create_schedule` (single) correctly starts with `Self::_check_paused(&env)`. `create_schedules_batch` does not:

```rust
pub fn create_schedules_batch(env: Env, schedules: Vec<ScheduleInput>) -> u32 {
    let admin: Address = env.storage()...
    admin.require_auth();
    // ← _check_paused is absent
```

A paused vesting contract is supposed to halt all state-changing operations. Because `create_schedules_batch` skips the guard, an admin can still create batch schedules even when the circuit breaker is engaged.

**Fix:** Add `Self::_check_paused(&env);` as the first line of `create_schedules_batch`, matching the pattern in `create_schedule` and `release`.

---

### 32. Vesting Contract: `release()` u32 Underflow on Fully-Vested Schedules

🔴 **High** · `contracts` `vesting`

**File:** `contracts/vesting/src/lib.rs` — `release()` (line 275)

**Issue:**

```rust
let ttl_ledgers = schedule.end_ledger - env.ledger().sequence();
if ttl_ledgers > 0 {
    env.storage().persistent().extend_ttl(&key, ttl_ledgers as u32, ttl_ledgers as u32);
}
```

Both operands are `u32`. When `current_ledger > end_ledger` (the schedule has fully vested), the subtraction wraps around in release mode (Rust's default arithmetic for primitives) to a value near `u32::MAX` (~4.29 billion). The `if ttl_ledgers > 0` guard is always true after wrapping, so `extend_ttl` is called with an astronomically large TTL. This may cause the RPC node to reject the transaction or exhaust ledger resource limits, making it impossible to release tokens from a fully-vested schedule.

**Fix:** Use saturating or checked arithmetic:
```rust
let remaining_ledgers = schedule.end_ledger.saturating_sub(env.ledger().sequence());
if remaining_ledgers > 0 {
    env.storage().persistent().extend_ttl(&key, remaining_ledgers, remaining_ledgers);
}
```

---

### 33. Token Contract: `permit()` Silently Discards Its Signature Parameter

🔴 **High** · `contracts` `token`

**File:** `contracts/token/src/lib.rs` — `permit()` (lines 452, 470–478)

**Issue:**

```rust
pub fn permit(
    env: Env, owner: Address, spender: Address, amount: i128,
    expiration_ledger: u32, nonce: u64,
    _signature: BytesN<64>, // Signature parameter for future implementation
) {
    // TODO: verify the signature here
    owner.require_auth(); // Falls back to require_auth
```

The entire point of `permit` (EIP-2612 style) is that the owner signs off-chain and a relayer submits without the owner needing to be online. The current implementation ignores the 64-byte signature and requires `owner.require_auth()` anyway — making it identical to a standard `approve`. Any relayer calling `permit` will fail unless the owner also authorises the transaction, which defeats the purpose entirely. The test `test_permit_functionality` passes a zero-byte signature and calls it "functionality" — it is actually testing a no-op.

**Fix:** Implement actual Soroban-native Ed25519 signature verification using `env.crypto().ed25519_verify()`. The message to sign should be a domain-separated hash of `(contract_address, owner, spender, amount, expiration_ledger, nonce)`. Remove `owner.require_auth()` once real verification is in place, or gate it behind a feature flag until the implementation is complete. If not implementing now, remove the `permit` function entirely rather than shipping a false sense of security.

---

### 34. Token Contract: `burn()` Does Not Check Frozen Status (Unlike `burn_self`)

🟡 **Medium** · `contracts` `token`

**File:** `contracts/token/src/lib.rs` — `burn()` (lines 144–149) vs `burn_self()` (lines 203–208)

**Issue:**

```rust
// burn — owner-initiated, NO frozen check
pub fn burn(env: Env, from: Address, amount: i128) {
    from.require_auth();
    assert!(amount > 0);
    Self::_burn(&env, &from, amount); // no freeze check
}

// burn_self — also owner-initiated, HAS frozen check
pub fn burn_self(env: Env, from: Address, amount: i128) {
    from.require_auth();
    assert!(amount > 0);
    assert!(!Self::_is_frozen(&env, &from), "account is frozen");
    Self::_burn(&env, &from, amount);
}
```

Both functions are callable by the token owner (`require_auth`). `burn_self`'s comment explicitly says "Refuses to run when the account is frozen so a holder cannot dodge a freeze by destroying tokens." That same rationale applies equally to `burn`. A frozen account can still call `burn` to destroy their balance, circumventing the freeze.

**Fix:** Add `assert!(!Self::_is_frozen(&env, &from), "account is frozen");` to `burn` immediately before `_burn`. Add a corresponding `#[should_panic]` test matching `test_burn_self_blocked_when_frozen`.

---

### 35. AdminPanel Transfer Admin: Uses Instant `set_admin` Instead of Two-Step Flow

🟡 **Medium** · `frontend` `admin` `contracts`

**File:** `app/dashboard/[contractId]/components/AdminPanel.tsx` (line 272); `contracts/token/src/lib.rs` (lines 233–240)

**Issue:** The contract provides two admin-transfer mechanisms:
- `set_admin(new_admin)` — instant, irreversible, no confirmation from `new_admin`
- `propose_admin(new_admin)` + `accept_admin()` — two-step, new admin must opt in

The AdminPanel uses `set_admin` exclusively:
```ts
} else if (action === "transfer") {
    method = "set_admin";
```

If an admin types the wrong address, admin is instantly and permanently transferred to an account they don't control. The contract's own TODO comment (line 234) says to replace `set_admin` with the two-step approach. The two-step contract functions exist and are tested but are completely bypassed by the frontend.

**Fix:** Change `method` to `"propose_admin"` in the transfer branch. Add a second "Accept Admin" button (callable by the new admin after connecting their wallet) that calls `"accept_admin"` with no arguments. Update the UI copy to explain that the new admin must confirm acceptance.

---

## Part 2: Incomplete / Missing Features

### 36. No AdminPanel UI for `pause` / `unpause` (Circuit Breaker)

🟡 **Medium** · `frontend` `admin`

**File:** `app/dashboard/[contractId]/components/AdminPanel.tsx`; `contracts/token/src/lib.rs` (lines 282–293)

**Issue:** The token contract implements a full pause/unpause circuit breaker:
```rust
pub fn pause(env: Env) { ... }
pub fn unpause(env: Env) { ... }
pub fn is_paused(env: Env) -> bool { ... }
```
Pausing halts `mint`, `burn`, `transfer`, `transfer_from`, and `clawback`. There is no UI in `AdminPanel` to trigger these functions. In an emergency (exploit, compliance order), admins have no way to halt the token without raw RPC tools.

**Fix:** Add a "Pause Token" / "Unpause Token" toggle to AdminPanel. On mount, call `is_paused()` and show the current state. Prompt a confirmation before pausing. Use the existing `wrapRpcCall` + `submitSignedTransaction` pattern.

---

### 37. No AdminPanel UI for `authorize_holder` / `revoke_authorization`

🟡 **Medium** · `frontend` `admin`

**File:** `app/dashboard/[contractId]/components/AdminPanel.tsx`; `contracts/token/src/lib.rs` (lines 297–338)

**Issue:** Tokens deployed with `authorization_required: true` require each holder to be explicitly allowlisted before they can receive tokens. The contract has `authorize_holder(holder)`, `revoke_authorization(holder)`, and `is_authorized(holder)`. None of these are exposed in `AdminPanel`.

Admins of compliance-gated tokens must use raw Soroban RPC calls to add or remove authorized holders, making the feature effectively unusable through the UI.

**Fix:** Add a new "Authorization" card to AdminPanel, visible only when the dashboard detects `authorization_required() == true` (fetch this flag once on mount). Include:
- An address input + "Authorize" button → calls `authorize_holder`
- An address input + "Revoke" button → calls `revoke_authorization` (disabled if `authorization_revocable == false`)
- An address input + "Check" button → calls `is_authorized` and displays result

---

### 38. No AdminPanel UI for `set_max_balance_per_account` (Whale Protection)

🟡 **Medium** · `frontend` `admin`

**File:** `app/dashboard/[contractId]/components/AdminPanel.tsx`; `contracts/token/src/lib.rs` (lines 631–655)

**Issue:** The contract implements a whale protection ceiling via `set_max_balance_per_account(Option<u32>)`, where the argument is a percentage (1–100) of total supply. The constraint is enforced on both `mint` and `transfer`. AdminPanel has no UI to set, view, or clear this cap. The only way to configure it is via raw Soroban CLI.

**Fix:** Add a "Whale Protection" card to AdminPanel. On mount, call `max_balance_per_account()` to show the current setting. Include a number input (1–100) + "Set Cap" button → `set_max_balance_per_account(Some(p))` and a "Disable" button → `set_max_balance_per_account(None)`.

---

### 39. No AdminPanel UI for `update_contract_uri` (Off-Chain Metadata)

🟢 **Trivial** · `frontend` `admin`

**File:** `app/dashboard/[contractId]/components/AdminPanel.tsx`; `contracts/token/src/lib.rs` (lines 357–362)

**Issue:** The contract stores an off-chain metadata URI via `update_contract_uri(uri)` and exposes it via `contract_uri()`. This is the on-chain pointer to the token's logo, description, and extended attributes. AdminPanel has no field to view or update this URI. The dashboard info cards also don't display it.

**Fix:** Add a "Metadata URI" row to the dashboard info cards (read from `contract_uri()`, gracefully showing "Not set" if it panics). Add a text input + "Update URI" button in AdminPanel that calls `update_contract_uri`. Validate the input as a valid URL before submitting.

---

### 40. Vesting Contract: One Schedule Per Recipient — No Renewal After Completion

🟡 **Medium** · `contracts` `vesting`

**File:** `contracts/vesting/src/lib.rs` — `create_schedule()` (line 126), `DataKey::Schedule(Address)`

**Issue:**

```rust
let key = DataKey::Schedule(recipient.clone());
if env.storage().persistent().has(&key) {
    panic!("schedule already exists for this recipient");
}
```

The vesting contract enforces at most one schedule per recipient address — forever. Once a schedule is created, the same recipient can never receive a new vesting schedule even after their first schedule is fully vested and released. This prevents common scenarios like:
- A new employee grant after a previous one concluded
- A follow-on investor tranche

**Fix:** Change the storage key to include a sequence counter: `DataKey::Schedule(Address, u32)`. Add a `DataKey::ScheduleCount(Address)` entry to track the next index per recipient. Expose a `get_schedule_count(recipient)` getter. Update `release`, `revoke`, `get_schedule`, and `vested_amount` to accept an optional index parameter (defaulting to the latest). Update the frontend to pass the correct index.

---

### 41. Vesting Contract: No Admin Function to List All Active Schedules

🟡 **Medium** · `contracts` `vesting`

**File:** `contracts/vesting/src/lib.rs`

**Issue:** There is no `get_all_schedules()` or equivalent function. An admin who has created 50 batch schedules has no on-chain way to query which recipients have schedules, which are still active, or the total outstanding vesting obligation — they must query each address individually. The frontend cannot display a meaningful "all vesting commitments" view.

Soroban does not support key enumeration natively, but the contract can maintain an explicit recipient list.

**Fix:** Add `DataKey::Recipients` that stores a `Vec<Address>`. In `create_schedule` and `create_schedules_batch`, push each new recipient to this list. Add a `get_recipients() -> Vec<Address>` getter. The frontend can then iterate and call `get_schedule(recipient)` for each. Include pagination or a `get_recipients_paginated(start: u32, limit: u32)` variant for large lists.

---

### 42. Token Contract: `upgrade()` Event Emits `true` Instead of the New WASM Hash

🟢 **Trivial** · `contracts` `token`

**File:** `contracts/token/src/lib.rs` — `upgrade()` (line 375)

**Issue:**

```rust
pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
    ...
    env.deployer().update_current_contract_wasm(new_wasm_hash);
    env.events().publish((symbol_short!("upgrade"),), true); // ← always emits `true`
}
```

The event payload is the boolean `true` rather than `new_wasm_hash`. Anyone monitoring the contract's event stream cannot determine which WASM version was installed. This breaks auditability for compliance and security review processes.

**Fix:** Emit the hash:
```rust
env.events().publish((symbol_short!("upgrade"),), new_wasm_hash);
```

---

### 43. TransferPanel: Forces Full Page Reload on Success

🟢 **Trivial** · `frontend` `ux`

**File:** `app/dashboard/[contractId]/components/TransferPanel.tsx` (lines 274–277)

**Issue:**

```ts
// Refresh balance after successful transfer
setTimeout(() => {
  window.location.reload();
}, 2000);
```

After a successful transfer, the component destroys and rebuilds the entire page via `window.location.reload()`. This resets all other dashboard state (active tab, expanded sections), triggers a full RPC re-fetch of all token data, and produces a blank screen flash for 2 seconds. The balance can be updated by simply re-running the balance `useEffect`.

**Fix:** Remove the `setTimeout` / `window.location.reload()`. Instead call the local `fetchBalance()` function (already defined inside the effect) by extracting it into the component scope and calling it after `setSuccess(true)`.

---

### 44. ClaimVesting Uses `react-hot-toast` Instead of App's `ToastProvider`

🟢 **Trivial** · `frontend` `ux`

**File:** `app/claim/ClaimVesting.tsx` (lines 3–4, 99–108)

**Issue:**

```ts
import toast, { Toaster } from "react-hot-toast";
// ...
<Toaster position="top-right" toastOptions={{ style: { background: "#1a2035", ... } }} />
```

`ClaimVesting` is the only component in the app that imports `react-hot-toast`. Every other component uses `useToast()` from `app/providers/ToastProvider`. This introduces a second toast library, a second set of CSS styles (manually specified inline), and inconsistent placement and dismiss behaviour compared to the rest of the app.

**Fix:** Remove the `react-hot-toast` import and the `<Toaster />` element. Replace `toast.success(...)` and `toast.error(...)` calls with `const toast = useToast(); toast.show({ title, message, variant })`. Remove `react-hot-toast` from `package.json` if this is the only usage.

---

### 45. PublicTokenPage: Explorer Link Hardcodes "testnet"

🟢 **Trivial** · `frontend` `ux`

**File:** `app/token/[contractId]/PublicTokenPage.tsx` (line 403)

**Issue:**

```ts
href={`https://stellar.expert/explorer/testnet/contract/${contractId}`}
```

The network is hardcoded as `testnet`. On mainnet or futurenet this link leads to the wrong explorer page (or a 404). The component imports `useSoroban` which exposes `networkConfig`, so the correct value is available.

**Fix:** Import `useNetwork` from `NetworkProvider` and replace `testnet` with `networkConfig.network`.

---

### 46. AdminPanel: Two `console.log` Calls Not Removed

🟢 **Trivial** · `frontend` `quality`

**File:** `app/dashboard/[contractId]/components/AdminPanel.tsx` (lines 211, 311)

**Issue:**

```ts
// line 211
console.log(`Signing batch mint tx for ${contractId} with ${entries.length} recipients`);
// line 311
console.log(`Signing ${action} tx for ${contractId}`);
```

Both leak transaction metadata to the browser console in production. These were introduced alongside the signing logic and not cleaned up.

**Fix:** Remove both `console.log` calls. The signing state is already communicated to the user via `loading` state and toast notifications.

---

### 47. Token Contract: `set_admin` (Instant Transfer) Should Be Removed

🟡 **Medium** · `contracts` `token`

**File:** `contracts/token/src/lib.rs` (lines 233–240)

**Issue:**

```rust
/// Transfer admin role instantly.
/// TODO (issue #2): replace with two-step propose_admin / accept_admin.
pub fn set_admin(env: Env, new_admin: Address) {
    Self::_require_admin(&env);
    env.storage().instance().set(&DataKey::Admin, &new_admin);
    env.events().publish((symbol_short!("set_admin"),), new_admin);
}
```

The two-step `propose_admin` / `accept_admin` flow already exists and is tested. `set_admin` is marked with a TODO to remove it but remains callable. Its presence means:
1. Any admin can accidentally or maliciously transfer control without the new admin's confirmation.
2. The frontend currently calls `set_admin` (see issue 35), perpetuating the unsafe pattern.
3. Any audit or downstream integrator inspecting the ABI sees two conflicting admin-transfer mechanisms.

**Fix:** Remove `set_admin` from the contract. Update `DataKey` to remove any associated storage entry if it exists. After removing `set_admin`, issue 35's frontend fix will be forced to use `propose_admin` as intended. Write a migration note: anyone currently using `set_admin` off-chain must switch to the two-step flow.

---

### 48. `lib/stellar.ts`: `fetchTopHolders` Loses Precision for Large Balances

🟡 **Medium** · `frontend` `dashboard`

**File:** `lib/stellar.ts` — `fetchTopHolders()` (lines ~620–630)

**Issue:**

```ts
sharePercent:
  totalSupplyRaw > BigInt(0)
    ? Number((rawBalance * BigInt(10000)) / totalSupplyRaw) / 100
    : 0,
```

`rawBalance` is a `BigInt`. The multiplication result is divided before converting — good. But the final `Number(...)` cast still loses precision if the intermediate value exceeds `2^53`. For tokens with 7 decimals and 1 billion circulating supply, `rawBalance * 10000` can exceed `Number.MAX_SAFE_INTEGER`, producing an incorrect share percentage.

Additionally, an earlier part of the function does:
```ts
balance: (Number(rawBalance) / 10 ** decimals).toFixed(decimals),
```
`Number(rawBalance)` loses precision for any holder with more than ~9 quadrillion raw units (90M tokens at 7 decimals), causing the displayed balance to be wrong.

**Fix:** Keep all arithmetic in `BigInt` until the final display conversion. For `sharePercent`, format the percentage string directly from BigInt division. For `balance`, use a `BigInt` division helper that produces a properly formatted decimal string.

---

### 49. Vesting Contract: `extend_cliff` Event Omits Previous Cliff Value

🟡 **Medium** · `contracts` `vesting`

**File:** `contracts/vesting/src/lib.rs` — `extend_cliff()` (line 384)

**Issue:**

```rust
env.events().publish((symbol_short!("clf_ext"), recipient), new_cliff);
```

The event records only `new_cliff`. Off-chain monitors, the ClaimVesting UI, and audit trails cannot determine what the original cliff was or by how much it was extended without separately querying `get_schedule` in the same ledger before the change — which is not generally possible retroactively.

**Fix:** Publish both values:
```rust
env.events().publish(
    (symbol_short!("clf_ext"), recipient),
    (schedule.cliff_ledger, new_cliff), // (old_cliff, new_cliff)
);
```

---

### 50. Token Contract: Freeze / Unfreeze Events Share the Same Topic String

🟢 **Trivial** · `contracts` `token`

**File:** `contracts/token/src/lib.rs` (lines 269, 278)

**Issue:**

```rust
// freeze_account
env.events().publish((symbol_short!("freeze"), addr), true);
// unfreeze_account
env.events().publish((symbol_short!("freeze"), addr), false);
```

Both freeze and unfreeze emit the topic `"freeze"` and differ only by the boolean payload. Off-chain event filters that watch for account suspension need to parse the payload to distinguish a freeze from an unfreeze, rather than subscribing to two distinct topics. This is error-prone when building indexers or compliance monitoring tools.

**Fix:** Use separate topic strings:
```rust
// freeze_account
env.events().publish((symbol_short!("freeze"), addr), ());
// unfreeze_account
env.events().publish((symbol_short!("unfreeze"), addr), ());
```

---

## Part 3: Security

### 51. Token Contract: Compliance Node Address Is Never Validated at Initialization

🟡 **Medium** · `contracts` `token` `security`

**File:** `contracts/token/src/lib.rs` — `initialize()` (lines 105–109), `_check_compliance()` (lines 766–779)

**Issue:** The `compliance_node` address is accepted during `initialize()` with no validation. At transfer time, `_check_compliance` calls `ComplianceNodeClient::new(env, &node).can_trade(...)`. If the stored address:
- Is a non-existent contract → the cross-contract call panics, permanently blocking all transfers
- Is a malicious contract that always returns `false` → all transfers are silently blocked

There is no admin function to update or clear the compliance node after initialization. A misconfiguration at deploy time permanently disables the token.

**Fix:** Add `set_compliance_node(env: Env, node: Option<Address>)` as an admin-only function that lets the admin update or remove the compliance node after deployment. Also expose `compliance_node()` as a read-only getter (already present, line 672) in the dashboard info cards so users know a compliance node is active.

---

### 52. Vesting Contract: Batch Schedule Creation Has No Per-Recipient Cap

🟡 **Medium** · `contracts` `vesting` `security`

**File:** `contracts/vesting/src/lib.rs` — `create_schedules_batch()` (lines 168–252)

**Issue:** The batch function transfers the total amount from admin to the vesting contract in one step (Phase 2, line 210) and then creates all schedules (Phase 3). If Phase 3 panics midway (e.g., a duplicate recipient is encountered after the first few schedules are written), the transaction rolls back entirely — including the token transfer. This is correct behaviour for atomicity.

However, there is no maximum batch size guard. A caller could submit a vector of hundreds of recipients, causing the transaction to exceed Soroban's per-transaction compute limit and fail with an opaque resource error rather than a clear message.

**Fix:** Add a maximum batch size assertion at the start of `create_schedules_batch`:
```rust
assert!(schedules.len() <= 50, "batch size exceeds maximum of 50");
```
Choose a limit that fits comfortably within Soroban's compute budget. Document this limit in the function's doc-comment and surface it in the frontend batch mint UI.

---
