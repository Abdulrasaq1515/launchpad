# 📋 SoroPad Issue Tracker — Wave 8

_Verified against `master` at commit `2473a2e`. Every issue below was confirmed by reading the current source, running `npm audit`, and cross-checking the closed GitHub issues from Waves 4 to 7._

**Context:** All 100+ issues from Waves 4 to 7 are closed on GitHub. Most of that work genuinely landed. Three things did not, and this wave starts there:

1. **A silent regression in the deploy path.** Issue #252 ("initial_supply and max_supply are not decimal-scaled") is closed, but the fix was applied only to the fee-estimation call. The transaction that is actually signed and broadcast still sends unscaled supply, so every token deployed today mints `10^decimals` times fewer tokens than the user asked for. The preflight display and the real deploy disagree, which is exactly why this was not caught.
2. **Three closed issues that were never implemented.** #296 (holder authorization UI), the freeze half of #297, and the holder-facing half of #304 (token state banner) have zero corresponding code. `grep -rn "authorize_holder\|freeze_account\|is_frozen" app/ components/ lib/ hooks/` returns nothing outside a deploy-step doc string.
3. **The frontend indexer subscribes to event topics the contracts never emit.** `docs/events.md` documents a `set_admin` event that does not exist and omits nine topics that do. The indexer was built from that stale doc, so admin transfers, authorization changes, approvals, and compliance changes are invisible in the activity feed even though the decode `switch` has cases for them.

Beyond those, this wave covers contract storage and TTL correctness (several of which are latent bricking bugs), a vesting limit that makes schedules longer than about six months impossible to create, and the state of the test and supply-chain hygiene.

Complexity levels:

- 🟢 **Trivial** (100 pts) — Small, well-defined
- 🟡 **Medium** (150 pts) — Standard features or involved bug fixes
- 🔴 **High** (200 pts) — Complex features, integrations, or architectural changes

> Issues that are re-opened because a closed issue's fix did not land, or landed only partially, are flagged **(regression of #N)**.

---

## Part 1: Critical Bugs (Broken in Production)

### 83. Deploy: the broadcast `initialize()` still sends unscaled supply (regression of #252)

🔴 **High** · `frontend` `deploy` `correctness`

**Files:** `frontend/app/deploy/DeployForm.tsx` lines 158 to 160 and 202 to 203; `frontend/app/hooks/useDeployToken.ts` lines 336 to 339

**Issue:** There are two paths that encode supply and only one of them scales by decimals.

The fee-estimation path scales correctly:

```ts
// DeployForm.tsx:158
BigInt(Math.round((formData.initialSupply ?? 0) * 10 ** formData.decimals)),
```

The path that actually deploys does not:

```ts
// DeployForm.tsx:202
initialSupply: String(data.initialSupply),
maxSupply: data.maxSupply != null ? String(data.maxSupply) : undefined,
```

```ts
// useDeployToken.ts:336
const initialSupplyScVal = StellarSdk.nativeToScVal(
  BigInt(params.initialSupply),
  { type: "i128" },
);
const maxSupplyScVal = params.maxSupply
  ? StellarSdk.nativeToScVal(BigInt(params.maxSupply), { type: "i128" })
  : StellarSdk.xdr.ScVal.scvVoid();
```

`data.initialSupply` is the raw display number from the form (`DeployForm.tsx:39` types it `z.number()`). No multiplication by `10 ** decimals` happens anywhere between the form and `contract.call("initialize", ...)`.

A user deploying "1,000,000 supply" at 7 decimals gets `1_000_000` base units minted, which is 0.1 token. `max_supply` is wrong by the same factor, so the cap is meaningless too. This is precisely the bug issue #252 was closed for; the fix was applied to `simulator.checkTokenDeployment` and not to `deployToken`. Because the preflight card shows the correctly scaled figure, the UI actively reassures the user that the wrong value is right.

**Fix:** Scale in one place. Do the `10n ** BigInt(decimals)` multiplication inside `useDeployToken` (or in a shared `toBaseUnits(display, decimals)` helper in `lib/`) and have both the simulator and the deploy call go through it, so the two can never diverge again. Add a unit test asserting the ScVal built for a 1,000,000 / 7-decimal token equals `10_000_000_000_000n`.

---

### 84. Deploy: supply is still a JS `number`, so float scaling corrupts large supplies (regression of #253)

🔴 **High** · `frontend` `deploy`

**Files:** `frontend/app/deploy/DeployForm.tsx` line 39 (schema), lines 158 and 160, lines 443 and 445

**Issue:** Issue #253 asked for supply fields to become `string` or `bigint` so they never round-trip through `number`. The schema is still numeric:

```ts
// DeployForm.tsx:39
initialSupply: z.number().min(1, "Initial supply must be at least 1"),
```

and the scaling is done in floating point before the `BigInt` conversion:

```ts
BigInt(Math.round((formData.initialSupply ?? 0) * 10 ** formData.decimals)),
```

Wrapping the result in `BigInt` does not help, because the precision is already gone: the multiply happens in IEEE-754 doubles. A 10-billion supply at 7 decimals needs `1e17` base units, well past `Number.MAX_SAFE_INTEGER` (about `9.0e15`), so the value silently changes. The same expression appears twice more at lines 443 and 445 in the review step.

**Fix:** Type `initialSupply` and `maxSupply` as `string` in the Zod schema (validate with a `^\d+$` regex plus a max-length bound), keep them as strings all the way through, and do the scaling with `BigInt` string arithmetic. Fixing this alongside #83 means the whole path is integer-exact end to end.

---

### 85. Token: `initialize()` has no `require_auth`, and deploy runs it in a separate transaction

🔴 **High** · `contracts` `token` `security` `deploy`

**Files:** `contracts/token/src/lib.rs` lines 69 to 125; `frontend/app/hooks/useDeployToken.ts` lines 229 to 247 and 317 onwards

**Issue:** `initialize()` contains no `require_auth()` call anywhere in its body. The `admin` argument is trusted verbatim and written straight to storage at line 94.

That is only exploitable because the frontend deploys and initializes in two separately signed transactions. `useDeployToken` broadcasts `createCustomContract`, extracts the contract ID from the result, then builds and submits a second transaction calling `initialize`.

Between those two transactions the contract exists and is uninitialized. Anyone watching the ledger can submit `initialize(attacker, ..., initial_supply, ...)` against the new contract ID first. The attacker becomes the permanent admin, receives the entire initial supply (the internal `_mint` at lines 120 to 122 has no admin check), and the real creator's `initialize` fails with `already initialized` after they have already paid for the deploy.

**Fix:** Add `admin.require_auth();` as the first statement of `initialize`. That closes the theft-of-admin case immediately. See #123 for the structural fix of making deploy and initialize atomic.

---

### 86. Token: `initialize()` becomes callable again after `revoke_admin`

🔴 **High** · `contracts` `token` `security`

**Files:** `contracts/token/src/lib.rs` lines 81 to 84 (re-init guard) and lines 258 to 264 (`revoke_admin`)

**Issue:** The only re-initialization guard keys off the presence of the admin entry:

```rust
// Prevent re-initialization
if env.storage().instance().has(&DataKey::Admin) {
    panic!("already initialized");
}
```

and `revoke_admin` deletes exactly that key:

```rust
pub fn revoke_admin(env: Env) {
    Self::_require_admin(&env);
    env.storage().instance().set(&DataKey::Locked, &true);
    env.storage().instance().remove(&DataKey::Admin);
```

`initialize` never checks `Locked`. So once a token has been made "immutable" by revoking admin, `has(&DataKey::Admin)` is false again and `initialize` succeeds for any caller.

The attacker cannot use the `_require_admin`-gated functions (`Locked` stays true), but `initialize` alone is enough: `TotalSupply` is reset and then set to the attacker's figure while existing holder balances are untouched, so supply accounting is permanently wrong; `TotalBurned` is zeroed; `Name`, `Symbol`, and `Decimals` are overwritten; the authorization flags flip; a hostile `ComplianceNode` can be installed that blocks every remaining holder's transfers forever; and the internal mint credits the attacker the full new supply. `revoke_admin` is documented as the trustless path, so this inverts its entire purpose.

**Fix:** Guard on a dedicated `DataKey::Initialized` flag that is set on first initialize and never removed, and add `Self::_require_not_locked(&env)` to `initialize`. Add a test asserting `initialize` panics after `revoke_admin`.

---

### 87. Token: whale protection plus `revoke_admin` permanently freezes all transfers (regression of #255)

🔴 **High** · `contracts` `token` `security`

**File:** `contracts/token/src/lib.rs` lines 700 to 728 (`_enforce_max_balance_per_account`), line 261 (`revoke_admin`)

**Issue:** Issue #255 is closed, and the helper was partly rewritten to use a `let Some(pct) = ... else { return; }` guard for the cap itself. The admin read immediately below it still unwraps:

```rust
let admin: Address = env
    .storage()
    .instance()
    .get(&DataKey::Admin)
    .expect("not initialized");
```

`revoke_admin` removes `DataKey::Admin`. This helper sits on the hot path of `_mint` (line 766) and `_transfer` (line 834) whenever a cap is configured.

So: admin sets a whale cap, then revokes admin to make the token trustless. From that ledger on, every `transfer`, `transfer_from`, and `clawback` to a non-admin panics with `not initialized`. There is no recovery, because `set_max_balance_per_account` is gated behind `_require_admin`, which now always panics on `_require_not_locked`. The token is permanently non-transferable, directly contradicting the doc comment at lines 254 to 255 which promises holders can still transfer after revoke.

The existing test `test_holder_actions_still_work_after_revoke` (lines 1362 to 1374) misses it because it never sets a cap.

**Fix:** Read the admin as `Option<Address>` and skip the exemption branch when it is `None`, or treat the cap as inactive once the contract is locked. Pick one, document it in the doc comment, and add the regression test: set cap, `revoke_admin`, assert a non-admin transfer succeeds.

---

### 88. Vesting: schedules longer than about 180 days cannot be created

🔴 **High** · `contracts` `vesting`

**File:** `contracts/vesting/src/lib.rs` lines 564 to 578 (`_ttl_ledgers`, `_extend_persistent_ttl`), called from line 153

**Issue:** `create_schedule` derives the schedule entry's TTL from the full remaining vesting duration:

```rust
fn _ttl_ledgers(env: &Env, end_ledger: u32) -> u32 {
    let current_ledger = env.ledger().sequence();
    if end_ledger > current_ledger {
        end_ledger - current_ledger
    } else {
        52 * 7 * 24 * 60 / 5
    }
}
```

and passes it straight to `extend_ttl(key, ttl, ttl)`. Soroban rejects an `extend_to` above the network's `max_entry_ttl`, which is 3,110,400 ledgers on mainnet and testnet at the time of writing (about 180 days at roughly 5 second ledgers).

The AdminPanel computes `durationLedgers = days * 17280` (`AdminPanel.tsx:681`), so `days > 180` produces a TTL above the ceiling and `create_schedule` fails. Standard token vesting is one to four years. In other words the headline feature of the product cannot express a normal grant, and it fails with an opaque host resource error rather than a clear message. `create_schedules_batch` has the same inline calculation at lines 243 to 247.

**Fix:** Clamp the requested TTL to the network maximum (`env.storage().max_ttl()`) rather than using the raw remaining duration, and rely on the fact that `release` re-extends the TTL on every claim. For schedules whose end is beyond one TTL window, document that at least one interaction per window is required to keep the entry live, and surface a "keep-alive" action in the UI so a long-dated grant can be refreshed without a claim. Add a test creating a four-year schedule. Please confirm the current `max_entry_ttl` for the target networks before choosing the clamp, since network settings change.

