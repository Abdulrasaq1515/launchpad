# 📋 SoroPad Issue Tracker — Wave 7

_New features & solid improvements. Every issue below was confirmed by reading the current source on `master` (post Wave 6 partial merges — the deploy path #53–56 is fixed and the deploy wizard now collects authorization/compliance settings)._

**Context:** Wave 6 repaired the broken deploy path; the deploy wizard (`app/deploy/`) now collects `authorizationRequired`, `authorizationRevocable`, and `complianceNodeAddress`, and `useDeployToken` passes all 9 `initialize()` arguments. The gap this wave addresses: **the token & vesting contracts grew a full set of compliance, security, lifecycle, and circuit-breaker functions, but most of them are unreachable from the UI.** A token can now be *deployed* as "authorization required," yet there is no way to *authorize a single holder* from the app — making such tokens unusable. This wave closes that loop, adds holder-facing transparency, and fixes a real allowance-expiry bug.

Complexity levels:

- 🟢 **Trivial** (100 pts) — Small, well-defined
- 🟡 **Medium** (150 pts) — Standard features or involved bug fixes
- 🔴 **High** (200 pts) — Complex features, integrations, or architectural changes

> Grep used to confirm the UI gaps: `grep -rnoE "(pause|unpause|freeze_account|unfreeze_account|authorize_holder|revoke_authorization|set_max_balance_per_account|set_compliance_node|upgrade|extend_cliff|burn_admin)" app/ components/ lib/ hooks/` returns **no admin-panel matches** for any of them — only a deploy-step doc-string and a simulator label.

---

## Part 1: Post-Deploy Token Controls (contract functions with no UI)

### 10. AdminPanel: Holder Authorization management UI (regulated tokens are unusable)

🔴 **High** · `frontend` `admin` `compliance`

**Files:** `frontend/app/dashboard/[contractId]/components/AdminPanel.tsx`; `contracts/token/src/lib.rs` — `authorize_holder()` (line 300), `revoke_authorization()` (line 311), `is_authorized()` (line 328), `authorization_required()` (line 345), `authorization_revocable()` (line 353)

**Issue:** The deploy wizard (`app/deploy/steps/StepAdmin.tsx`) lets a user deploy a token with **Authorization Required** enabled, and `StepReview.tsx` (lines 105–115) even warns: _"You will need to call `authorize_holder` for each address before it can receive tokens."_ But `AdminPanel` has **no UI to call `authorize_holder`** — the methods it invokes are limited to `mint`, `clawback`, `propose_admin`, `accept_admin`, `update_contract_uri`, and `revoke_admin`. A grep of the whole frontend finds **zero** references to `authorize_holder` / `revoke_authorization` outside the deploy doc-string.

The result: a token deployed as "authorization required" is **bricked from the UI** — no holder can ever receive tokens because no holder can be authorized without raw Soroban CLI calls. This directly contradicts the deploy wizard, which actively encourages enabling the flag.

**Fix:** Add an **"Authorization"** card to `AdminPanel`, rendered only when `authorization_required()` returns `true` (fetched once on mount). Include:
- Address input + **Authorize** button → `authorize_holder(holder)`
- Address input + **Revoke** button → `revoke_authorization(holder)`, disabled when `authorization_revocable()` is `false` (tooltip: deployed as irrevocable)
- Address input + **Check** button → `is_authorized(holder)` showing ✅/❌

Reuse the existing `wrapRpcCall` + `submitSignedTransaction` + toast pattern. Surface `authorization_revocable` in the dashboard info cards.

---

### 11. AdminPanel: Emergency circuit breaker + per-account freeze controls

🔴 **High** · `frontend` `admin` `security`

**Files:** `frontend/app/dashboard/[contractId]/components/AdminPanel.tsx`; `contracts/token/src/lib.rs` — `pause()` (line 285), `unpause()` (line 292), `is_paused()` (line 612), `freeze_account()` (line 267), `unfreeze_account()` (line 276), `is_frozen()` (line 545)

**Issue:** The token contract implements a full **circuit breaker** (`pause`/`unpause`, halting `mint`/`burn`/`transfer`/`transfer_from`/`clawback`) and **per-account freeze** (`freeze_account`/`unfreeze_account`). None are reachable from the UI — a frontend grep finds no usage (only `lib/transactionSimulator.ts:34` references the word "pause" as a label). In an actual emergency (exploit, compliance order, key compromise) an admin has **no way to halt the token or quarantine a malicious holder** without raw RPC tooling, defeating the purpose of shipping these guards.

**Fix:** Add a **"Security Controls"** card to `AdminPanel`:
- A **Pause / Unpause** toggle that calls `is_paused()` on mount to show current state, requires a confirmation modal before pausing, and uses distinct copy for the dangerous (pause) vs. recovery (unpause) action.
- A **Freeze account** sub-form: address input + **Freeze**/**Unfreeze** buttons (`freeze_account` / `unfreeze_account`) and a **Check** button (`is_frozen`).
- When paused, render a prominent banner at the top of `AdminPanel`.

Gate the whole card behind the existing admin check. (Pairs with #13, which surfaces paused/frozen state to holders.)

---

### 12. AdminPanel: Whale-protection cap + compliance-node management

🟡 **Medium** · `frontend` `admin` `compliance`

**Files:** `frontend/app/dashboard/[contractId]/components/AdminPanel.tsx`; `contracts/token/src/lib.rs` — `set_max_balance_per_account()` (line 569), `max_balance_per_account()` (line 560), `set_compliance_node()` (line 597), `compliance_node()` (line 627)

**Issue:** Two admin setters exist with no UI:
- `set_max_balance_per_account(Option<u32>)` — a whale-protection ceiling expressed as a percentage (1–100) of total supply, enforced on `mint` and `transfer`.
- `set_compliance_node(Option<Address>)` — added in Wave 5 to update/clear the transfer-gating compliance contract after deployment.

Neither is callable from `AdminPanel`; both getters exist but aren't displayed. A deploy-time compliance node can never be corrected, and whale protection can never be tuned, through the app.

**Fix:** Add a **"Transfer Policy"** card to `AdminPanel`:
- **Whale Protection:** show current `max_balance_per_account()`; number input (1–100) + **Set Cap** → `set_max_balance_per_account(Some(p))`; **Disable** → `set_max_balance_per_account(None)`. Validate 1 ≤ p ≤ 100 client-side.
- **Compliance Node:** show current `compliance_node()` (with an `ExplorerLink`); contract-ID input + **Set Node** → `set_compliance_node(Some(addr))` (validate against `^C[A-Z2-7]{55}$`, the regex `DeployForm.tsx` uses); **Clear** → `set_compliance_node(None)`. Warn that a node not implementing `can_trade` will block all transfers (cross-ref Wave 6 #65).

---

### 13. AdminPanel: Contract upgrade UI (install a new WASM hash)

🟡 **Medium** · `frontend` `admin` `contracts`

**File:** `frontend/app/dashboard/[contractId]/components/AdminPanel.tsx`; `contracts/token/src/lib.rs` — `upgrade()` (line 371)

**Issue:** The token contract is upgradeable via `upgrade(new_wasm_hash: BytesN<32>)` (admin-only, refuses once `revoke_admin` has locked the contract). There is no UI to perform an upgrade — a grep finds no `upgrade` usage in any panel. Admins who need to ship a patched contract must drop to the Soroban CLI, and there is no in-app confirmation of the contract's current immutability state (`is_locked()`).

**Fix:** Add an **"Upgrade Contract"** action to `AdminPanel`, behind a clearly-labelled "Advanced / Danger" section:
- Show `is_locked()` first — if locked, disable the action and explain the contract is immutable.
- A 64-hex-char input for the new WASM hash (validate length/charset) + **Upgrade** button → `upgrade(hash)` via the existing sign/submit flow, behind a typed-confirmation modal ("type the symbol to confirm").
- Warn that upgrading replaces contract logic for all holders and should be reviewed/audited first.

---

### 14. AdminPanel: Permanent admin burn (`burn_admin`) is not exposed

🟢 **Trivial** · `frontend` `admin`

**File:** `frontend/app/dashboard/[contractId]/components/AdminPanel.tsx`; `contracts/token/src/lib.rs` — `burn_admin()` (line 156) vs `clawback()` (line 165)

**Issue:** The contract distinguishes two admin-initiated removals: `clawback(from, amount)` **confiscates** tokens into the admin balance (reversible — admin can return them), while `burn_admin(from, amount)` **permanently destroys** them (reducing supply, incrementing `total_burned`). `AdminPanel` exposes only `clawback`. An admin who needs to permanently remove tokens from a compromised account (and reflect it in supply) has no UI path and would have to clawback-then-burn in two steps, or use the CLI.

**Fix:** Add a **Burn (admin)** option to the existing clawback/burn card, calling `burn_admin(from, amount)` with the same decimal-scaling the panel already applies. Clearly differentiate the copy: "Confiscate to admin" (`clawback`) vs "Permanently destroy" (`burn_admin`).

---

## Part 2: Admin Lifecycle & Vesting

### 15. Token + frontend: expose a `pending_admin()` getter and surface the two-step transfer state

🟡 **Medium** · `contracts` `token` `frontend` `admin`

**Files:** `contracts/token/src/lib.rs` — `propose_admin()` (line 225) / `accept_admin()` (line 233), `DataKey::PendingAdmin` (line 16); `frontend/app/dashboard/[contractId]/components/AdminPanel.tsx`

**Issue:** The two-step admin transfer stores a `DataKey::PendingAdmin` entry on `propose_admin` and clears it on `accept_admin`/`revoke_admin`, but the contract exposes **no read-only getter** for it (the storage key is only ever written and removed internally). The UI has an "Are you the pending admin? Click below to accept" button (`AdminPanel.tsx:1031`) but **cannot tell the user whether a transfer is actually pending, or to whom** — both the outgoing admin and the proposed admin are flying blind. A proposer can't confirm their proposal landed; a recipient can't verify they're the named pending admin before signing `accept_admin`.

**Fix:**
1. Add `pub fn pending_admin(env: Env) -> Option<Address>` to the token contract (reads `DataKey::PendingAdmin`).
2. In `AdminPanel`, fetch it on mount and render a "Pending admin transfer → `<address>`" banner with a **Cancel** affordance for the current admin (calling `propose_admin` to overwrite, or a dedicated cancel if added) and only show the **Accept Admin** button when the connected wallet matches the pending address.

---

### 16. Vesting admin: no UI for `extend_cliff` or schedule `revoke`

🟡 **Medium** · `frontend` `vesting` `admin`

**Files:** `frontend/app/dashboard/[contractId]/components/AdminPanel.tsx`, `frontend/app/my-account/components/Vesting*.tsx`; `contracts/vesting/src/lib.rs` — `extend_cliff()` (line 364), `revoke()` (line 312)

**Issue:** `AdminPanel` can **create** vesting schedules (`create_schedule`, with correct `getLatestLedger() + days*17280` ledger math) but provides no way to **manage** them afterward. The vesting contract supports `extend_cliff(recipient, new_cliff, index)` (push back a cliff, e.g. for a renegotiated grant) and `revoke(recipient, index)` (cancel an unvested schedule and reclaim unvested tokens). A grep finds no `extend_cliff` usage anywhere and no vesting-`revoke` wiring in the admin UI. An admin who creates a schedule by mistake, or needs to revoke a departing employee's grant, has no in-app recourse.

**Fix:** Add a **"Manage Vesting"** section that, given a recipient (and schedule index — see #17), shows the current schedule and offers:
- **Extend Cliff** → `extend_cliff(recipient, new_cliff_ledger, Some(index))`, computing `new_cliff_ledger` from `getLatestLedger()` the same way `create_schedule` does.
- **Revoke** → `revoke(recipient, Some(index))`, behind a confirmation that explains unvested tokens return to the admin.

---

### 17. Vesting UI: surface multiple schedules per recipient (contract already supports it)

🟡 **Medium** · `frontend` `vesting`

**Files:** `frontend/components/forms/VestingForm.tsx`; `frontend/app/my-account/components/VestingCard.tsx`, `VestingLookup.tsx`; `frontend/app/claim/ClaimVesting.tsx`; `contracts/vesting/src/lib.rs` — `get_schedule_count()` (line 432); `release()` (273), `revoke()` (312), `get_schedule()` (437) all take `index: Option<u32>`

**Issue:** Wave 5 #40 was implemented: schedules are now keyed by `(Address, index)`, with `get_schedule_count(recipient)` and an optional `index` on `release`/`revoke`/`get_schedule`/`vested_amount`/`released_amount`. The `VestingScheduleInfo` type in `lib/stellar.ts` even carries `scheduleIndex?` and `scheduleCount?`. **But the UI ignores the index** — a grep of `VestingForm.tsx`/`VestingCard.tsx` for `index`/`scheduleCount`/`getScheduleCount` finds nothing. A recipient granted a second tranche (follow-on grant, re-vest after completion) can see and claim **only schedule 0**; later schedules are invisible and unclaimable.

**Fix:** In the claim and lookup views (`ClaimVesting`, `VestingLookup`, `VestingCard`), call `get_schedule_count(recipient)` and iterate `0..count`, calling `get_schedule(recipient, Some(i))` for each, rendering one card per schedule with its own progress bar and a **Claim** button passing `release(recipient, Some(i))`. Default to the latest schedule where a single value is needed, but never assume index 0.

---

## Part 3: Holder-Facing Transparency & Discovery

### 18. Public token page & dashboard: live "token state" status banner

🟡 **Medium** · `frontend` `ux` `transparency`

**Files:** `frontend/app/token/[contractId]/PublicTokenPage.tsx`; `frontend/app/dashboard/[contractId]/TokenDashboard.tsx`; `frontend/lib/stellar.ts` — `TokenInfo` interface (line 22), `fetchTokenInfo()`

**Issue:** A holder or prospective buyer viewing the public token page gets **no signal** about the token's operational state. A grep of `PublicTokenPage.tsx` for `pause|frozen|authoriz|locked|revoked` returns nothing, and `TokenInfo` (lines 22–33) carries only `name/symbol/decimals/supply/admin/maxSupply/contractUri/complianceNode` — it does **not** expose `is_paused()`, `is_locked()`, `authorization_required()`, or the viewer's own `is_frozen(me)` / `is_authorized(me)`. So a user can attempt a transfer of a paused token, or try to receive an authorization-gated token they're not approved for, and only discover the problem when the transaction reverts with an opaque error.

**Fix:**
1. Extend `TokenInfo` with `isPaused: boolean`, `isLocked: boolean`, and `authorizationRequired: boolean`, populated in `fetchTokenInfo` (each guarded so a missing method degrades to `false`).
2. On `PublicTokenPage` and the dashboard header, render a status banner: 🟠 **Paused**, 🔒 **Immutable** (admin revoked — show as a positive *trust* signal), 🛂 **Authorization required** (and, when connected, `is_authorized(connected)`), ❄️ **Account frozen** (when connected and `is_frozen(connected)`).
3. Disable the public page's transfer/claim CTAs when the relevant state makes them impossible, with inline helper text instead of a failed transaction.

---

### 19. Activity feed & indexer only decode 4 event types — admin/compliance actions are invisible

🟡 **Medium** · `frontend` `dashboard` `transparency`

**Files:** `frontend/lib/stellar.ts` (event decoding, lines ~790–920); `frontend/hooks/useContractEvents.ts` (lines 102–140)

**Issue:** The activity feed and recent-launches indexer subscribe to and decode only `transfer`, `mint`, `burn`, and `clawback` topics (`lib/stellar.ts:790–812`, `useContractEvents.ts:110–134` — anything not one of those is `continue`-skipped). The contracts emit many more meaningful events — `freeze`/`unfreeze`, `pause`/`unpause`, `set_admin`, `upgrade`, and (Wave 6) the soon-to-be-distinct compliance topics — none of which appear in the dashboard activity feed. An admin who pauses a token or freezes an account leaves **no visible audit trail in the app**, even though the events exist on-chain.

**Fix:** Extend the topic subscription list and the decode `switch` to recognise `freeze`/`unfreeze`, `pause`/`unpause`, `authorize`/`unauthorize`, `set_admin`, `revoke_admin`, and `upgrade`. Add corresponding `type` variants to `TokenActivityInfo`/the activity item union and render each with an appropriate icon and human label (e.g. "Account frozen", "Token paused", "Admin transferred"). Keep unknown topics gracefully labelled "Other" rather than dropped.

---

### 20. Landing page: look up / discover any token by contract ID

🟡 **Medium** · `frontend` `ux` `discovery`

**Files:** `frontend/app/page.tsx`, `frontend/app/components/RecentLaunches.tsx`

**Issue:** The landing page surfaces only `RecentLaunches` (tokens active in the last ~24h, capped at 12). There is **no search box** to look up an arbitrary token by contract ID — a grep of `page.tsx`/`RecentLaunches.tsx` for `search|browse|lookup` finds nothing. A user who has a token's contract ID (from a friend, an explorer, a tweet) cannot paste it anywhere on the home page to jump to its public page; they must hand-edit the `/token/<id>` URL. Tokens older than the lookback window are effectively undiscoverable in-app.

**Fix:** Add a search/lookup input to the landing hero: validate the pasted value against `^C[A-Z2-7]{55}$`, and on submit, route to `/token/<contractId>` (or call `fetchTokenInfo` first and show a preview card with name/symbol/supply, with a graceful "no token found at this address" state). Optionally let the same box accept a `G…` account address and route to that account's dashboard.

---

## Part 4: DeFi / Allowance Correctness

### 21. ApproveForm: allowance expiration ledger is hardcoded and (almost always) already expired

🟡 **Medium** · `frontend` `defi` `correctness`

**File:** `frontend/components/forms/ApproveForm.tsx` (lines 75, 117–118)

**Issue:** Both the simulate and submit paths compute the SEP-41 `expiration_ledger` from a hardcoded constant instead of the live ledger:

```ts
const ledger = 1000000 + parseInt(formData.expirationDays || "365") * 10800; // ~10.8s per ledger
// ...
const expirationLedger =
  1000000 + parseInt(formData.expirationDays || "365") * 10800; // ~10.8s per ledger
```

Two problems:
1. **The base `1_000_000` is in the past.** Testnet/mainnet ledger sequences are far beyond 1,000,000, so `1_000_000 + days × 10800` can resolve to a ledger that has *already closed* — Soroban rejects an allowance whose `expiration_ledger` is below the current ledger, so the approve either reverts or creates an instantly-expired allowance. The user sets "365 days" and gets nothing.
2. **`10800` ledgers/day assumes ~8s ledgers** (86400 / 10800 = 8). Soroban closes ledgers at ~5s, so even with a correct base the window is off by ~60%. Note that the vesting flow in `AdminPanel` already does this correctly (`getLatestLedger().sequence + days * 17280`); `ApproveForm` is the outlier.

**Fix:** Read the current ledger via `server.getLatestLedger()`, then `expirationLedger = currentLedger + days * 17280` (86400 / 5). Share a single helper so simulate and submit can't drift. As a follow-on, surface the resolved expiry as a human date + countdown in `AllowanceList.tsx` so users can see when each allowance lapses.

---

## Summary

| Area | Issues | Notes |
| --- | --- | --- |
| Post-deploy controls | 10, 11, 12, 13, 14 | Contract has a full compliance/security/upgrade surface; almost **none** of it is reachable from `AdminPanel`. #10 makes regulated tokens usable; #11 is the emergency stop. |
| Admin lifecycle & vesting | 15, 16, 17 | Two-step admin transfer is invisible (#15); vesting schedules can't be managed (#16) and only schedule 0 is ever shown (#17). |
| Transparency & discovery | 18, 19, 20 | Holders get no signal a token is paused/frozen/gated (#18); admin actions leave no in-app audit trail (#19); no way to look up a token by ID (#20). |
| DeFi correctness | 21 | Approve expiry is hardcoded to a past ledger → allowances expire instantly. |

**Recommended order:** 10 → 11 (regulated/emergency tokens are currently un-administrable from the app), then 18 (holder-side visibility for those states), then 21 (a live correctness bug), then 15/16/17 (admin lifecycle + vesting), then 12/13/14/19/20.