---

### 89. AdminPanel: per-account freeze controls were never built (regression of #297)

🔴 **High** · `frontend` `admin` `security`

**Files:** `frontend/app/dashboard/[contractId]/components/AdminPanel.tsx`; `contracts/token/src/lib.rs` `freeze_account()` line 267, `unfreeze_account()` line 276, `is_frozen()` line 545

**Issue:** Issue #297 covered two things: a pause/unpause circuit breaker and per-account freeze. The pause half landed and is good (state fetched on mount at `AdminPanel.tsx:305`, banner at line 1138, toggle at line 2124). The freeze half does not exist. `grep -rn "freeze_account\|unfreeze_account\|is_frozen" app/ components/ lib/ hooks/` returns **nothing**. The only occurrences of the word "freeze" in `AdminPanel.tsx` are prose in two warning paragraphs at lines 1161 and 1901.

An admin facing a single compromised or sanctioned holder has only two options in the app: pause the entire token and halt every other holder too, or drop to the Soroban CLI. Freezing exists in the contract precisely so that quarantining one account does not require stopping the token.

**Fix:** Add a Freeze Account sub-form to the existing Security Controls card: address input with Freeze and Unfreeze buttons calling `freeze_account` / `unfreeze_account`, plus a Check button calling `is_frozen` that renders the result. Reuse the pause card's confirmation and toast pattern. Surface frozen state in `HoldersTable` so the admin can see which holders are already frozen without probing one address at a time.

---

### 90. AdminPanel: holder authorization UI was never built (regression of #296)

🔴 **High** · `frontend` `admin` `compliance`

**Files:** `frontend/app/dashboard/[contractId]/components/AdminPanel.tsx`; `contracts/token/src/lib.rs` `authorize_holder()` line 300, `revoke_authorization()` line 311, `is_authorized()` line 328

**Issue:** Issue #296 is closed with no corresponding code. `grep -rn "authorize_holder\|revoke_authorization\|is_authorized" app/ components/ lib/ hooks/` matches exactly one file, `app/deploy/steps/StepReview.tsx`, and only inside the warning text that tells the user they will need to call `authorize_holder` later.

The deploy wizard still lets a user enable Authorization Required, and `lib/stellar.ts` reads `authorization_required` and `authorization_revocable` for display (lines 532 onwards). But there is no way to authorize anyone. A token deployed with that flag set is bricked from the UI: no holder can ever receive tokens. The app encourages a setting it cannot then support, which is worse than not offering the setting at all.

**Fix:** Add an Authorization card to `AdminPanel`, rendered only when `authorization_required()` is true (the flag is already on `TokenInfo`, so no new fetch is needed). Address input plus Authorize, address input plus Revoke (disabled with an explanatory tooltip when `authorization_revocable` is false), and address input plus Check calling `is_authorized`. Until this ships, disable the Authorization Required toggle in `StepAdmin.tsx` rather than letting users deploy an unusable token.

---

### 91. Public token page has no token-state banner (regression of #304)

🟡 **Medium** · `frontend` `ux` `transparency`

**Files:** `frontend/app/token/[contractId]/PublicTokenPage.tsx`; `frontend/lib/stellar.ts` `TokenInfo` at lines 22 to 36, `fetchTokenInfo` around lines 500 to 540

**Issue:** Issue #304 asked for a live status banner on both the public token page and the dashboard header. The AdminPanel got a paused banner. The holder-facing pages did not. `grep -n "paused\|isPaused\|locked\|frozen\|authoriz" app/token/[contractId]/PublicTokenPage.tsx` returns **nothing**.

The root cause is that `TokenInfo` was never extended:

```ts
export interface TokenInfo {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  circulatingSupply: string;
  admin: string;
  contractId: string;
  maxSupply?: string | null;
  contractUri?: string;
  complianceNode?: string | null;
  authorizationRequired?: boolean;
  authorizationRevocable?: boolean;
}
```

There is no `isPaused` or `isLocked`, and `fetchTokenInfo` never calls `is_paused()` or `is_locked()` (it does call `contract_uri`, `compliance_node`, and `authorization_required`). So a visitor to a paused token's public page sees a normal page with working-looking CTAs, and finds out it is paused only when the transaction reverts with an opaque error.

**Fix:** Add `isPaused` and `isLocked` to `TokenInfo` and populate them in `fetchTokenInfo`, each guarded so a contract missing the method degrades to `false` (matching the existing pattern for `compliance_node`). Render a status banner on `PublicTokenPage` and the dashboard header: Paused, Immutable (frame this one as a positive trust signal), Authorization required, and, when a wallet is connected, that wallet's `is_authorized` and `is_frozen` state. Disable the transfer and claim CTAs with inline helper text when the state makes them impossible.

---

### 92. Activity feed subscribes to event topics the contracts never emit

🟡 **Medium** · `frontend` `dashboard` `transparency`

**Files:** `frontend/lib/stellar.ts` lines 806 to 820 (`TRACKED_EVENT_TOPICS`); `frontend/hooks/useContractEvents.ts` lines 19 to 33 (`TRACKED_TOPICS`); `contracts/token/src/lib.rs` all `env.events().publish` sites

**Issue:** Issue #305 extended the decode `switch` to cover admin and compliance actions, but the topic names were taken from `docs/events.md` (see #121) rather than from the contract. They do not match.

The token contract emits exactly these 15 topics: `init`, `transfer`, `mint`, `burn`, `clawback`, `freeze`, `unfreeze`, `pause`, `unpause`, `auth`, `revoked`, `upgrade`, `approve`, `set_max_b`, `set_cnode`.

Both frontend lists subscribe to `authorize`, `unauthorize`, `set_admin`, and `revoke_admin`. None of those four is ever emitted:

- `authorize` and `unauthorize` do not exist. The contract publishes `symbol_short!("auth")` with a `(holder, bool)` payload for both grant and revoke (lines 306 and 323).
- `set_admin` does not exist. `propose_admin` and `accept_admin` emit nothing at all (see #106).
- `revoke_admin` does not exist. The topic is `revoked` (line 263).

Meanwhile `approve`, `set_max_b`, `set_cnode`, and `init` are emitted and not subscribed to.

Net effect: the activity feed silently omits every authorization change, every admin transfer, admin revocation, approvals, whale-cap changes, and compliance-node changes, while the code reads as though it handles them. There is no error and no "Other" row, because the events are filtered out before decoding.

**Fix:** Derive the topic list from the contract, not the doc. Fix the four wrong names, add the four missing ones, and decode `auth`'s bool payload to distinguish grant from revoke. Then de-duplicate: the two lists are maintained by hand and `useContractEvents.ts:18` even carries the comment "mirrors TRACKED_EVENT_TOPICS in stellar.ts". Export one list from `lib/stellar.ts` and import it. Best of all, fix #105 and #107 on the contract side so the topics are distinct and indexable, and add a contract test that asserts the emitted topic set matches a checked-in list, so the two can never drift again.

---

## Part 2: Token Contract Storage, TTL, and Guards

### 93. Token: allowances live in persistent storage, so expiry produces an archived-entry error instead of zero

🔴 **High** · `contracts` `token` `defi`

**File:** `contracts/token/src/lib.rs` lines 430 to 438 (`approve`), lines 453 to 457 (`transfer_from`)

**Issue:** `grep -rn "temporary()" contracts/` returns nothing. The contract uses no temporary storage at all, and allowances are persistent:

```rust
let key = DataKey::Allowance(from.clone(), spender.clone());
env.storage().persistent().set(&key, &amount);
let ttl_ledgers = expiration_ledger - current_ledger;
env.storage().persistent().extend_ttl(&key, ttl_ledgers, ttl_ledgers);
```

The reference SEP-41 implementation puts allowances in temporary storage specifically because allowance expiry _is_ the entry's TTL. A persistent entry whose TTL lapses is archived, not deleted. Reading it requires a `RestoreFootprint` operation, and until that happens the transaction fails during footprint validation.

So Alice approves Bob until `now + 100`. At `now + 200` Bob calls `transfer_from` and gets an opaque archived-entry failure instead of the correct `insufficient allowance` revert. Worse, the read-only `allowance(alice, bob)` getter that the Allowances UI polls fails too, rather than returning `0`. Every expired allowance also becomes permanent archived-state rent that only a restore operation can clear.

**Fix:** Move `DataKey::Allowance` to `env.storage().temporary()`. Store `(amount, expiration_ledger)` as a struct so `allowance()` can return `0` for a logically expired entry rather than depending on archival semantics. Add tests for read-after-expiry and transfer-after-expiry.

---

### 94. Token: the "52 weeks" TTL constant is actually about 6 days, and is copy-pasted five times

🟡 **Medium** · `contracts` `token`

**File:** `contracts/token/src/lib.rs` lines 137, 177, 199, 398, 462 (identical literal and identical comment at each)

**Issue:**

```rust
let ttl_ledgers = 52 * 7 * 24 * 60 / 5; // ~52 weeks (assuming 5-second ledgers)
```

`52 * 7 * 24 * 60` is 524,160, which is 52 weeks expressed in **minutes**. Dividing by 5 gives 104,832, the number of 5-minute intervals in a year. At roughly 5 second ledgers, 104,832 ledgers is about 524,160 seconds, or **6.07 days**. Reaching an actual 52 weeks would require 6,289,920 ledgers, which is itself above mainnet's `max_entry_ttl`, so the stated intent is not even achievable in one call.

The team believes balances are protected from archival for a year. In practice a holder who receives tokens and then does nothing for a week has their `Balance` entry eligible for archival, after which the next `balance()` read or transfer fails until someone submits a restore. On a launchpad where retail holders buy once and hold, that is the common case rather than an edge case. The same wrong expression appears in `contracts/vesting/src/lib.rs` at lines 246, 570, and 622, where line 622's comment says "~1 year in ledger units".

**Fix:** Hoist one named constant with an honest comment, clamped to the network maximum, and reference it from all five sites in the token and all three in vesting. Add a unit test asserting the constant's value in days so the arithmetic cannot silently rot again.

---

### 95. Token: instance TTL is never extended, and `Frozen` / `AuthorizedHolder` entries are never extended at all

🟡 **Medium** · `contracts` `token`

**File:** `contracts/token/src/lib.rs` lines 269 to 271, 302 to 304; balance TTL sites at 120 to 122 and 778 to 811

**Issue:** There is not a single `env.storage().instance().extend_ttl(...)` call in the contract, even though `Admin`, `Name`, `Symbol`, `Decimals`, `TotalSupply`, `TotalBurned`, `MaxSupply`, `Locked`, `IsPaused`, and `ComplianceNode` all live in instance storage. Extending instance TTL at every entry point is the standard Soroban pattern and it is missing entirely.

Two persistent flag entries are written with no TTL management either:

```rust
env.storage().persistent().set(&DataKey::Frozen(addr.clone()), &true);
env.storage().persistent().set(&DataKey::AuthorizedHolder(holder.clone()), &true);
```

And the balance TTL bump is applied inconsistently: `mint` (137), `mint_batch` (199), `clawback` (177), `transfer` (398), and `transfer_from` (462) all extend it, but `initialize`'s initial mint (120 to 122) does not, and none of the burn paths do.

Failure scenario for the authorization case: an `AuthorizedHolder(bob)` entry archives after its default TTL. `_check_authorized` (lines 645 to 659) then fails the transaction on an archived read, so an authorized holder can no longer receive tokens, and re-running `authorize_holder` does not help because the write hits the same archived key. Separately, if the instance entry archives before any balance does, the whole contract needs restoring before any call, including the read-only getters the UI depends on.

**Fix:** Extend instance TTL at the top of every public entry point. Extend `Frozen` and `AuthorizedHolder` TTL whenever they are written or read. Add the balance bump to `initialize` and to the burn paths, ideally by folding TTL extension into `_mint` and `_burn` so no future call site can forget.

---

### 96. Token: `approve` is the only state-changing entry point with no pause or frozen guard

🟡 **Medium** · `contracts` `token` `security`

**File:** `contracts/token/src/lib.rs` lines 414 to 442

**Issue:**

```rust
pub fn approve(
    env: Env,
    from: Address,
    spender: Address,
    amount: i128,
    expiration_ledger: u32,
) {
    from.require_auth();
    assert!(amount >= 0, "amount must be non-negative");
```

Every sibling begins with `Self::_check_paused(&env)`: `mint` (131), `burn` (148), `burn_admin` (157), `clawback` (166), `mint_batch` (195), `burn_self` (216), `transfer` (387), `transfer_from` (446). `approve` does not, and it also skips the `_is_frozen(&from)` check that `burn`, `burn_self`, `transfer`, and `transfer_from` all perform.

An exploit is detected and the admin pauses the token. Attackers cannot call `transfer_from` while paused, but they can keep calling `approve` to pre-position allowances, including from frozen accounts and from freshly compromised keys. The moment `unpause` runs, all of them drain in one block. Pausing therefore does not actually quiesce the allowance surface, which undermines the point of the circuit breaker.

**Fix:** Add `Self::_check_paused(&env);` and `assert!(!Self::_is_frozen(&env, &from), "account is frozen");` to `approve`. Add a test asserting `approve` panics while paused, which is the test whose absence let this through.

---

### 97. Token: `approve(x, y, 0, 0)` cannot revoke, and `expiration_ledger` is unbounded above

🟡 **Medium** · `contracts` `token` `defi`

**File:** `contracts/token/src/lib.rs` lines 422 to 438

**Issue:** Two deviations from the standard.

First, the expiry assertion is unconditional:

```rust
assert!(
    expiration_ledger > current_ledger,
    "expiration_ledger must be in the future"
);
```

The reference SEP-41 implementation only rejects a past `expiration_ledger` when `amount > 0`, because `approve(from, spender, 0, 0)` is the canonical, wallet-emitted way to revoke an allowance. Here it panics, so integrators and wallets cannot revoke idiomatically and must instead pass a future ledger to store a useless zero entry, which then also receives a TTL extension and becomes archived-state rent.

Second, `expiration_ledger` has no upper bound. `approve(..., u32::MAX)` computes a `ttl_ledgers` of about 4.29 billion, far above the network `max_entry_ttl`, so the host will not honour it and the doc comment's promise that the TTL is set "exactly as the SEP-41 standard requires, no silent fallback" does not hold.

**Fix:** Skip the expiry assertion and the TTL extension when `amount == 0`, and `remove` the key instead of storing zero. Clamp `ttl_ledgers` to `env.storage().max_ttl()`, or assert it is in range with a clear message.

---

### 98. Token: SEP-41 `burn_from` is not implemented

🟡 **Medium** · `contracts` `token` `compatibility`

**File:** `contracts/token/src/lib.rs`

**Issue:** `grep -rn "burn_from" .` across the whole repository returns nothing. The contract exposes `burn` (147), `burn_admin` (156), `burn_self` (215), and `clawback` (165), but not the standard `burn_from(spender: Address, from: Address, amount: i128)`.

Every other method in the SEP-41 interface is present, so this single omission is what breaks conformance. Any integration written against the standard `soroban_sdk::token` interface that holds an allowance and burns on the owner's behalf, such as a DEX, a vault, or a burn-on-redeem contract, gets a function-not-found host error. The token cannot be dropped into standard tooling as a SEP-41 asset, which undermines the PRD's stated goal of shipping a reference SEP-41 implementation.

**Fix:** Add `burn_from`, mirroring `transfer_from`'s allowance handling: pause guard, `spender.require_auth()`, `amount > 0`, frozen check on `from`, allowance check and decrement, then `_burn`. Add the standard event. Add tests for the happy path, insufficient allowance, and frozen owner.

---

### 99. Token: compliance node calls have no failure containment and are skipped on mint, burn, and clawback

🔴 **High** · `contracts` `token` `security` `compliance`

**File:** `contracts/token/src/lib.rs` lines 729 to 743 (`_check_compliance`), lines 602 to 617 (`set_compliance_node`)

**Issue:**

```rust
if let Some(node) = compliance_node {
    let client = ComplianceNodeClient::new(env, &node);
    assert!(
        client.can_trade(&from.clone(), &to.clone()),
        "trade blocked by compliance node"
    );
}
```

Three problems, all live.

**No failure containment.** This is a hard cross-contract call. If the node address is not a contract, has a different signature, has been archived, has had its WASM removed, panics, or exceeds budget, the host error propagates and every `transfer` and `transfer_from` reverts. Combined with `revoke_admin`, which blocks `set_compliance_node`, that is unrecoverable. The simplest version of the mistake, `set_compliance_node(Some(<this token's own address>))`, is accepted and permanently breaks all transfers.

**No validation on set.** The doc comment at lines 602 to 605 openly says "No validation is performed on-chain." Nothing probes `can_trade` even once before committing the address. Issue #263 was closed against this, but the resolution was to document the hazard rather than remove it.

**Not enforced on the other value-moving paths.** `_check_compliance` is called only from `transfer` (391) and `transfer_from` (450). `mint`, `mint_batch`, `burn`, `burn_admin`, and `clawback` skip it, so the admin can mint straight into an address the compliance node rejects. For a token whose selling point is regulated transfer gating, that is a hole in the policy rather than a convenience.

**Fix:** Use the generated `try_can_trade` and choose an explicit policy: fail closed with a typed error, or fail open behind an admin-settable flag, but never let a raw host error escape. Probe `can_trade` inside `set_compliance_node` before storing, and guarantee that clearing the node is always possible while an admin exists. Decide deliberately whether mint and clawback are in policy scope and document the answer. Add a mock compliance-node contract to the test suite, because there is currently none anywhere in the repo (see #119).

---

### 100. Token: freeze blocks sending only, so frozen accounts keep receiving tokens

🟡 **Medium** · `contracts` `token` `compliance`

**File:** `contracts/token/src/lib.rs` line 390, line 449; `_mint` lines 745 to 776; `_transfer` lines 813 to 842

**Issue:** The frozen check exists only in the public wrappers, and only for the sender:

```rust
assert!(!Self::_is_frozen(&env, &from), "account is frozen");
```

`_mint` has no frozen check on `to` at all, and `_transfer` checks neither side. `clawback` calls `_transfer` directly, so even a frozen admin can still be credited.

A wallet is frozen because it is sanctioned or provably compromised. Third parties can keep pushing tokens into it, and the admin can even mint into it. The balance grows while being permanently unspendable, so freeze fails as a blacklist: value keeps accumulating in an address the issuer has formally declared off limits, which is exactly the reporting problem freezing exists to prevent. The doc comment at line 266 ("preventing it from sending tokens") matches the code but not the compliance intent implied by the rest of the feature set.

**Fix:** Decide the semantic explicitly and make code, docs, and UI agree. If freeze is a blacklist, add `assert!(!Self::_is_frozen(&env, to))` inside `_transfer` and `_mint`, with a deliberate documented bypass for `clawback` so the admin can still recover funds. If freeze really is send-only, rename it to something like `freeze_outbound` and say so in the doc comment and the AdminPanel copy.

---

### 101. Token: no `#[contracterror]` enum, so release builds surface every failure identically

🟡 **Medium** · `contracts` `token` `dx`

**File:** `contracts/token/src/lib.rs` throughout; `grep -rn "contracterror" contracts/` returns nothing in either contract

**Issue:** The contract has roughly 30 distinct failure modes, all expressed as string panics: `panic!("already initialized")` (83), `assert!(amount > 0, "amount must be positive")` (133), `assert!(allowance >= amount, "insufficient allowance")` (455), `panic!("admin revoked: contract is locked")` (678), and so on.

Panic strings are stripped from release WASM. Every one of these therefore reaches clients as the same undifferentiated `Error(WasmVm, InvalidAction)` trap. The frontend cannot tell "insufficient balance" from "account is frozen" from "contract is paused", so it can only show a generic failure, which is a large part of why the app's error messages are unhelpful today. `try_*` client calls become useless for the same reason.

It also silently weakens the test suite: every `#[should_panic(expected = "...")]` assertion only discriminates in debug builds and stops distinguishing anything in release.

**Fix:** Define `#[contracterror] #[repr(u32)] pub enum TokenError { AlreadyInitialized = 1, NotAuthorized = 2, InvalidAmount = 3, InsufficientBalance = 4, InsufficientAllowance = 5, Paused = 6, Frozen = 7, Locked = 8, NotAuthorizedHolder = 9, ComplianceRejected = 10, ... }` and replace the asserts with `panic_with_error!`. Convert tests to `assert_eq!(client.try_x(...).err(), Some(Ok(TokenError::...)))`. Map the codes to human messages in `lib/soroban.ts` so the UI can finally explain failures. Do the same for the vesting contract.

---

### 102. Token: `mint`, `clawback`, and `approve` event payloads deviate from the SEP-41 schema

🟡 **Medium** · `contracts` `token` `compatibility`

**File:** `contracts/token/src/lib.rs` lines 774 to 775, 187 to 188, 440 to 441

**Issue:**

```rust
env.events().publish((symbol_short!("mint"), to.clone()), amount);
env.events().publish((symbol_short!("clawback"), from.clone()), amount);
env.events().publish((symbol_short!("approve"), from, spender), amount);
```

The standard shapes are `mint` with topics `("mint", admin, to)`, `clawback` with topics `("clawback", admin, from)`, and `approve` with data `(amount, expiration_ledger)`. Here `mint` and `clawback` omit the acting admin topic entirely, and `approve` publishes a bare amount with the expiration dropped.

Any off-the-shelf indexer, wallet, or explorer that decodes SEP-41 events positionally reads this token's `mint` events with `to` sitting in the `admin` slot and no `to` at all, and cannot recover allowance expiries from the event stream. So allowance UIs and mint attribution are wrong for this token specifically while working correctly for every other SEP-41 asset, which is the worst kind of incompatibility because it looks like a bug in the consumer.

**Fix:** Align all three topic and data tuples with the standard. Update `docs/events.md` (see #121) and the frontend decoders in the same PR.

---

### 103. Token: `authorize_holder` and `revoke_authorization` share one topic and put the holder in the data body

🟡 **Medium** · `contracts` `token` `transparency`

**File:** `contracts/token/src/lib.rs` lines 305 to 306 and 322 to 323

**Issue:**

```rust
env.events().publish((symbol_short!("auth"),), (holder, true));
env.events().publish((symbol_short!("auth"),), (holder, false));
```

This is the same anti-pattern that was fixed for freeze and unfreeze in #232, and it is worse here: both events carry the identical single topic `auth`, and the address, which is the only useful filter key, sits in the data payload rather than in a topic. Compare `freeze_account` (272) and `unfreeze_account` (281), which correctly use distinct topics and index the address.

Soroban RPC `getEvents` filters on topics only. A compliance dashboard asking "was address X ever authorized or revoked" must download and decode every `auth` event the contract ever emitted and filter client side, and cannot subscribe to grants and revocations separately. At any scale that exceeds the RPC event retention window and the query becomes impossible.

**Fix:** Emit `(symbol_short!("authorize"), holder)` and `(symbol_short!("revoke_auth"), holder)` with `()` as data, matching the freeze and unfreeze pattern. This also makes the frontend's existing `authorize` / `unauthorize` cases in #92 correct, so land the two together.

---

### 104. Token: the admin lifecycle emits no events at all

🟡 **Medium** · `contracts` `token` `transparency`

**File:** `contracts/token/src/lib.rs` lines 225 to 230 (`propose_admin`), 233 to 243 (`accept_admin`), 362 to 365 (`update_contract_uri`)

**Issue:** `propose_admin` and `accept_admin` both mutate the single most security-critical storage slot and publish nothing:

```rust
pub fn propose_admin(env: Env, new_admin: Address) {
    Self::_require_admin(&env);
    env.storage().instance().set(&DataKey::PendingAdmin, &new_admin);
}
```

```rust
pending.require_auth();
env.storage().instance().set(&DataKey::Admin, &pending);
env.storage().instance().remove(&DataKey::PendingAdmin);
```

`update_contract_uri` is silent too, while its sibling setters `set_max_balance_per_account` (595) and `set_compliance_node` (617) both emit, so the contract is internally inconsistent about which admin actions are auditable.

Ownership of a launchpad token can therefore change hands with no on-chain trace beyond a raw ledger-entry diff. Holders and monitoring tools get no event to alert on, which is exactly the signal a rug-pull detector needs, and it is why the frontend's `set_admin` subscription in #92 can never fire.

**Fix:** Publish `(symbol_short!("prop_admin"), current_admin, new_admin)` in `propose_admin` and `(symbol_short!("set_admin"), old_admin, new_admin)` in `accept_admin`, and add an event to `update_contract_uri`.

---

### 105. Token: a pending admin proposal cannot be cancelled and never expires

🟡 **Medium** · `contracts` `token` `security`

**File:** `contracts/token/src/lib.rs` lines 225 to 243

**Issue:** There is no `cancel_admin_proposal`, no expiry on a proposal, and no check that `new_admin != current_admin`. The doc comment at lines 500 to 504 confirms the pending entry is cleared only by `accept_admin` or `revoke_admin`, neither of which is a cancellation.

An admin who fat-fingers `propose_admin(wrong_address)` has two options: call `propose_admin(own_address)` to overwrite it, which leaves a live self-proposal outstanding forever, or `revoke_admin()`, which is irreversible. Worse, a proposal made to a partner address a year ago and forgotten stays redeemable. If that key is later compromised, the attacker calls `accept_admin()` and takes over mint, freeze, and clawback with no action from the current admin. `accept_admin` also skips `_check_paused`, so a takeover can complete during incident response while the contract is paused.

**Fix:** Add an admin-gated `cancel_admin_proposal` that removes `DataKey::PendingAdmin` and emits an event, store a proposal expiry ledger and enforce it in `accept_admin`, reject proposing the current admin, and add `Self::_check_paused(&env)` to `accept_admin`. Wire the cancel action into the AdminPanel, which currently fakes it by calling `propose_admin` again (`AdminPanel.tsx:654`).

---

### 106. Token: whale cap uses a different supply baseline on mint than on transfer, and its test is disabled

🟡 **Medium** · `contracts` `token`

**File:** `contracts/token/src/lib.rs` line 766 versus line 834; test at lines 922 to 932

**Issue:** `_mint` passes the post-mint `new_supply` as the cap denominator while `_transfer` passes the current supply. So mint and transfer measure the same percentage cap against different baselines, and the mint path is structurally more permissive.

The test that should have caught this has its assertion commented out:

```rust
#[test]
// #[should_panic(expected = "max balance per account exceeded")]
fn test_set_max_balance_per_account_mint_exceeds_panics() {
```

With the attribute commented out the test asserts nothing and passes as long as nothing panics, and nothing does. Traced through: supply starts at 1,000,000.0000000; after minting 100,000.0000000 the post-mint supply is 1,100,000.0000000, so `max_allowed` is 110,000.0000000 and the balance of 100,000.0000000 is under it. Minting one more base unit still leaves it under. Re-enabling the attribute would make this test fail. There is also a stale comment at lines 893 to 895 claiming a transfer "should exceed cap" while the code below transfers a smaller amount and asserts success.

**Fix:** Make `_mint` measure against the pre-mint supply so both paths agree, restore the `should_panic` attribute, and correct the stale comment. Never leave a commented-out `should_panic` in the tree; delete the test or fix it.

---

### 107. Token: `burn_self` is a byte-for-byte duplicate of `burn`

🟢 **Trivial** · `contracts` `token` `cleanup`

**File:** `contracts/token/src/lib.rs` lines 147 to 153 versus lines 215 to 221

**Issue:** Identical guards, identical body, identical intent. The two doc comments even repeat the same sentence about not letting a holder dodge a freeze:

```rust
pub fn burn(env: Env, from: Address, amount: i128) {
    Self::_check_paused(&env);
    from.require_auth();
    assert!(amount > 0, "amount must be positive");
    assert!(!Self::_is_frozen(&env, &from), "account is frozen");
    Self::_burn(&env, &from, amount);
}
```

`burn_self` is the same five lines. Two names for one behaviour doubles the entry-point surface that every future guard change must be applied to consistently, which is exactly the drift that produced #96, and it confuses SEP-41 clients about which entry point is canonical. It also inflates WASM size for nothing.

**Fix:** Delete `burn_self` and keep the standard-named `burn`. If the name is already deployed somewhere and must be preserved, make it a one-line delegate to `Self::burn`.

---

### 108. Token: `contract_uri()` panics on every freshly deployed token

🟢 **Trivial** · `contracts` `token` `dx`

**File:** `contracts/token/src/lib.rs` lines 628 to 633; test at 1633 to 1638

**Issue:**

```rust
pub fn contract_uri(env: Env) -> String {
    env.storage()
        .instance()
        .get(&DataKey::ContractUri)
        .expect("contract URI not set")
}
```

`ContractUri` is never written by `initialize` (there is no parameter for it) and is set only by `update_contract_uri`, so every freshly deployed token panics on this getter until an admin explicitly calls the setter. The test at 1633 enshrines that behaviour as intended. `admin()` similarly panics once locked, and `name` / `symbol` / `decimals` panic on an uninitialized contract.

A token detail page that renders metadata must either call `contract_uri` and swallow a transaction-level failure, or pre-check `is_locked()` before `admin()` and check initialization before `name()`. That is three round trips and a try/catch to render one card, and any missed guard surfaces as an error toast on a perfectly healthy token. `lib/stellar.ts:513` already works around it with a bare catch.

**Fix:** Return `Option<String>` from `contract_uri` and add an optional `contract_uri` parameter to `initialize`. Add an `Option<Address>`-returning admin getter alongside the panicking one. Best of all, add a single `metadata()` getter returning name, symbol, decimals, supply, paused, and locked in one call, which would collapse most of `fetchTokenInfo`'s round trips at the same time (see #117).

---

## Part 3: Vesting Contract

### 109. Vesting: the `Recipients` list grows without bound and is rewritten in full on every new recipient

🔴 **High** · `contracts` `vesting` `security`

**File:** `contracts/vesting/src/lib.rs` lines 601 to 624 (`_add_recipient`), lines 460 to 465 (`get_recipients`)

**Issue:**

```rust
fn _add_recipient(env: &Env, recipient: &Address) {
    let mut recipients = env.storage().persistent()
        .get(&DataKey::Recipients).unwrap_or(Vec::new(env));

    for r in recipients.iter() {
        if r == *recipient { return; }
    }

    recipients.push_back(recipient.clone());
    env.storage().persistent().set(&DataKey::Recipients, &recipients);
```

Every new recipient reads the entire list, scans it linearly, appends, and writes the whole thing back. The list is never pruned when a schedule is fully released or revoked. Both cost and size grow without bound.

Two failure modes. First, the entry eventually exceeds Soroban's ledger-entry size limit, at which point `create_schedule` and `create_schedules_batch` **permanently fail for every new recipient**, and there is no admin function to prune the list. Second, `get_recipients` returns the whole vector in one call, so it stops being readable well before that, taking the admin's "all vesting commitments" view down with it. With 32-byte addresses plus encoding overhead, the practical ceiling is on the order of a thousand or two recipients, which a launchpad running a few 50-recipient batches a week reaches inside a year.

**Fix:** Replace the single `Vec` with an indexed scheme: a `RecipientCount` counter plus `RecipientAt(u32)` entries, so adding is O(1) and no single entry grows. Keep `get_recipients_paginated` as the only enumeration API and drop or deprecate the unbounded `get_recipients`. Add a `prune_recipient(addr)` admin function for fully-settled recipients, and add a test that creates several hundred recipients and asserts creation still succeeds.

---

### 110. Vesting: `_vested_amount` multiplies `i128` unchecked

🟡 **Medium** · `contracts` `vesting`

**File:** `contracts/vesting/src/lib.rs` lines 585 to 599

**Issue:**

```rust
let elapsed = (current - schedule.cliff_ledger) as i128;
let duration = (schedule.end_ledger - schedule.cliff_ledger) as i128;
schedule.total_amount * elapsed / duration
```

`total_amount * elapsed` is a bare multiplication in a file that uses `checked_add` elsewhere (line 216). `elapsed` can be up to about 4.29e9, so a `total_amount` above roughly 4e28 overflows `i128`. In release WASM that wraps rather than panicking, so `_vested_amount` returns a wrapped, possibly negative figure.

The consequences are worse than a panic. `release` computes `releasable = vested - schedule.released`, and a wrapped `vested` either bricks the schedule (the `releasable > 0` assert fails forever) or, if it wraps positive and large, attempts a transfer far exceeding the schedule's allocation, draining tokens committed to other recipients. `vested_amount` is also a read-only getter the dashboard calls, so the UI would display the wrapped number as fact.

**Fix:** Use `checked_mul(...).expect(...)` (or a typed error per #101), or restructure as `total_amount / duration * elapsed + (total_amount % duration) * elapsed / duration` to keep intermediates small. Add a property test over large `total_amount` and long durations, and validate `total_amount` against a documented ceiling in `create_schedule`.

---

### 111. Vesting: `extend_cliff` silently compresses the vesting curve

🟡 **Medium** · `contracts` `vesting`

**File:** `contracts/vesting/src/lib.rs` lines 364 to 394

**Issue:** `extend_cliff` moves `cliff_ledger` later but leaves `end_ledger` untouched. Since `_vested_amount` interpolates linearly between cliff and end, shortening that window makes tokens vest **faster** per ledger after the new cliff.

Concretely: a grant with a 6-month cliff and a 4-year end has 42 months of linear vesting. Push the cliff to 12 months, and the recipient still reaches 100% at the same 4-year mark, but now over 36 months, so each month unlocks about 17% more than before. An admin who extends a cliff believes they are making a grant strictly less generous. They are making it strictly more back-loaded but faster-vesting, and nothing in the doc comment or the AdminPanel copy says so. The `clf_ext` event carries only the old and new cliff, so an off-chain monitor cannot see the rate change either.

**Fix:** Decide the intended semantic and implement it explicitly. Either shift `end_ledger` by the same delta so the vesting duration is preserved (probably what admins expect), or keep the current behaviour and both document it and show the recomputed unlock rate in the AdminPanel before the admin signs. Add a test asserting the post-extension monthly unlock rate.

---

### 112. Vesting: `pause` blocks `release`, letting an admin freeze already-vested claims indefinitely

🟡 **Medium** · `contracts` `vesting` `security`

**File:** `contracts/vesting/src/lib.rs` line 274 (`release` calls `_check_paused`), lines 419 to 430

**Issue:** `release` is documented as callable by anyone, which is the property that makes a vesting schedule trustworthy: the recipient does not need the admin's cooperation to claim what has already vested. But `_check_paused` is its first line, and `pause` is admin-only with no time limit, no expiry, and no recipient recourse.

So an admin can pause the vesting contract and simply never unpause. Tokens that have already vested, which the recipient has legally earned, become unclaimable forever. For an employee-grant or investor-tranche product this is the central trust assumption, and it does not currently hold. `revoke` being pause-gated is fine, since that is an admin action; `release` being pause-gated inverts the guarantee.

**Fix:** Remove the pause guard from `release`, so a pause halts new commitments and admin mutations but never blocks a recipient claiming vested tokens. If an emergency stop on releases is genuinely required, make it time-boxed: store a `paused_until` ledger with a hard maximum (say 7 days) that `release` checks, so the block always expires without needing admin action. Document the choice prominently, since it is a trust property holders will evaluate.

---

### 113. Vesting: `initialize` has no `require_auth`

🟡 **Medium** · `contracts` `vesting` `security`

**File:** `contracts/vesting/src/lib.rs` lines 59 to 70

**Issue:** Same shape as #85. The function writes the `admin` argument straight to storage with no authorization check:

```rust
pub fn initialize(env: Env, admin: Address, token_contract: Address) {
    if env.storage().instance().has(&DataKey::Admin) {
        panic!("already initialized");
    }
    env.storage().instance().set(&DataKey::Admin, &admin);
```

Anyone who spots a deployed but uninitialized vesting contract can claim it, becoming the admin who controls `revoke`, `extend_cliff`, and `pause` over every schedule subsequently created, and pointing `TokenContract` at a token of their choosing. Less immediately profitable than the token case because the contract holds no funds yet, but it hands over permanent control of the module.

**Fix:** Add `admin.require_auth();` as the first statement. Add a `#[should_panic]` test using `MockAuth` to confirm an unauthorized initialize is rejected.

---

### 114. Vesting: no aggregate getters, so `index: None` silently touches only the newest schedule

🟡 **Medium** · `contracts` `vesting` `frontend`

**File:** `contracts/vesting/src/lib.rs` lines 536 to 547 (`_resolve_schedule_index`), lines 399 to 408

**Issue:** `_resolve_schedule_index` defaults `None` to `count - 1`, the newest schedule. That default is applied consistently across `release`, `revoke`, `get_schedule`, `vested_amount`, and `released_amount`, which is good, but it makes every single-value API quietly wrong for a multi-schedule recipient:

```rust
None => {
    assert!(count > 0, "no schedule found");
    count - 1
}
```

A recipient with three tranches who calls `release(me, None)` claims from the newest one only and has no signal that two others hold claimable tokens. `vested_amount(me, None)` reports the newest schedule's figure, so any integration or dashboard that trusts it under-reports the recipient's position. The frontend works around this by fetching `get_schedule_count` and looping (`PersonalDashboard.tsx:219-224`, `ClaimVesting.tsx:61`), which is N+1 RPC calls and puts correctness in the caller's hands.

**Fix:** Add aggregate getters that do the summing on chain: `total_vested(recipient)`, `total_released(recipient)`, `total_releasable(recipient)`, and a `get_all_schedules(recipient) -> Vec<VestingSchedule>` so the UI needs one call rather than `count + 1`. Add `release_all(recipient)` that iterates every non-revoked schedule and transfers the combined releasable amount in a single transaction, which is the operation recipients actually want. Then point the frontend at these and delete the loops.

---

### 115. Vesting: no solvency accounting, so a token clawback can leave schedules unpayable

🟡 **Medium** · `contracts` `vesting` `security`

**File:** `contracts/vesting/src/lib.rs` lines 106 to 164, 273 to 308

**Issue:** The contract tracks no total of what it owes. `create_schedule` pulls `total_amount` from the admin and trusts that the balance stays put; `release` transfers and trusts the balance is sufficient.

But the token admin and the vesting admin are typically the same person, and the token contract exposes `clawback(from, amount)`, which works against any address including the vesting contract's own. Nothing prevents the admin clawing back tokens that are already committed to schedules. When they do, `release` fails on insufficient balance for whichever recipients claim last, so the loss lands arbitrarily on whoever is slowest rather than being visible up front. A frozen or paused token produces the same class of failure. There is no getter that would let a recipient or auditor check whether the contract is actually solvent before trusting a schedule.

**Fix:** Maintain a `TotalCommitted` counter, incremented on create and decremented on release and revoke, and expose `total_committed()` alongside a `solvency()` helper that compares it to the contract's live token balance. Have `create_schedule` assert the post-create balance covers `TotalCommitted`. Surface a prominent solvency badge on the vesting dashboard, since it is the single most useful trust signal for a recipient. Document that the token admin can undermine the vesting contract and recommend `revoke_admin` on the token, or a separate token admin, for grants that need to be credible.

---

### 116. Vesting: the contract is not upgradeable while the token is

🟡 **Medium** · `contracts` `vesting`

**File:** `contracts/vesting/src/lib.rs`; compare `contracts/token/src/lib.rs` line 371

**Issue:** The token contract has `upgrade(new_wasm_hash)` and the AdminPanel has a full UI for it. The vesting contract has no `upgrade` function at all. Given that this wave alone identifies an overflow (#110), a bricking TTL limit (#88), an unbounded storage list (#109), and a trust inversion (#112) in the vesting contract, the module that most needs a patch path is the one that does not have one. Every already-deployed vesting contract is permanently stuck with whatever bugs it shipped with, and the only remediation is asking recipients to migrate to a new contract by hand.

**Fix:** Add `upgrade(new_wasm_hash: BytesN<32>)` mirroring the token's implementation, including the `is_locked` interaction, the zero-hash rejection, and the event carrying the new hash. Add a matching `revoke_admin` / lock path so a vesting contract can also be made credibly immutable once its schedules are final, and extend the AdminPanel upgrade card to target either contract.

---

### 117. Vesting: no `pending_admin()` getter, so the two-step transfer is invisible

🟢 **Trivial** · `contracts` `vesting` `frontend`

**File:** `contracts/vesting/src/lib.rs` lines 76 to 96

**Issue:** The vesting contract has `propose_admin` and `accept_admin` writing and clearing `DataKey::PendingAdmin`, but no read-only getter for it. This is exactly the gap that issue #301 fixed on the token contract, which now has `pending_admin()` and a frontend banner. The vesting contract was not included.

A proposer cannot confirm their proposal landed and a recipient cannot verify they are the named pending admin before signing `accept_admin`, on the contract that controls everyone's grants. There is also no `cancel` path, mirroring #105.

**Fix:** Add `pub fn pending_admin(env: Env) -> Option<Address>` and a `cancel_admin_proposal`. Reuse the token's AdminPanel banner component for the vesting contract's admin section.

---

### 118. Vesting: `create_schedule` accepts a cliff and end entirely in the past

🟢 **Trivial** · `contracts` `vesting`

**File:** `contracts/vesting/src/lib.rs` lines 121 to 125

**Issue:** The only ledger validation is relative:

```rust
assert!(total_amount > 0, "total_amount must be positive");
assert!(end_ledger > cliff_ledger, "end_ledger must be after cliff_ledger");
```

Neither value is compared against `env.ledger().sequence()`. A schedule with both ledgers in the past is accepted and is immediately 100% vested, so the recipient can claim the entire amount in the next transaction. `_ttl_ledgers` even has a dedicated fallback branch for this case (line 568), which reads as though it were intended rather than a mistake.

The realistic path to this is an off-by-one in the caller: the AdminPanel computes ledgers from `getLatestLedger()` plus a day count, so a stale ledger read, a clock or units mistake, or a hand-entered value produces an instantly-vested grant instead of an error. That is a large, silent, irreversible mistake, since the tokens are gone as soon as the recipient claims.

**Fix:** Assert `cliff_ledger >= env.ledger().sequence()` in both `create_schedule` and `create_schedules_batch`. If a backdated grant is a real use case, gate it behind an explicit `allow_backdated: bool` parameter so it can never happen by accident, and show a confirmation in the UI.

---

### 119. Contract test suites: no compliance-node mock, no vesting fuzz tests, and several vacuous negative tests

🟡 **Medium** · `contracts` `tests`

**Files:** `contracts/token/src/lib.rs` tests at 849 to 1910, `contracts/token/tests/fuzz_tests.rs`, `contracts/vesting/src/lib.rs` tests at 632 to 1553

**Issue:** Concrete, enumerated gaps in what is otherwise a reasonable suite.

Token:

- **Zero tests for `clawback`.** No happy path, no supply or `total_burned` interaction, no pause interaction, no frozen-source case.
- **Zero tests for compliance enforcement.** `test_set_and_remove_compliance_node` (1861) only round-trips the getter. No mock contract implementing `ComplianceNodeInterface` exists anywhere in the repo, so the `can_trade == false` branch (738 to 741) and every failure mode in #99 are entirely unexercised.
- **No `upgrade` happy-path test.** Only the zero-hash and non-admin rejections (1641, 1649).
- **No test that `approve` works while paused** (#96), that `initialize` fails after `revoke_admin` (#86), that `initialize` requires auth (#85), or that transfers survive `revoke_admin` with a cap set (#87). Each of those bugs exists precisely because its test is missing.
- **Vacuous negative tests.** `test_non_admin_cannot_freeze` (1390) and `test_non_admin_cannot_pause` (1498) use bare `#[should_panic]` with no `expected`, so they pass on any panic, including one from a mis-specified `MockAuthInvoke` that never reaches the guard.
- **Fuzz coverage is mint, burn, and transfer only.** `fuzz_tests.rs` has no property covering `approve` or `transfer_from` (no allowance-conservation invariant), `clawback`, `mint_batch`, authorization, the whale cap, freeze, or pause, despite its header claiming 8 invariants.

Vesting (33 tests, all inline):

- **No fuzz tests at all.** `contracts/vesting/` has no `tests/` directory; the token's `fuzz_tests.rs` has no counterpart.
- **No tests for `pause` or `unpause` themselves**, only that `extend_cliff` is blocked while paused.
- **No tests for `get_recipients` or `get_recipients_paginated`**, including the `start + limit` boundary that #269 was closed for.
- **No tests for `propose_admin` / `accept_admin`, `get_admin`, or `get_token_contract`.**
- **No long-duration test**, which is why #88 shipped.

**Fix:** Add a `MockComplianceNode` contract under `contracts/token/tests/` with configurable allow and deny behaviour, and test both branches plus the panicking-node case. Give every `#[should_panic]` an `expected` string, which #101's typed errors will make robust in release too. Add a `contracts/vesting/tests/fuzz_tests.rs` with invariants for vested-amount monotonicity, `sum(released) <= total_amount`, and solvency. Fill the enumerated gaps. Then add coverage reporting to CI (see #124) with a floor, so the next wave does not have to enumerate this by hand.

---

## Part 4: Frontend Architecture and Quality

### 120. AdminPanel is a 2,351-line monolith with a 14-branch dispatcher and 11 RPC clients

🔴 **High** · `frontend` `architecture`

**File:** `frontend/app/dashboard/[contractId]/components/AdminPanel.tsx` (2,351 lines)

**Issue:** One component now holds every admin capability. `handleAction` is a single if/else chain dispatching 14 distinct actions (`mint`, `clawback`, `burn-admin`, `transfer`, `cancel-admin`, `accept-admin`, `vesting`, `metadata-uri`, `extend-cliff`, `vesting-revoke`, `set-whale-cap`, `disable-whale-cap`, `set-compliance-node`, `clear-compliance-node`) at lines 596 to 795, followed by a second parallel if/else chain at lines 841 to 890 for success handling, plus separate bespoke handlers for pause, upgrade, and batch mint. `grep -c "new rpc.Server" AdminPanel.tsx` returns **11**: the file constructs its own RPC client eleven times instead of once.

The costs are concrete rather than aesthetic. Every new capability means touching two long if/else chains that must stay in sync, which is how #92's topic drift and #83's two-scaling-paths happened. The file has no test at all (see #125), because nothing in it is independently testable. And the eleven RPC clients mean a network switch mid-session can leave different actions pointed at different endpoints.

**Fix:** Extract a `useAdminAction` hook holding the shared build, simulate, sign, submit, toast, and refresh sequence, taking a method name and an ScVal array. Define the 14 actions as a declarative map from action key to `{ method, buildArgs, confirmCopy, successCopy }`, which collapses both if/else chains into one lookup. Split the JSX into the cards it already visually is (`MintCard`, `SupplyCard`, `AdminLifecycleCard`, `SecurityCard`, `PolicyCard`, `VestingCard`, `DangerCard`), each under 200 lines and each testable. Construct the RPC client once from `networkConfig`. Do this before #89 and #90 add two more cards to the pile.

---

### 121. Debug `console.log` calls are back in eight places (regression of #274 and #275)

🟢 **Trivial** · `frontend` `quality`

**Files:** `frontend/app/token/[contractId]/PublicTokenPage.tsx:85`; `components/forms/VestingForm.tsx:100,289`; `components/forms/MintForm.tsx:111`; `components/forms/TransferForm.tsx:99`; `components/forms/BurnForm.tsx:99`; `app/dashboard/[contractId]/components/UserPanel.tsx:114,124`; `lib/indexer.ts:149`

**Issue:** Issues #274 and #275 are both closed. The code they describe is present, at almost exactly the line numbers Wave 6 recorded:

```ts
// PublicTokenPage.tsx:85  (this is #274 verbatim)
console.log(err);
// VestingForm.tsx:100
console.log("Submitting vesting release transaction:", data);
// MintForm.tsx:111
console.log("Submitting mint transaction:", data);
// UserPanel.tsx:114
console.log(`Signing burn tx for ${contractId}`);
```

These log raw form payloads, including amounts and addresses, to the browser console on every submit in production. `PublicTokenPage.tsx:85` is worse than noise: a caught error is dropped into `console.log` and the visitor sees nothing at all.

**Fix:** Delete all eight. Replace `PublicTokenPage.tsx:85` with the user-visible error state the page already supports. Then make the regression impossible: add `"no-console": ["error", { "allow": ["warn", "error"] }]` to the ESLint config, which CI already runs via `npm run lint`. Without that rule this will be back for a fifth time.

---

### 122. i18n: 4 complete translation files exist and 77 of 84 components ignore them

🟡 **Medium** · `frontend` `i18n`

**Files:** `frontend/messages/{en,es,fr,zh}.json` (169 lines each); `grep -rl "useTranslations" app components` returns 7 files

**Issue:** Issue #182 ("Language Switcher Has No Effect") is closed, and the pieces are genuinely in place: `LocaleProvider`, the switcher, and four fully translated message files (spot-checked, es and zh contain real translations, not stubs). But only 7 of 84 components consume them: `app/page.tsx`, `app/deploy/page.tsx`, `app/deploy/DeployForm.tsx`, `app/deploy/steps/StepMetadata.tsx`, `app/deploy/steps/StepSupply.tsx`, `app/dashboard/[contractId]/TokenDashboard.tsx`, and `app/components/Navbar.tsx`.

So switching to Spanish translates the navbar, the landing page, and two deploy steps, and leaves the entire dashboard, the whole AdminPanel, every form, the public token page, my-account, and the claim flow in English. A user who switches language gets a half-translated interface, which is arguably a worse experience than a consistently English one, and the translation work already paid for is about 92% unused.

**Fix:** Treat this as a measured sweep rather than one large PR. Order by traffic: public token page, claim flow, my-account, dashboard panels, then AdminPanel. Add the missing keys to `en.json` first, then have the other three follow. Add a CI check that fails when a component contains a user-visible string literal outside a `t()` call (an ESLint rule such as `react/jsx-no-literals` scoped to `app/` and `components/` gets most of the way there), otherwise coverage will drift back down as new components land.

---

### 123. No generated contract bindings: ScVal encoding is hand-rolled at every call site

🔴 **High** · `frontend` `architecture` `dx`

**Files:** `frontend/lib/stellar.ts` (1,632 lines), `app/dashboard/[contractId]/components/AdminPanel.tsx`, `app/hooks/useDeployToken.ts`, `lib/transactionSimulator.ts`

**Issue:** Every contract interaction in the app hand-builds its arguments with `nativeToScVal`, `new Address(...).toScVal()`, and `xdr.ScVal.scvVoid()`, and hand-decodes results with `scValToNative`. Method names are bare strings (`contract.call("initialize", ...)`, `method = "burn_admin"`), so nothing connects them to the Rust source.

This is the shared root cause of a striking number of the bugs in this wave and the last one. Nothing catches a wrong argument count (#53), a missing decimal scaling (#83, and #29 and #54 before it), an argument in the wrong position, a method name that does not exist, or a topic name the contract never emits (#92). Every one of those is a compile-time error the moment the ABI is typed, and every one of them shipped to `master` because it is not.

The Stellar SDK generates exactly this: `stellar contract bindings typescript --wasm <path>` emits a typed client with real method signatures and result types.

**Fix:** Generate bindings for both contracts into `frontend/lib/bindings/{token,vesting}/` and add a CI step that regenerates them from the built WASM and fails if the checked-in output differs, so the ABI and the frontend cannot drift. Migrate call sites incrementally, starting with `useDeployToken` (the highest-consequence path, and the one that has now shipped two argument bugs) and `AdminPanel`. Note the ordering dependency: doing #120 first makes this migration far smaller, since there would be one dispatcher to convert instead of fourteen branches.

---

### 124. The Playwright suite has zero spec files and its CI workflow is fully commented out

🟡 **Medium** · `frontend` `tests` `ci`

**Files:** `frontend/e2e/` (contains only `global.d.ts`, `README.md`, `mocks/mockFreighter.ts`); `frontend/playwright.config.ts:13` (`testDir: './e2e'`); `.github/workflows/e2e-tests.yml` (every line commented out); `frontend/docs/e2e-testing-guide.md`, `frontend/docs/e2e-debugging-guide.md`

**Issue:** There is a Playwright config, six npm scripts (`test:e2e`, `test:e2e:ui`, `test:e2e:headed`, `test:e2e:ci`, `test:e2e:report`, `test:e2e:install`), a Freighter mock, two documentation guides, and a 50-line GitHub Actions workflow. There is not a single `.spec.ts`. `npm run test:e2e` finds no tests and exits successfully. The workflow's every line, starting from `# name: E2E Tests`, is commented out, so it never runs even if specs appeared.

Meanwhile `README.md` lists "Soroban CLI + Jest + Playwright" as the testing stack, and the two guides describe debugging a suite that does not exist. A contributor reasonably concludes the critical flows are covered end to end. They are not covered at all, which is a significant part of why #83, #89, #90, and #91 reached `master` unnoticed: each is the kind of break a single smoke test would catch.

**Fix:** Write the four specs that map to the product's core promise, using the existing `mockFreighter`: deploy a token and land on its dashboard with the **correct supply displayed** (this one alone catches #83); mint and see the holder balance update; create a vesting schedule and claim from it; connect a wallet and switch networks. Then uncomment the workflow, point it at `master` rather than the non-existent `main`/`develop` branches it currently names, and make it required. If e2e is not going to be maintained, delete the config, the six scripts, the mock, and both guides instead, and correct the README. Either outcome is better than infrastructure that reports success while testing nothing.

---

### 125. No tests for any of the highest-risk frontend code

🟡 **Medium** · `frontend` `tests`

**Files:** 12 test files total (`__tests__/`, `lib/__tests__/`, `app/providers/__tests__/`, `app/components/__tests__/`) against 84 components

**Issue:** The existing tests are reasonable as far as they go (`stellar.test.ts`, `settingsProvider.test.tsx`, `transactionSimulator.test.tsx`, `allowanceManager.test.tsx`, `stepReview.test.tsx`, provider tests). What they do not cover is everything that has actually broken:

- `AdminPanel.tsx` (2,351 lines, 14 actions, every admin capability): no test.
- `useDeployToken.ts` (the argument encoding that has now shipped two production bugs): no test.
- `TransferPanel.tsx`, `UserPanel.tsx`, `HoldersTable.tsx`, `TokenDashboard.tsx`: no tests.
- `ClaimVesting.tsx`, `PersonalDashboard.tsx`: no tests.
- `useContractEvents.ts` and `lib/indexer.ts` (the topic lists in #92): no tests.
- All seven `components/forms/*`: no tests.
- `jest.config` sets `coverageProvider: 'v8'` and `npm test` runs `--coverage`, but there is no `coverageThreshold`, so coverage is measured, published, and never enforced.

**Fix:** Do not chase a global percentage. Add targeted tests where the failure modes are known and the cost of being wrong is highest: pure unit tests for every amount-scaling and ledger-math helper (which is the single highest-value addition, and a natural companion to extracting the shared `toBaseUnits` helper in #83); a test asserting the ScVal array `useDeployToken` builds for a known input, argument by argument; a test asserting the tracked event topic list matches the contract's emitted set (#92); and rendering tests for `AdminPanel`'s cards once #120 has split them. Then set a `coverageThreshold` at whatever the result is and ratchet it upward.

---

### 126. 20 npm advisories including 1 critical, and the only unused direct dependency is a high one

🟡 **Medium** · `frontend` `security` `deps`

**File:** `frontend/package.json`; `npm audit` output

**Issue:** `npm audit` currently reports **20 vulnerabilities: 2 low, 3 moderate, 14 high, 1 critical**. High or critical, by directness:

- Direct: `@stellar/wallet-sdk` (high), `xlsx` (high), `next` (high)
- Transitive: `handlebars` (critical), `axios`, `stellar-sdk`, `sharp`, `ws`, `postcss`, `js-yaml`, `minimatch`, `brace-expansion`, `form-data`, `flatted`, `picomatch` (all high)

Two of these are easy wins. `@stellar/wallet-sdk@^0.9.0` is flagged high **and is not imported anywhere**: `grep -rl "@stellar/wallet-sdk" app components lib hooks` returns nothing, since the app uses `@stellar/freighter-api` plus its own adapters in `app/lib/wallets/`. It can simply be deleted. `lightningcss` is likewise unused, and there are about ten stray `@types/*` devDependencies (`@types/babel__*`, `@types/d3-color`, `@types/d3-path`, `@types/tough-cookie`, `@types/yargs-parser`, `@types/istanbul-lib-report`) that are transitive types someone installed explicitly.

`xlsx` needs a decision rather than a bump: the npm-published version is pinned at 0.18.5 because SheetJS distributes newer releases only from its own CDN, so `npm audit fix` cannot resolve it. It is used in one file, `TransactionHistory.tsx`, alongside `jspdf`.

**Fix:** Remove `@stellar/wallet-sdk` and `lightningcss` and prune the stray `@types/*` (that alone clears one direct high). Run `npm audit fix` for the transitive set and upgrade `next` within its major. For `xlsx`, either migrate `TransactionHistory.tsx` to `exceljs`, or drop XLSX export entirely and keep CSV plus the existing PDF path, since CSV covers the actual use case. Then add `npm audit --audit-level=high` and `cargo audit` to CI (see #128) so this is caught at the PR rather than found by hand two waves later. Please re-run `npm audit` before acting, since advisory data changes daily.

---

### 127. 59 build artifacts are committed, and `.gitignore` does not cover them

🟢 **Trivial** · `repo` `hygiene`

**Files:** `frontend/coverage/**` (57 files), `frontend/tsconfig.tsbuildinfo`, `frontend/tsconfig.audit.tsbuildinfo`; `.gitignore`, `frontend/.gitignore`

**Issue:** `git ls-files | grep -cE "tsbuildinfo|coverage/"` returns **59**. The tracked set includes `frontend/coverage/clover.xml`, `frontend/coverage/coverage-final.json`, and around 55 generated `lcov-report/**/*.html` files, plus `tsconfig.tsbuildinfo`. `git status` on a clean checkout already shows `M frontend/tsconfig.tsbuildinfo` and an untracked `frontend/tsconfig.audit.tsbuildinfo`, so every contributor gets spurious diffs before touching anything.

The cause is that `npm test` runs `jest --coverage`, writing into `coverage/`, and neither ignore file lists it:

```
# .gitignore
target/
frontend/.next
frontend/node_modules
issue.md
pr.md
*.stackdump
```

```
# frontend/.gitignore
.env
node_modules
.next
out
```

Committed HTML coverage reports also mislead: they are a snapshot from whenever someone last ran the suite, and they will diverge from reality silently.

**Fix:** `git rm -r --cached frontend/coverage frontend/tsconfig.tsbuildinfo frontend/tsconfig.audit.tsbuildinfo`, add `coverage/`, `*.tsbuildinfo`, `playwright-report/`, `test-results/`, and `.env*.local` to `frontend/.gitignore`, and add the missing trailing newline to the root `.gitignore` (it currently ends mid-line at `*.stackdump`). If coverage visibility is wanted, publish it from CI as an artifact or to Codecov rather than committing it.

---

### 128. CI runs no clippy, no dependency audit, and no coverage floor

🟡 **Medium** · `ci` `quality`

**File:** `.github/workflows/ci.yml`

**Issue:** The pipeline does `cargo fmt --check`, `cargo test --workspace`, a WASM build with a size report, then frontend `lint`, `type-check`, and `jest`. That is a decent skeleton with specific gaps, each of which maps to a real issue in this wave:

- **No `cargo clippy -- -D warnings`.** Clippy flags several of the patterns behind #94, #110, and #71's original overflow class, including unchecked arithmetic and needless clones.
- **No `cargo audit` and no `npm audit`.** #126's 20 advisories, one critical, accumulated entirely unnoticed.
- **No coverage threshold**, though `npm test` already computes coverage (#125).
- **No Playwright job**, and the separate workflow is fully commented out (#124).
- **No WASM optimization step.** The size report measures the unoptimized `cargo build` output, not what `stellar contract optimize` would produce, so the number reported on each PR is not the deployed size.
- **`cargo test --workspace` runs debug only**, so every `#[should_panic(expected = "...")]` assertion is only meaningful in debug and silently stops discriminating in release (see #101).

**Issue also:** `e2e-tests.yml` triggers on `main` and `develop`, neither of which exists in this repo. The default branch is `master`.

**Fix:** Add `cargo clippy --all-targets -- -D warnings`, `cargo audit`, and `npm audit --audit-level=high` as required steps. Add a `coverageThreshold` to `jest.config` set to current levels and ratchet it. Run `stellar contract optimize` before the size report so the PR comment reflects deployed size. Re-enable the e2e workflow against `master` once #124 has specs. Consider a scheduled weekly audit-only run so advisories surface without waiting for a PR.

---

### 129. `docs/events.md` is stale, and it is the source of the indexer's wrong topic names

🟢 **Trivial** · `docs` `contracts`

**File:** `docs/events.md`

**Issue:** The token table documents 7 events. The contract emits 15. The doc lists a `set_admin` event that **does not exist in the contract**, and omits `clawback`, `freeze`, `unfreeze`, `pause`, `unpause`, `auth`, `revoked`, `upgrade`, `set_max_b`, and `set_cnode`. The vesting table lists 3 of roughly 9, missing `revoke`, `clf_ext`, `batch`, `pause`, `unpause`, `prop_adm`, and `acc_adm`.

This is not merely out of date, it is the upstream cause of #92. The frontend's `TRACKED_EVENT_TOPICS` contains `set_admin` because this document says `set_admin` exists. Someone implemented the indexer against the documentation rather than the contract, and the documentation was wrong, so the activity feed silently drops entire categories of event. Documentation drift produced a functional bug.

**Fix:** Regenerate the tables from the contract source and fix them in the same PR as #92, #102, #103, and #104 so the doc, the contract, and the indexer land consistent. Then stop maintaining it by hand: add a contract test that asserts the emitted topic set matches a checked-in fixture, and generate the table from that fixture, so the three can never diverge again.

---

### 130. README and `.env.example` describe a stack and configuration that no longer match

🟢 **Trivial** · `docs` `dx`

**Files:** `README.md`, `.env.example`

**Issue:** `README.md` states the frontend is "Next.js 14 + TypeScript"; `package.json` has `next: 16.1.6` and `react: 19.2.3`. It lists "Soroban CLI + Jest + Playwright" for testing, but Playwright has no specs (#124). Its Getting Started section says `npm install` at the repo root, where there is no `package.json`, and `soroban contract build`, though the CLI has been renamed to `stellar`. The project structure diagram omits `app/api/`, `app/claim/`, `app/my-account/`, `app/allowances/`, and `messages/`.

`.env.example` still documents `NEXT_PUBLIC_SOROBAN_RPC_URL` and `NEXT_PUBLIC_NETWORK_PASSPHRASE` as the way to configure the network, which #254 deliberately removed in favour of `useNetwork()` and the Settings modal. It omits `NEXT_PUBLIC_MERCURY_AUTH_TOKEN` entirely, even though the indexer, transaction history, and `/api/tokens/recent` all read it. And `NEXT_PUBLIC_TOKEN_WASM_HASH` is a single value, though the WASM must be installed separately on each network, so anyone switching to mainnet with a testnet-only install gets an opaque deploy failure.

**Fix:** Correct the versions, the install and build commands, and the structure diagram. Rewrite `.env.example` to list only variables the code actually reads, add `NEXT_PUBLIC_MERCURY_AUTH_TOKEN` with a note that history degrades gracefully without it, and make the WASM hash per-network (`NEXT_PUBLIC_TOKEN_WASM_HASH_TESTNET`, `..._PUBLIC`) with a clear error when the selected network has no hash configured. Add a CI check that every `process.env.NEXT_PUBLIC_*` reference in the source appears in `.env.example`.

---

### 131. Duplicated constants and helpers: the ledgers-per-day figure and the tracked-topic list

🟢 **Trivial** · `frontend` `cleanup`

**Files:** `components/forms/ApproveForm.tsx:70`; `app/dashboard/[contractId]/components/AdminPanel.tsx:680,681,726`; `lib/recentTokens.ts:18`; `lib/stellar.ts:806-820`; `hooks/useContractEvents.ts:19-33`

**Issue:** The magic number `17280` (ledgers per day at roughly 5 second close times) is written out at five call sites with four different local comments. It is correct in all five today, which is precisely the risk: the same figure was wrong in `ApproveForm` until #307, and there is nothing to keep the next copy right.

The event topic list is duplicated verbatim in two files, and `useContractEvents.ts:18` carries the comment "mirrors TRACKED_EVENT_TOPICS in stellar.ts", acknowledging a hand-maintained invariant. Both copies are currently wrong in the same four ways (#92), which is what hand-mirroring produces.

**Fix:** Export `LEDGERS_PER_DAY` from `lib/soroban.ts` alongside a `daysToLedgers(days, currentLedger)` helper, and use it everywhere including the vesting cliff math. Export the topic list from `lib/stellar.ts` and import it in `useContractEvents.ts`. Small changes, but they close two of the exact drift channels this wave keeps finding bugs in.

---

## Part 5: New Advanced Features

### 132. Deploy factory contract: make deploy and initialize atomic

🔴 **High** · `contracts` `frontend` `deploy` `security`

**Files:** new `contracts/factory/`; `frontend/app/hooks/useDeployToken.ts`

**Issue and opportunity:** The current flow signs two transactions: `createCustomContract`, then `initialize`. That split is the direct cause of #85's front-running window, and it means a failure in the second transaction leaves an orphaned uninitialized contract on chain with the deploy fee already spent. It also makes deployment a two-signature experience, which contradicts the PRD's zero-to-deployed-in-ten-minutes goal.

A factory contract fixes all three at once. `deploy_token(salt, admin, decimals, name, symbol, initial_supply, max_supply, auth_required, auth_revocable, compliance_node)` calls `env.deployer().with_address(...)` and invokes `initialize` on the new contract in the same invocation. One transaction, one signature, atomic, and no window in which an uninitialized contract is exposed.

It also unlocks things the current flow cannot do: a registry event per launch (giving `RecentLaunches` a real on-chain index instead of depending on Mercury), an optional protocol fee, per-network WASM hash pinning on chain rather than in an env var (#130), and optional atomic deployment of a paired vesting contract.

**Fix:** Add `contracts/factory/` with `deploy_token`, an admin-settable `token_wasm_hash`, a `deployed` event carrying the new contract ID and its metadata, and a `get_deployments_paginated` getter (using the indexed pattern from #109, not an unbounded `Vec`). Rewrite `useDeployToken` to a single factory call. Keep the direct path behind a flag for one release for anyone mid-migration.

---

### 133. Vesting dashboard for admins: all schedules, obligations, and solvency in one view

🟡 **Medium** · `frontend` `vesting` `admin`

**Issue and opportunity:** An admin who has created 50 schedules across several batches has no way to see them. `get_recipients_paginated` exists on the contract and `grep -rn "get_recipients" app components lib hooks` returns **nothing**, so it is unused. The AdminPanel can create a schedule and manage one recipient at a time, given an address the admin must already know.

There is no answer in the app to the questions a treasury manager actually asks: how many tokens are committed to vesting in total, what unlocks in the next 30 days, which grants are fully vested but unclaimed, which are revoked, and is the contract solvent.

**Fix:** Add a Vesting tab to the dashboard that pages through `get_recipients_paginated`, fetches each recipient's schedules via the aggregate getter from #114 (one call per recipient rather than the current N+1), and renders a sortable table with recipient, tranche count, total, vested, released, remaining, next unlock date, and status. Add a summary strip with total committed, total released, and the solvency badge from #115, plus a stacked-area chart of projected unlocks over the next 12 months, which is the view that makes the feature genuinely useful. Include CSV export, reusing `HoldersTable`'s existing exporter.

---

### 134. Merkle-proof airdrop and claim module

🔴 **High** · `contracts` `frontend` `feature`

**Issue and opportunity:** Distributing to 10,000 addresses today means 200 `mint_batch` transactions of 50 recipients each, at the admin's expense, with the admin writing the orchestration themselves. `mint_batch`'s 100-recipient cap makes the ceiling explicit. For a launchpad, "launch a token and distribute it" is one job, and the app currently does the first half.

The standard answer is a Merkle claim: the admin publishes a root on chain, recipients claim against a proof, and each recipient pays their own transaction fee. Cost to the admin is one transaction regardless of list size, and unclaimed allocations can be reclaimed after a deadline.

**Fix:** Add `contracts/airdrop/` with `initialize(token, admin, merkle_root, deadline_ledger)`, `claim(recipient, amount, proof: Vec<BytesN<32>>)` using `env.crypto().keccak256`, a `Claimed(Address)` set to prevent double claims, and `reclaim_unclaimed()` after the deadline. On the frontend, add an admin page that takes a CSV of address and amount, builds the tree in the browser, shows the root to publish, and exports the proof set, plus a public `/airdrop/[contractId]` page where a connected wallet sees its allocation and claims. Note this depends on nothing else in this wave and can proceed in parallel.

---

### 135. Contract verification badge: prove a deployed token runs the audited WASM

🟡 **Medium** · `frontend` `contracts` `trust`

**Issue and opportunity:** A visitor to a token's public page has no way to know whether it is a stock SoroPad token or a modified contract with an added backdoor. `upgrade()` exists, so even a token that started as stock may not be stock now, and #86 shows that a locked contract is not necessarily what it appears either. The dashboard shows the admin address and supply; it says nothing about the code.

The WASM hash for a deployed contract is readable from its ledger entry, and SoroPad builds the reference WASM in CI on every commit. Comparing the two is a cheap, genuinely valuable trust signal, and it is one of the few things a launchpad is uniquely positioned to provide.

**Fix:** Publish the reference WASM hash per release from CI into a checked-in manifest keyed by version. On the token page, read the deployed contract's WASM hash and render one of: Verified with the matching SoroPad version and a link to the source tag; Modified with the unrecognised hash shown and an explicit warning; or Unknown when the hash cannot be read. Combine it with `is_locked()` from #91 so holders can see both "runs audited code" and "code can no longer change", which together are what actually makes a token credible. Add the badge to `RecentLaunches` cards too.

---

## Summary

| Area                                   | Issues                              | Notes                                                                                                                                                             |
| -------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Regressions from closed issues         | 83, 84, 87, 89, 90, 91, 121         | #83 is the most serious: **every token deployed today has the wrong supply**, and the preflight display hides it. #89, #90, #91 were closed with no code written. |
| Deploy and initialization security     | 85, 86, 132                         | Two-transaction deploy allows admin theft (#85); `initialize` is callable again after `revoke_admin` (#86); #132 fixes both structurally.                         |
| Latent bricking bugs                   | 87, 88, 93, 99, 109                 | Each permanently disables a core function with no recovery path. #88 means normal one-to-four-year vesting cannot be created at all.                              |
| Contract storage and TTL               | 93, 94, 95, 108                     | Allowances in the wrong storage class; the "52 week" TTL is 6 days; instance TTL never extended.                                                                  |
| Contract guards and SEP-41 conformance | 96, 97, 98, 100, 102, 103, 106, 107 | `approve` missing pause and frozen guards; `burn_from` absent; event payloads diverge from the standard.                                                          |
| Admin lifecycle                        | 104, 105, 117                       | Admin changes emit no events; proposals cannot be cancelled and never expire.                                                                                     |
| Vesting correctness and trust          | 110, 111, 112, 114, 115, 116, 118   | Unchecked overflow (#110); pause blocks vested claims (#112); no solvency accounting (#115); not upgradeable (#116).                                              |
| Error handling and DX                  | 101, 123                            | No typed errors, so release builds report every failure identically; no generated bindings, which is the shared root cause of #83, #92, and #53.                  |
| Testing                                | 119, 124, 125, 128                  | The Playwright suite has zero specs and its workflow is commented out; `AdminPanel` and `useDeployToken` have no tests at all.                                    |
| Repo, deps, docs                       | 122, 126, 127, 129, 130, 131        | 20 npm advisories including 1 critical; 59 committed build artifacts; `docs/events.md` staleness caused a functional bug.                                         |
| Architecture                           | 120, 123                            | 2,351-line AdminPanel with a 14-branch dispatcher; hand-rolled ScVal encoding throughout.                                                                         |
| New features                           | 132, 133, 134, 135                  | Atomic deploy factory, admin vesting dashboard, Merkle airdrop, contract verification badge.                                                                      |

**Recommended order**

Twelve phases. Each is a sensible PR boundary, and the phases are ordered so that anything capable of losing user funds or bricking a contract is dealt with before anything cosmetic. `scripts/create_wave_issues.py --order recommended` reads the machine-readable version at the bottom of this section, so this prose and the issue creation order cannot drift apart.

1. **Phase 1, today: #83, #84.** Every deployment currently mints the wrong supply, and the preflight display hides it. Both live in the same two functions, so they are one small PR.
2. **Phase 2: #85, #86, #87, #88, #109, #93, #99.** Seven ways to lose a token, permanently brick one, or be unable to create a normal vesting grant. All contract-side and mostly small.
3. **Phase 3: #120 first, then #89, #90, #91.** The three closed-but-unimplemented UI issues. Split the 2,351-line AdminPanel before adding three more cards to it, not after.
4. **Phase 4: #121, #127, #128, #126.** Cheap, high-leverage hygiene. Each one closes a channel that has already let a regression through, and #121's ESLint rule and #128's audit steps are what stop this wave's findings from recurring.
5. **Phase 5: #92, #103, #104, #102, #129** as one coordinated PR, so the contract, `docs/events.md`, and the indexer land consistent. Landing these separately is how the current mismatch happened.
6. **Phase 6: #94, #95, #96, #97, #98, #100, #101.** Contract storage, TTL, and guard pass. Do #101's typed errors last in the phase so the other six can adopt them.
7. **Phase 7: #105, #106, #107, #108.** Admin lifecycle and the small contract cleanups.
8. **Phase 8: #123.** Generated bindings, once #120 has landed. Converts a whole category of runtime bug into compile errors, and would have prevented #83, #92, and #53.
9. **Phase 9: #124, #125, #119.** Testing. Deliberately after #123, because typed bindings make the tests worth writing shorter.
10. **Phase 10: #110 to #118.** Vesting correctness and trust.
11. **Phase 11: #122, #130, #131.** Remaining quality and documentation.
12. **Phase 12: #132 to #135.** New features, once the foundation is not actively on fire.

<!-- wave-order
phase-1-supply-correctness:   83, 84
phase-2-brick-prevention:     85, 86, 87, 88, 109, 93, 99
phase-3-missing-admin-ui:     120, 89, 90, 91
phase-4-regression-guards:    121, 127, 128, 126
phase-5-event-consistency:    92, 103, 104, 102, 129
phase-6-contract-guards:      94, 95, 96, 97, 98, 100, 101
phase-7-admin-lifecycle:      105, 106, 107, 108
phase-8-typed-bindings:       123
phase-9-testing:              124, 125, 119
phase-10-vesting:             110, 111, 112, 113, 114, 115, 116, 117, 118
phase-11-quality-docs:        122, 130, 131
phase-12-features:            132, 133, 134, 135
-->

## GitHub issue numbers

All 53 issues were created on 2026-07-27 (23:14:21Z to 23:16:27Z) with `create_wave_issues.py wave8.md --order recommended --apply`, in the phase order above rather than document order. Every title was verified against GitHub, with no gaps, duplicates, or skipped sections, so the mapping is simply creation position:

    GitHub number = 319 + (position in the wave-order plan - 1)

| Phase                      | Wave 8 sections, in creation order          | GitHub  | Status (re-verified 2026-07-30 at `eff5a9f`)                     |
| -------------------------- | ------------------------------------------- | ------- | ---------------------------------------------------------------- |
| phase-1-supply-correctness | 83, 84                                      | 319–320 | deploy path only — see wave 9 #395, #396                         |
| phase-2-brick-prevention   | 85, 86, 87, 88, 109, 93, 99                 | 321–327 | done                                                             |
| phase-3-missing-admin-ui   | 120, 89, 90, 91                             | 328–331 | done                                                             |
| phase-4-regression-guards  | 121, 127, 128, 126                          | 332–335 |  |
| phase-5-event-consistency  | 92, 103, 104, 102, 129                      | 336–340 | done (token only; vesting topics missing — wave 9 #408)          |
| phase-6-contract-guards    | 94, 95, 96, 97, 98, 100, 101                | 341–347 | 342, 347 left. **100 (#346) closed but never implemented** —     |
|                            |                                             |         | see wave 9 #397. 94 (#341) and 97 (#344) partial — #398, #399    |
| phase-7-admin-lifecycle    | 105, 106, 107, 108                          | 348–351 | not started                                                      |
| phase-8-typed-bindings     | 123                                         | 352     | not started                                                      |
| phase-9-testing            | 124, 125, 119                               | 353–355 | not started                                                      |
| phase-10-vesting           | 110, 111, 112, 113, 114, 115, 116, 117, 118 | 356–364 | not started                                                      |
| phase-11-quality-docs      | 122, 130, 131                               | 365–367 | 367 partial (topic list fixed, `LEDGERS_PER_DAY` not hoisted)    |
| phase-12-features          | 132, 133, 134, 135                          | 368–371 | not started                                                      |

**Wave 8 outcome.** 25 of 53 closed. Phases 1 to 6 are substantially complete and the merged work is largely good. Three exceptions are carried into Wave 9 (`wave9.md`): #346 was closed with no code written and its doc comment updated to claim the opposite, #341's TTL ceiling was taken from the `soroban-sdk` test-harness default rather than the network, and #319/#320's exact-scaling fix reached the deploy path but not the rest of the app, where three forms still hardcode `1e7`.

Lookup by wave number: 83→319 · 84→320 · 85→321 · 86→322 · 87→323 · 88→324 · 89→329 · 90→330 · 91→331 · 92→336 · 93→326 · 94→341 · 95→342 · 96→343 · 97→344 · 98→345 · 99→327 · 100→346 · 101→347 · 102→339 · 103→337 · 104→338 · 105→348 · 106→349 · 107→350 · 108→351 · 109→325 · 110→356 · 111→357 · 112→358 · 113→359 · 114→360 · 115→361 · 116→362 · 117→363 · 118→364 · 119→355 · 120→328 · 121→332 · 122→365 · 123→352 · 124→353 · 125→354 · 126→335 · 127→333 · 128→334 · 129→340 · 130→366 · 131→367 · 132→368 · 133→369 · 134→370 · 135→371

**A note on cross-references.** The `#83` to `#135` numbers above and throughout this document are _wave 8 section numbers_, not GitHub issue numbers; use the table above to convert. `create_wave_issues.py` rewrote intra-wave references to the non-linking form `[NN]` on creation so they do not autolink to unrelated old issues, and `--relink` converts them to real issue links now that every issue exists. References to issues below #83 (such as #252 or #305) are genuine GitHub issues from earlier waves and are left untouched.

**A note on process.** Seven issues in this wave exist because a closed issue's fix did not land, landed in only one of two code paths, or was never written. #83 is the costly one: it was fixed in the fee-estimation path and not in the path that broadcasts, and because the preflight showed the corrected number, the UI actively concealed it. Two process changes would catch most of this class. First, require that a PR closing an issue include a test that fails without the change, which #83, #87, #96, #106, and #124 would each have been caught by. Second, before closing a UI issue, grep for the contract method it was supposed to call; #89, #90, and #91 would each have taken about ten seconds to disprove.
