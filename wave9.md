# 📋 SoroPad Issue Tracker — Wave 9

_Verified against `master` at merge commit `eff5a9f` (`origin/master` `acc815f`). Every issue below was confirmed by reading the merged source, querying the live testnet and mainnet RPC for network settings, and re-grepping each closed Wave 8 issue rather than trusting its PR title._

**Context:** Wave 8 raised 53 issues (#319 to #371). Twenty-five are closed and 28 remain open. The merged work is, on the whole, good: the AdminPanel monolith is genuinely split, allowances genuinely moved to temporary storage, the event topic list genuinely matches the contract now, and the dependency tree is genuinely clean. This wave does not re-litigate any of that.

It starts from four things the merge left behind:

1. **One closed issue was never implemented, and its documentation was updated to claim it was.** #346 asked for freeze to block receiving as well as sending. `_is_frozen` is still checked only on the sender, at all six call sites, but the contract's header comment now reads "freeze_account / unfreeze_account (blacklist: no send or receive)". The doc is now wrong in a way that will stop the next reader from checking.
2. **The amount-scaling fix landed on the deploy path and nowhere else.** #319 and #320 asked for exact integer scaling. `useDeployToken` now calls a shared `toBaseUnits` helper, which is what was asked, but the helper's first line is `Number(display)`. Meanwhile `MintForm`, `TransferForm` and `BurnForm` still hardcode `1e7` and ignore the token's decimals entirely, and the new `adminActions.ts` introduced a second float helper of its own. There are now five scaling implementations where Wave 8 found two.
3. **A network constant was copied from the test harness.** Both contracts hardcode `MAX_ENTRY_TTL_LEDGERS = 6_312_000`. That is the `soroban-sdk` test-environment default (`soroban-sdk-21.7.7/src/env.rs:514`), not the network value. The live setting is **3,110,400 on both testnet and mainnet** (confirmed by `getLedgerEntries` against the `STATE_ARCHIVAL` config setting on 2026-07-30). Because the host silently clamps persistent entries, this does not break anything outright; because the host *errors* on temporary entries, and #326 moved allowances to temporary storage, it breaks `transfer_from` and `burn_from` on exactly the allowance the app's own default creates.
4. **Three areas no wave has audited.** The server-rendered token page and OG card, the provider tree, and `lib/recentTokens.ts`.

Complexity levels:

- 🟢 **Trivial** (100 pts) — Small, well-defined
- 🟡 **Medium** (150 pts) — Standard features or involved bug fixes
- 🔴 **High** (200 pts) — Complex features, integrations, or architectural changes

> Issues re-opened because a closed issue's fix did not land, or landed in only one of several code paths, are flagged **(regression of #N)**.

**Not in this wave, deliberately.** Four still-open Wave 8 issues have partly-stale descriptions and should be updated in place rather than re-filed: **#333** (now 62 tracked build artifacts, not 59), **#334** (`cargo audit` and `npm audit` landed; clippy, a coverage floor, `stellar contract optimize` and release-mode tests did not), **#347** (`TokenError` now exists with 3 compliance variants against 53 `assert!` and 5 `panic!` sites remaining), and **#367** (`LEDGERS_PER_DAY` exists but is declared privately in `adminActions.ts:34` and duplicated in its own test; raw `17280` survives in `ApproveForm.tsx:70` and `recentTokens.ts:18`).

---

## Part 1: Wave 8 fixes that did not fully land

### 136. Token: freeze is still send-only, and the header comment now claims otherwise (regression of #346)

🔴 **High** · `contracts` `token` `compliance` `docs`

**Files:** `contracts/token/src/lib.rs` line 113 (header comment); `_is_frozen` call sites at 226, 305, 498, 539, 573, 625; `_mint`; `_transfer`

**Issue:** #346 is closed. The receiving-side check it asked for does not exist. `grep -n "_is_frozen" contracts/token/src/lib.rs` returns six call sites and one definition, and every one of the six passes `&from`:

```rust
assert!(!Self::_is_frozen(&env, &from), "account is frozen");
```

Those six are `burn` (226), `burn_self` (305), `transfer` (498), `approve` (539), `transfer_from` (573) and `burn_from` (625). Neither `_transfer` nor `_mint` checks `to` anywhere in its body.

What did change is the documentation. Line 113 now reads:

```rust
/// - #1  freeze_account / unfreeze_account (blacklist: no send or receive)
```

So the contract now states the blacklist semantic it does not implement. That is worse than the original bug: Wave 8 found this by reading the code against a doc comment that honestly said "preventing it from sending tokens" (the old line 266). A reader checking the header now gets a false confirmation.

The behaviour is unchanged and still wrong for the stated purpose. A wallet frozen because it is sanctioned keeps receiving from third parties, and the admin can still mint into it. Balances accumulate in an address the issuer has formally declared off limits, which is the specific reporting problem freezing exists to prevent.

**Fix:** Pick one and make code, doc and UI agree. Either add `assert!(!Self::_is_frozen(env, to), "account is frozen")` inside `_transfer` and `_mint`, with a deliberate documented bypass for `clawback` so the admin can still recover funds, or rename to `freeze_outbound` and correct line 113 and the `SecurityCard` copy. Add a test that freezes an account and asserts an inbound transfer fails (or succeeds, per the decision), because the absence of that test is why this closed empty.

---

### 137. Frontend: `toBaseUnits` is floating point, so high-decimal tokens mint the wrong supply (regression of #320)

🔴 **High** · `frontend` `deploy` `correctness`

**Files:** `frontend/lib/utils.ts` lines 14 to 18; `frontend/lib/__tests__/utils.test.ts`; `frontend/app/hooks/useDeployToken.ts` line 284; `frontend/app/deploy/DeployForm.tsx` line 65

**Issue:** The plumbing #320 asked for is correct. The schema types supply as a string (`initialSupply: integerString`), the value stays a string through the form, and `useDeployToken` routes through one shared helper rather than scaling inline. Then the helper throws the guarantee away on its first line:

```ts
export function toBaseUnits(display: number | string, decimals: number): bigint {
  const amount = typeof display === "string" ? Number(display) : display;
  if (isNaN(amount)) return 0n;
  return BigInt(Math.round(amount * (10 ** decimals)));
}
```

`Number(display)` puts the value back into an IEEE-754 double before the multiply, which is precisely what #253 and then #320 were raised to stop. Wrapping the result in `BigInt` does not recover precision that is already gone.

The multiply is exact only while `supply * 5^decimals < 2^53`, so the safe ceiling collapses as decimals rise:

| decimals | largest exactly-scaled supply |
| -------- | ----------------------------- |
| 7        | 115,292,150,460               |
| 9        | 4,611,686,018                 |
| 12       | 36,893,488                    |
| 18       | **2,361**                     |

The contract permits `decimal <= 18` and the deploy wizard lets the user choose it. Measured against the current helper:

- 1,000,000 supply at 18 decimals mints `999999999999999983222784` instead of `1000000000000000000000000` — **16,777,216 base units short**.
- 123,456,789,012,345 supply at 7 decimals is **41,600 base units short**.

The reason this passed review is the test. `lib/__tests__/utils.test.ts` covers 1,000,000 at 7 decimals and 0.1 at 7 decimals — small, round values that survive the float exactly — including the "assert the ScVal built for a 1,000,000 / 7-decimal token" case that #319 specifically asked for. Every assertion passes against the buggy helper, so the test gives false confidence rather than coverage.

**Fix:** Do the scaling with string arithmetic and never touch `Number`: split on `.`, reject more than `decimals` fraction digits, right-pad the fraction to `decimals`, concatenate, and `BigInt` the result. Add the two failing cases above as regression tests, because anything smaller passes either way.

---

### 138. Frontend: five amount-scaling implementations, three of them hardcoding 7 decimals

🔴 **High** · `frontend` `correctness`

**Files:** `frontend/components/forms/MintForm.tsx` line 78; `TransferForm.tsx` line 67; `BurnForm.tsx` line 66; `frontend/app/dashboard/[contractId]/components/admin/adminActions.ts` lines 111 to 113; `frontend/app/dashboard/[contractId]/components/TransferPanel.tsx` line 200; `frontend/app/my-account/components/OutgoingAllowancesSection.tsx` line 70; `frontend/app/dashboard/[contractId]/components/admin/MintCard.tsx` line 195

**Issue:** Wave 8 found two scaling paths that disagreed. There are now five, and the worst three ignore the token's decimals altogether:

```ts
// MintForm.tsx:78, TransferForm.tsx:67, BurnForm.tsx:66 — identical
BigInt(Math.floor(parseFloat(formData.amount) * 1e7)),
```

`1e7` is hardcoded. These three forms never read `decimals`. On a 6-decimal token every mint, transfer and burn is inflated 10x; on an 18-decimal token it is short by a factor of 10^11. The token contract accepts any `decimal <= 18`, and the deploy wizard offers the choice, so this is reachable by design rather than by accident.

The new admin code introduced a second float helper instead of importing the shared one:

```ts
// adminActions.ts:111 — parallel to lib/utils.ts:14, same bug, different name
export function scaleAmount(amount: string, decimals: number): bigint {
  return BigInt(Math.round(parseFloat(amount) * 10 ** decimals));
}
```

Every one of the 14 registered admin actions routes through `scaleAmount`, so the AdminPanel split inherited #137's precision loss wholesale. `TransferPanel.tsx:200` is a third inline copy (`Math.round(parseFloat(data.amount) * 10 ** tokenDecimals)`). `OutgoingAllowancesSection.tsx:70` does the inverse in floating point for display (`Number(amount) / 10 ** tokenInfo.decimals`), and `MintCard.tsx:195` sums a batch-mint total with `acc + Number(curr.amount)`.

This is the same drift channel that produced #83 and, before it, #29 and #54. Five hand-written copies of one conversion is why it keeps recurring.

**Fix:** Land #137's exact helper first, export it as the only scaling primitive along with its inverse `fromBaseUnits`, then delete the other four implementations and thread real `decimals` into the three forms. Add a lint rule or a unit test that fails on a literal `1e7` or `10 **` in `app/` and `components/`, since this is the fourth wave to find hand-rolled scaling.

---

### 139. Contracts: the TTL ceiling was copied from the SDK test harness, so balances live 180 days, not a year (regression of #341)

🟡 **Medium** · `contracts` `token` `vesting`

**Files:** `contracts/token/src/lib.rs` lines 12 to 31, test at 1275; `contracts/vesting/src/lib.rs` lines 13 to 26, test at 780; unclamped `extend_ttl` sites at token 216, 262, 265, 294, 511, 514, 612, 615 and vesting 689

**Issue:** #341 correctly replaced the copy-pasted "52 weeks" expression with one named constant. The constant's ceiling is wrong:

```rust
/// ... (`max_entry_ttl` in the network config; 6,312,000 ledgers on mainnet).
const MAX_ENTRY_TTL_LEDGERS: u32 = 6_312_000;

const TTL_LEDGERS: u32 = {
    const YEAR_LEDGERS: u64 = 365 * 24 * 60 * 60 / 5;   // 6,307,200
    if YEAR_LEDGERS < MAX_ENTRY_TTL_LEDGERS as u64 { YEAR_LEDGERS as u32 }
    else { MAX_ENTRY_TTL_LEDGERS }
};
```

6,312,000 is not the mainnet value. It is the `soroban-sdk` test-environment default, at `soroban-sdk-21.7.7/src/env.rs:514`:

```rust
max_entry_ttl: 6_312_000,
```

The live setting, read from the `STATE_ARCHIVAL` config-setting ledger entry on 2026-07-30, is **3,110,400 on both testnet and mainnet** (`min_persistent_ttl` differs between them — 120,960 on testnet, 2,073,600 on mainnet — but `max_entry_ttl` does not). So `TTL_LEDGERS` resolves to 6,307,200, which is 2.03x what either network will honour, and the clamp that was added to guard against exactly this can never fire.

This does not brick anything, and it is important to be precise about why. `soroban-env-host` treats the two durabilities differently (`storage.rs:521-537`): for **persistent** entries it silently lowers `new_live_until` to the network maximum, and only for **temporary** entries does it return `Storage/InvalidAction`. All eight unclamped token sites and the one vesting site write persistent entries, so they are quietly clamped.

The real consequences are:

- Balance entries live about **180 days**, not the "about a year" the constant's doc comment promises. The team's mental model of the archival window is off by half, on a launchpad where retail holders buy once and hold.
- `test_ttl_ledgers_is_about_one_year` (`lib.rs:1275`) asserts `days == 365` and never compares the constant to `env.storage().max_ttl()`, so it locks in the wrong figure and would fail if someone corrected it.
- It is the root cause of #140, which is a hard failure.

Note the contract already reads the value at runtime in two places (`token lib.rs:558`, `vesting lib.rs:644`), so the correct pattern is present in both files and simply not used at the other nine sites.

**Fix:** Delete `MAX_ENTRY_TTL_LEDGERS` and clamp every site with `env.storage().max_ttl()` at call time, keeping `TTL_LEDGERS` only as a desired-duration hint. Rewrite the doc comment to say the effective window is whatever the network allows, currently about 180 days, and that holders relying on longer must interact within it. Replace the test with one asserting `TTL_LEDGERS >= env.storage().max_ttl()` so the clamp is what is exercised. Note the test harness will keep reporting 6,312,000, so any test that hardcodes a network figure will mislead.

---

### 140. Token: `transfer_from` and `burn_from` extend a temporary entry past the network TTL ceiling, so partial spends revert (regression of #344)

🔴 **High** · `contracts` `token` `defi`

**Files:** `contracts/token/src/lib.rs` lines 594 to 599 (`transfer_from`) and 644 to 649 (`burn_from`); compare line 558 (`approve`)

**Issue:** #344 added the clamp to `approve` and to nowhere else. `approve` is correct:

```rust
// lib.rs:558
let ttl_ledgers = (expiration_ledger - current_ledger).min(env.storage().max_ttl());
```

`transfer_from` and `burn_from`, which rewrite the same entry when an allowance is partially spent, are not:

```rust
// lib.rs:594 (transfer_from) and 644 (burn_from), identical
let ttl_ledgers = expiration_ledger.saturating_sub(current_ledger);
if ttl_ledgers > 0 {
    env.storage().temporary().extend_ttl(&key, ttl_ledgers, ttl_ledgers);
}
```

Allowances are **temporary** entries since #326, and temporary is the durability for which the host refuses to clamp (`soroban-env-host-21.2.1/src/storage.rs:527-535`, "for `Temporary` entries TTL has to be exact"). It returns `Storage/InvalidAction: trying to extend past max live_until ledger`.

So for any allowance whose `expiration_ledger` is more than `max_entry_ttl` (3,110,400) ledgers out:

- `approve` succeeds, because it clamps the TTL. Note it stores the unclamped `expiration_ledger` in the `AllowanceValue` struct, which is what the two functions above then read back.
- A **partial** `transfer_from` or `burn_from` reverts.
- A **full** spend succeeds, because `remaining == 0` takes the `remove` branch at line 601 and never calls `extend_ttl`.

A spender who is approved for 1,000 and takes 400 fails; the same spender taking all 1,000 succeeds. That reads as an intermittent, amount-dependent failure with an opaque host error, which is close to undiagnosable from the UI, and #347 means the error string is stripped in release anyway.

This is reachable through the app's default path, not an edge case: `ApproveForm` defaults to a 365-day expiry, which is 6,307,200 ledgers. See #151.

**Fix:** Apply `.min(env.storage().max_ttl())` at both sites. Better, clamp `expiration_ledger` itself in `approve` before storing it, so the struct never carries a value the network cannot honour and all three call sites agree by construction. Add a test that approves past the maximum and asserts a partial `transfer_from` succeeds; set the test ledger's `max_entry_ttl` to the real 3,110,400 with `env.ledger().set_max_entry_ttl(...)`, because the harness default of 6,312,000 hides this entirely.

---

## Part 2: Token contract policy and lifecycle

### 141. Token: the two authorization flags can never be changed after deploy

🟡 **Medium** · `contracts` `token` `compliance`

**Files:** `contracts/token/src/lib.rs` lines 172 and 175 (only writes); getters at 422, 438, 454, 462

**Issue:** `AuthorizationRequired` and `AuthorizationRevocable` are written exactly once, inside `initialize`, and there is no setter for either. Every other policy control on the contract can be changed by the admin: `set_max_balance_per_account`, `set_compliance_node`, `pause` / `unpause`, `update_contract_uri`, and `upgrade`.

So the two flags that govern who may hold the token are the only permanently frozen policy, decided in a deploy wizard step before the issuer has any holders. A token that later needs transfer gating for a regulated raise cannot enable it. A token that used gating for a private round and now wants to trade freely cannot turn it off; the authorization requirement applies to every future recipient forever. In both cases the only escape is `upgrade()` with a modified contract, which forfeits the immutability story the product sells, or a full migration.

`authorization_revocable` compounds it: an issuer who deploys with `revocable = false` can never grant themselves the ability to revoke, and one who deploys `revocable = true` can never give up that power to reassure holders.

**Fix:** Add admin-gated `set_authorization_required(bool)` and a one-way `renounce_authorization_revocable()`, both emitting events and both blocked by `_require_not_locked`. Make the revocable flag one-way only (true to false), since that direction only ever reduces admin power and is safe to allow. Until it ships, say plainly in `StepAdmin.tsx` that these two choices are permanent, which the current copy does not.

---

### 142. Token: the compliance node is asked about the token's own address on every mint

🟡 **Medium** · `contracts` `token` `compliance`

**Files:** `contracts/token/src/lib.rs` lines 989 to 992 (`_check_compliance_issue`), called from 208 (`mint`) and 289 (`mint_batch`)

**Issue:** #327 correctly extended compliance enforcement to the issuance paths. The address it passes as the sender is the token contract itself:

```rust
/// Compliance check for issuance. Minting has no sending holder, so the
/// token contract itself stands in as `from` and the recipient is `to`.
fn _check_compliance_issue(env: &Env, to: &Address) {
    let issuer = env.current_contract_address();
    Self::_check_compliance(env, &issuer, to);
}
```

The reasoning is sound but the consequence was not tested. The obvious way to write a compliance node is an allowlist of KYC-verified holders: `can_trade(from, to)` returns `from ∈ allowlist && to ∈ allowlist`. The token contract's own address is not a KYC'd holder and will never be in that allowlist, so such a node returns `false` for every mint.

Combined with #327's deliberate fail-closed policy, that means **setting a strict compliance node blocks all issuance**, including `mint_batch` for an airdrop, with `TokenError::ComplianceRejected`. The admin's recovery is to clear the node, mint, and re-set it, which defeats the point of the gate, or to special-case the token address in the node, which every integrator must discover independently.

No test exercises this. The `MockComplianceNode` added by #327 has configurable allow and deny behaviour but nothing models an allowlist, so the `from`-side semantic was never examined.

**Fix:** Decide whether issuance is in policy scope and encode the answer in the interface rather than in a convention. The cleanest version is a separate `can_issue(to: Address) -> bool` on `ComplianceNodeInterface`, defaulting to `can_trade(to, to)` for nodes that do not implement it, so an allowlist node answers about the recipient only. Document the chosen contract for node authors in `docs/`, and add an allowlist-style mock to the test suite alongside the existing allow/deny one.

---

### 143. Token: the whale cap silently stops being enforced once admin is revoked

🟡 **Medium** · `contracts` `token` `transparency`

**Files:** `contracts/token/src/lib.rs` `_enforce_max_balance_per_account`; getter `max_balance_per_account`; `frontend/app/dashboard/[contractId]/components/admin/PolicyCard.tsx`; `frontend/components/TokenStatusBanner.tsx`

**Issue:** #323 fixed a real bricking bug the right way. The helper now reads the admin as an `Option` and gives up when it is absent:

```rust
let Some(admin) = env.storage().instance().get::<DataKey, Address>(&DataKey::Admin) else {
    return; // contract is locked; cap no longer enforced
};
```

That was the correct choice between the two options Wave 8 offered, and transfers survive `revoke_admin` as promised. But the consequence is not surfaced anywhere. `max_balance_per_account()` keeps returning the stored percentage after the cap has stopped applying, so the getter reports a limit that is not enforced. `PolicyCard` presents the cap as a standing rule, and `TokenStatusBanner` frames immutability purely as a positive trust signal.

The result is a specific false assurance, aimed at the holders least able to verify it. An issuer sets a 5% whale cap, then revokes admin to make the token trustless — the two actions a cautious project takes together. Every surface then tells holders the token is immutable *and* whale-capped, when revoking admin is exactly what turned the cap off. A large holder can accumulate without limit while the dashboard says they cannot.

**Fix:** Make the getter honest: return `None` (or the stored value plus an `enforced: bool`) once `Locked` is set, and say so in the doc comment, which currently describes only the storage read. Then show it: `PolicyCard` should render the cap as inactive with the reason, and `TokenStatusBanner`'s immutability row should name the trade-off rather than presenting it as unambiguously good. Add a test asserting a non-admin can exceed the cap after `revoke_admin`, which documents the semantic as intended rather than accidental.

---

### 144. Token: `_mint` re-introduces a hard `DataKey::Admin` unwrap

🟢 **Trivial** · `contracts` `token` `cleanup`

**File:** `contracts/token/src/lib.rs`, end of `_mint`

**Issue:** #339 aligned the mint event with SEP-41's `("mint", admin, to)` topics, which requires reading the admin. It reads it with `expect`:

```rust
let admin: Address = env
    .storage()
    .instance()
    .get(&DataKey::Admin)
    .expect("admin revoked");
env.events()
    .publish((symbol_short!("mint"), admin, to.clone()), amount);
```

This is the same pattern, on the same storage key, in the same file, that #323 had just removed from `_enforce_max_balance_per_account` — and `_mint` sits on the hot path that #87 was about.

It is not exploitable today, and the issue should not pretend otherwise: every caller of `_mint` is either `_require_admin`-gated (`mint`, `mint_batch`) or runs inside `initialize` before any revoke is possible, so `DataKey::Admin` is always present when this line executes. The problem is that the invariant is implicit and undocumented, so it holds only until someone adds a mint path that does not require an admin — a faucet, a bonding curve, a factory callback, or the airdrop module in open issue #370, which is the likeliest of the four.

**Fix:** Read it as `Option<Address>` and fall back to `env.current_contract_address()` for the topic when the admin is gone, matching how #327 already treats the issuer in `_check_compliance_issue`. One line, and it removes a footgun from the path most likely to be extended next.

---

## Part 3: Public surface and frontend correctness

### 145. Server-rendered token pages and social cards are hardcoded to testnet

🔴 **High** · `frontend` `ssr` `correctness`

**Files:** `frontend/app/token/[contractId]/page.tsx` lines 17 and 32; `frontend/app/api/og/token/[contractId]/route.tsx` line 13; `frontend/app/api/token/[contractId]/metadata/route.ts` line 11

**Issue:** Three server-side entry points pin the network to testnet. In `generateMetadata`:

```tsx
// page.tsx:17
const validation = await validateTokenContract(contractId, NETWORKS.testnet);

if (!validation.isValid) {
  return {
    title: `Invalid Token Contract — ${contractId.slice(0, 8)}... | SoroPad`,
    ...
```

and again at line 32 for `fetchTokenInfo`. The OG image route does the same at line 13.

A mainnet contract is not found on testnet, so `validateTokenContract` reports it invalid and the page's title, description and social preview all announce **"Invalid Token Contract"** and "does not appear to be a valid SEP-41 token contract" for a perfectly healthy mainnet token. The OG route's `catch` then renders the generic "Token Details" fallback card.

The bug is invisible in the app. `PublicTokenPage` is a client component that reads the network from `useNetwork()`, so the visible page renders correctly while the metadata wrapped around it says the opposite. It only shows up where it does the most damage: in the link preview when an issuer shares their mainnet token on X, Telegram or Discord, which is the single highest-leverage moment in a launch. `NEXT_PUBLIC_BASE_URL` and `metadataBase` are wired up correctly, so everything about the sharing path works except the network.

**Fix:** Carry the network in the URL rather than inferring it — either `/token/[network]/[contractId]` or a `?network=` param that `generateMetadata`, the OG route and `PublicTokenPage` all read, defaulting to the configured default network rather than a hardcoded literal. Thread it through `validateTokenContract` and `fetchTokenInfo`, which already take a `NetworkConfig`. If a contract resolves on neither network, keep the current invalid-contract metadata, which is right in that case.

---

### 146. The SSR and API token routes validate nothing, cache nothing, and one has no callers

🟡 **Medium** · `frontend` `api` `hygiene`

**Files:** `frontend/app/token/[contractId]/page.tsx` line 13; `frontend/app/api/og/token/[contractId]/route.tsx` line 12; `frontend/app/api/token/[contractId]/metadata/route.ts` (whole file)

**Issue:** Three problems in the same small surface.

**No validation.** None of the three checks `contractId` against `^C[A-Z2-7]{55}$` before handing it to `fetchTokenInfo`, even though the landing-page lookup added by #306 already validates exactly that pattern client-side. Any string reaches the RPC layer.

**No caching.** `page.tsx` sets no `revalidate` and the OG route sets no cache headers, so every request is one to three uncached RPC round trips. `/token/<anything>` is a public, crawlable, unbounded URL space, so a crawler or a trivial script drives sustained load against the app's RPC endpoint and the OG route additionally renders an image per hit. `app/api/tokens/recent/route.ts` already establishes the pattern with a 60-second in-memory cache; these three did not follow it.

**One route is dead.** `app/api/token/[contractId]/metadata/route.ts` has no consumers anywhere: `grep -rn "api/token" app components lib hooks` matches only the OG route path in `page.tsx` and `api/tokens/recent` in `RecentLaunches.tsx`. It duplicates `fetchTokenInfo` behind an HTTP hop, returns 404 for every error class including transient RPC failures, and carries the same testnet hardcode as #145.

**Fix:** Add a shared `isValidContractId` guard (extract the regex the landing page already uses) and reject early with 400 before touching RPC. Give `page.tsx` a `revalidate` and the OG route `Cache-Control: public, s-maxage=..., stale-while-revalidate=...`, sized to match the 60-second precedent. Delete the metadata route; if a public metadata API is wanted later it should be designed with a network parameter and caching from the start.

---

### 147. `<html lang>` never follows the selected locale

🟡 **Medium** · `frontend` `i18n` `a11y`

**Files:** `frontend/app/layout.tsx` line 46; `frontend/app/providers/LocaleProvider.tsx`

**Issue:** The root layout is a server component and hardcodes the language:

```tsx
<html lang="en">
```

`LocaleProvider` is a client component that holds the locale and swaps the message bundle, but it never touches the document element — `grep -n "documentElement" app/providers/LocaleProvider.tsx` returns nothing. So `lang` stays `en` for all four supported locales.

The visible text changes and the document's declared language does not, which breaks the consumers that rely on it rather than on the pixels: screen readers keep using English pronunciation rules and voice for Spanish, French and Chinese text; browser "translate this page" offers to translate Spanish into English and declines to help a Spanish reader; and hyphenation, quotation marks and font fallback all resolve against the wrong language. For Chinese the font-fallback consequence is the most visible.

This is a small fix that changes who can actually use the four translation files. It pairs with open issue #365, which covers the 7-of-101 component coverage; this one is worth doing independently and first, because it is two lines and benefits every string already translated.

**Fix:** Set `document.documentElement.lang = locale` in a `useEffect` in `LocaleProvider` alongside the existing locale state, and set `dir` at the same time so a future RTL locale does not need a second pass. Assert it in the existing provider test.

---

### 148. The activity feed ignores every vesting event

🟡 **Medium** · `frontend` `dashboard` `transparency`

**Files:** `frontend/lib/stellar.ts` lines 870 to 890 (`TRACKED_EVENT_TOPICS`); `frontend/hooks/useContractEvents.ts` line 20; `contracts/vesting/src/lib.rs` publish sites at 95, 108, 121, 189, 279, 288, 332, 400, 438, 469, 476, 563

**Issue:** #336 fixed the topic list properly. It now contains the token contract's 19 topics and they match the contract's emitted set exactly, and the duplicate list in `useContractEvents.ts` was replaced with an import. That part is done well.

It covers only the token contract. The vesting contract emits eleven distinct topics and the list contains none of them: `create`, `batch`, `release`, `revoke`, `clf_ext`, `prune`, `prop_adm`, `acc_adm`, plus `init`, `pause` and `unpause`.

So no vesting activity is ever visible: not a schedule being created, not a recipient claiming, not an admin revoking a grant, not a cliff being extended. For a product whose headline feature is vesting, and where revocation is the action a recipient most needs to see, the activity feed is silent on all of it. Recipients have no audit trail for the contract that holds their tokens.

There is a complication worth designing around rather than discovering later: `init`, `pause` and `unpause` are emitted by **both** contracts with identical topic tuples. Topic-only filtering cannot tell them apart, so the decoder has to disambiguate on the emitting contract ID.

**Fix:** Add a `TRACKED_VESTING_EVENT_TOPICS` export beside the existing one, subscribe to it against the vesting contract's address, and key the decode on `(contractId, topic)` rather than topic alone so the three shared names resolve correctly. Extend `TokenActivityType` with the vesting cases and give each an icon and label in `ActivityFeed.tsx`, following the pattern #305 established. The vesting contract already has a checked-in topic fixture and a drift test (see #155), so the list has a source of truth to derive from.

---

### 149. `VestingProgress` re-implements the contract's vesting formula in the browser

🟡 **Medium** · `frontend` `vesting` `correctness`

**File:** `frontend/app/dashboard/[contractId]/VestingProgress.tsx` lines 174 to 183

**Issue:** The component recomputes vesting client-side, and says so:

```ts
// Replicate the contract's cliff + linear vesting formula
let vestedBig: bigint;
if (currentLedger < schedule.cliffLedger) {
  vestedBig = BigInt(0);
} else if (currentLedger >= schedule.endLedger) {
  vestedBig = totalBig;
} else {
  const elapsed = BigInt(currentLedger - schedule.cliffLedger);
  const duration = BigInt(schedule.endLedger - schedule.cliffLedger);
  vestedBig = (totalBig * elapsed) / duration;
}
```

The arithmetic is currently faithful to `_vested_amount`, and it is done in `BigInt`, so this is not a live wrong-number bug. It is a duplicated invariant across the trust boundary, and it is already scheduled to break: two open issues change the on-chain formula. #356 replaces the unchecked `total_amount * elapsed` with checked or restructured arithmetic, and #357 changes what `extend_cliff` does to the curve. Neither would touch this copy, and nothing would fail if they diverged — the UI would simply state a number the contract disagrees with, on the screen a recipient uses to decide whether they have been paid correctly.

The contract already exposes `vested_amount(recipient, index)` as a read-only getter, so the duplication buys nothing but a saved RPC call.

**Fix:** Read `vested_amount()` from the contract and delete the replica, keeping the local computation only for the between-poll timeline animation and labelling it as an estimate. Do this after open #360 lands the aggregate getters, so the fetch is one call for all of a recipient's schedules rather than N. If a client-side projection is genuinely wanted for the "next unlock" preview, extract it into `lib/vesting.ts` next to the other schedule helpers and unit-test it against fixtures generated from the contract tests, so a divergence fails CI instead of shipping.

---

### 150. Allowance revocation hardcodes `expiration_ledger: 1000` in two places

🟡 **Medium** · `frontend` `defi` `cleanup`

**Files:** `frontend/components/AllowanceManager.tsx` line 123; `frontend/lib/transactionSimulator.ts` lines 507 and 526 to 527

**Issue:** Revoking an allowance passes a fixed, long-past ledger:

```ts
// AllowanceManager.tsx:123
expirationLedger: 1000,
```

```ts
// transactionSimulator.ts:507, 526-527
// Revoke is implemented as approve with 0 amount.
StellarSdk.nativeToScVal(BigInt(0), { type: "i128" }),
StellarSdk.nativeToScVal(BigInt(1000), { type: "u32" }),
```

Ledger 1000 is in the distant past on every live network. This works today only because #344 made `approve` skip the expiry assertion when `amount == 0` and take the `remove` branch instead — the argument is ignored. Before #344 it would have reverted, and it will revert again the moment anyone reinstates a bound on `expiration_ledger` for the zero-amount case, or adds validation to the simulator's path.

So the app depends on a contract branch ignoring an argument it deliberately passes wrong, in two files, with no comment recording the dependency in `AllowanceManager` and only a partial one in the simulator. The two literals also have to stay in sync by hand, and the simulator is what gates the real submission, so a divergence means the preflight and the transaction disagree — the failure shape of #83.

**Fix:** Pass `0` for both amount and expiration from one shared `buildRevokeAllowanceArgs` helper, and let the contract's documented zero-amount branch handle it. Add a comment at the contract's `if amount == 0` branch noting that clients rely on `expiration_ledger` being ignored there, so it cannot be tightened without a client change, and cover the revoke path in the simulator's existing test file.

---

### 151. `ApproveForm` defaults to a 365-day allowance, twice the network ceiling

🟡 **Medium** · `frontend` `defi`

**File:** `frontend/components/forms/ApproveForm.tsx` lines 22, 62 and 70

**Issue:** The expiry defaults to a year and is converted with a raw literal:

```ts
expirationDays: "365",
...
return currentLedger + parseInt(days || "365") * 17280;
```

365 × 17,280 is 6,307,200 ledgers. The network maximum is 3,110,400 on both testnet and mainnet (see #139), so the default is 2.03x the ceiling. The schema at line 22 bounds the field but not against the network limit.

This is the input that makes #140 the common case rather than a corner case. Accepting the default produces an allowance whose stored `expiration_ledger` the network cannot honour: `approve` succeeds because it clamps the TTL it requests, and then the spender's first *partial* `transfer_from` or `burn_from` reverts with an opaque host error, while a full spend works. So the default path through the Allowances UI creates allowances that fail in the most confusing possible way, and the user who did nothing but accept the default is the one who hits it.

The `17280` literal is also the last raw copy outside `recentTokens.ts`, which open issue #367 covers.

**Fix:** Read the ceiling from the contract or the network rather than assuming it — `env.storage().max_ttl()` is exposed on-chain and the value is available from the `STATE_ARCHIVAL` config setting off-chain — and bound `expirationDays` in the Zod schema against it, with a validation message naming the maximum. Default to 30 days, which covers the actual use case and leaves generous headroom. Import `LEDGERS_PER_DAY` rather than re-typing 17280. Land it with #140 so the contract stops accepting the bad value at the same time the UI stops producing it.

---

## Part 4: Dead code, duplication, and tooling

### 152. `NotificationProvider` is mounted on every page and cannot be reached

🟡 **Medium** · `frontend` `cleanup` `architecture`

**Files:** `frontend/app/providers/NotificationProvider.tsx` (158 lines); `frontend/app/layout.tsx` line 54; `frontend/app/providers/ToastProvider.tsx` (242 lines)

**Issue:** The app ships two parallel notification systems and uses one.

`NotificationProvider` is mounted third from the top of the provider tree in `layout.tsx:54`, so its code is in the initial bundle for every route. Nothing consumes it: `grep -rn "useNotification\|addNotification\|notify(" app components lib hooks` excluding the provider and its own test returns **nothing**. Its only other reference is `app/providers/__tests__/NotificationProvider.test.tsx`, which tests an API no caller uses — so the test passes forever and protects nothing.

`ToastProvider` is the real one, used in 13 files including the new `useAdminAction` hook, `ClaimVesting`, `PublicTokenPage`, all four forms and `lib/soroban.ts`.

The cost is not just the dead bytes. A contributor adding a notification has two plausible providers to choose from, one of which is wired into nothing, and the passing test suggests it is supported. Open issue #95 (Discord and Telegram webhook alerts) is the kind of work that would land on the wrong one.

**Fix:** Decide which survives. `ToastProvider` has the callers, so the cheap path is deleting `NotificationProvider`, its test and its `layout.tsx` mount. If `NotificationProvider`'s richer model (persistence, a notification centre) is actually wanted for #95, then migrate the 13 `ToastProvider` call sites onto it and delete `ToastProvider` instead — but do one or the other in a single PR rather than leaving both.

---

### 153. `RecentLaunches` misses launches, truncates arbitrarily, and serialises its RPC

🟡 **Medium** · `frontend` `performance` `ux`

**File:** `frontend/lib/recentTokens.ts` lines 18, 63, and 91 to 103

**Issue:** Three separate problems in the landing page's launch feed.

**The lookback is 24 hours.** `const LOOKBACK_LEDGERS = 17280;` is one day at five-second ledgers, and `startLedger` is derived from it. On any day with no deployments the landing page's social proof — the thing that makes a launchpad look alive — is empty, and there is no fallback. Soroban RPC retains events for considerably longer than a day, so the window is self-imposed.

**Truncation happens before ranking.** Candidates are collected into a `Map` keyed by contract ID and then cut:

```ts
const candidates = Array.from(seen.entries()).slice(0, MAX_CANDIDATES);
```

`slice(0, 20)` takes the first 20 in map-insertion order, which is RPC event order, and the activity scoring that decides the final ranking runs *afterwards* on only those 20. So with more than 20 launches in the window the shortlist is neither the most recent nor the most active — it is whichever 20 the RPC happened to return first. The `MAX_RESULTS = 12` cut at the end then ranks a set that was already arbitrarily chosen.

**The scoring loop is sequential.** Lines 91 to 103 iterate candidates in batches of five and `await` each `getEvents` inside the loop, so a full 20-candidate refresh is four serial round trips, each with `limit: 1000`. That happens on every 60-second cache miss and blocks the response.

**Fix:** Widen the lookback to the RPC's retention window (probe it, or make it configurable, and degrade gracefully when `startLedger` is too old — `safeGetEvents` already swallows that error). Sort by `ledger` descending before `slice`, so truncation keeps the newest. Replace the sequential loop with `Promise.all` over the batches. Consider persisting discovered launches so the list survives both the cache TTL and the event retention window, which is what open issue #368's registry event would provide properly.

---

### 154. Five `react-hooks` lint rules are disabled repo-wide

🟡 **Medium** · `frontend` `quality` `ci`

**File:** `frontend/eslint.config.mjs` lines 8 to 15

**Issue:** The same config that gained #332's `no-console` rule turns off five rules from the React Hooks plugin:

```js
rules: {
  "react-hooks/set-state-in-effect": "off",
  "react-hooks/refs": "off",
  "react-hooks/static-components": "off",
  "react-hooks/preserve-manual-memoization": "off",
  "react-hooks/incompatible-library": "off",
  "no-console": ["error", { "allow": ["warn", "error"] }],
},
```

The file reads as though linting is tightening while five correctness-adjacent rules are globally off, and there is no comment explaining why any of them is disabled. These are not stylistic: `set-state-in-effect` catches the setState-during-effect patterns that cause render loops and duplicate fetches, `preserve-manual-memoization` catches memoization that React Compiler will silently discard, and `incompatible-library` catches libraries that break under concurrent rendering.

The codebase is exactly the shape these rules target. The recently added `useContractRead`, `useTokenAdminState` and `useFrozenAccounts` hooks all fetch on mount and set state in effects, and #342's authorization work will add more. `npm run lint` is a required CI step, so these rules being off is the difference between catching that class of bug at the PR and finding it in a wave document.

**Fix:** Re-enable them one per PR, starting as `"warn"` to size the work, then promote to `"error"` once the hits are fixed. Take `set-state-in-effect` first, since it has the highest defect yield on this codebase. Where a rule genuinely cannot be satisfied, disable it inline at the specific line with a comment giving the reason, rather than globally. Anything still disabled at the end of the sweep should carry a comment saying why.

---

### 155. The new event-topic drift tests scan source text, so they assert literals rather than events

🟡 **Medium** · `contracts` `tests`

**Files:** `contracts/token/src/lib.rs` lines 1227 to 1265; `contracts/vesting/src/lib.rs` lines 732 to 770

**Issue:** #340 asked for a test that stops `docs/events.md`, the contract and the indexer drifting apart, and the implementation is genuinely clever: `scripts/generate_events_doc.py --check` runs in CI, and each contract carries a test asserting its topic set. The test does it by reading its own source as a string:

```rust
const NEEDLE: &str = "symbol_short!(\"";
...
.split_once("#[cfg(test)]\nmod test {")
```

Three weaknesses follow, and the same logic is duplicated verbatim in both contracts.

**It is brittle in the wrong direction.** The `split_once` depends on the exact bytes `#[cfg(test)]\nmod test {`. Any reformatting of that line — a `cargo fmt` change, an added attribute, a doc comment between them — makes the split fail, and the failure mode is a confusing panic in an unrelated-looking test rather than a clear message.

**It cannot see what it claims to check.** It finds `symbol_short!` *literals*, so a topic built from a variable or a constant is invisible to it, and a `publish` call inside a branch that never executes still counts as an emitted event. It proves a string appears in the file, which is not the same as the contract emitting that topic.

**It does not check payloads.** #339's whole subject was that `mint`, `clawback` and `approve` had the wrong topic *tuples* and data. A literal scan cannot detect a regression there, so the test that exists to prevent event drift does not cover the axis on which event drift last happened.

**Fix:** Assert against the host instead of the source. Exercise each entry point in a test and read `env.events().all()`, comparing the full `(topics, data)` shape to a checked-in fixture — which also gives `docs/events.json` a real source of truth and lets `generate_events_doc.py` derive payload columns. Share the comparison helper between the two contracts via a small `contracts/common` test-support crate rather than copying it a third time when the factory contract in open issue #368 lands.

---

## Summary

| Area                                | Issues                  | Notes                                                                                                                                                              |
| ----------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Wave 8 fixes that did not fully land | 136, 137, 138, 139, 140 | #136 was closed with no code and its doc comment updated to claim otherwise. #137 and #138 are the deploy-path scaling fix failing to reach the rest of the app.    |
| Live failures                        | 138, 140, 145           | #138 gets the amount wrong on any token that is not 7 decimals; #140 reverts partial `transfer_from` / `burn_from`; #145 mislabels every shared mainnet token link. |
| Network parameters                   | 139, 140, 151           | A test-harness default shipped as the mainnet ceiling. Verified live value is 3,110,400 on both networks.                                                           |
| Token policy and lifecycle           | 141, 142, 143, 144      | Authorization flags immutable after deploy; a strict compliance node blocks all issuance; the whale cap silently lapses on `revoke_admin`.                          |
| Public and SSR surface               | 145, 146, 147           | Metadata, OG cards and the API routes are testnet-only, unvalidated and uncached; `<html lang>` never changes.                                                      |
| Transparency                         | 148, 149, 143           | No vesting event ever reaches the activity feed; the dashboard recomputes vesting off-chain.                                                                        |
| Dead code and duplication            | 150, 152, 153, 155      | A whole unused notification system in the bundle; a dead API route; the drift test duplicated across contracts.                                                     |
| Tooling                              | 154, 155                | Five `react-hooks` rules off repo-wide while `no-console` was added in the same file.                                                                               |

**Recommended order**

Six phases, ordered so anything that produces a wrong on-chain amount or a hard revert is dealt with before anything cosmetic. `scripts/create_wave_issues.py --order recommended` reads the machine-readable block below, so this prose and the creation order cannot drift apart.

1. **Phase 1: #137, #138, #136.** Amount correctness first. #137 is the exact helper, #138 is the sweep that deletes the other four copies and fixes the three forms that ignore decimals, and #136 is the freeze semantic that was closed without code. Do #137 before #138, since #138 depends on its helper.
2. **Phase 2: #139, #140, #151.** The TTL cluster, as one coordinated set. #140 is the hard failure, #139 is its root cause, and #151 is the input that triggers it; landing them separately leaves the app producing values the contract still mishandles.
3. **Phase 3: #145, #146, #147.** The public surface. #145 is the one an issuer sees the moment they share a mainnet launch, and #146 touches the same three files.
4. **Phase 4: #141, #142, #143, #144.** Contract policy and lifecycle. All four are small and independent; #142 needs a decision on scope before code.
5. **Phase 5: #148, #149, #150, #153.** Frontend truthfulness: show the vesting events, stop recomputing on-chain math, stop depending on an ignored argument, and rank launches before truncating them.
6. **Phase 6: #152, #154, #155.** Cleanup and the guardrails. #154 and #155 are what stop the next wave from having to enumerate this by hand.

<!-- wave-order
phase-1-amount-correctness:   137, 138, 136
phase-2-ttl-correctness:      139, 140, 151
phase-3-public-surface:       145, 146, 147
phase-4-contract-policy:      141, 142, 143, 144
phase-5-frontend-truth:       148, 149, 150, 153
phase-6-cleanup-tooling:      152, 154, 155
-->

## GitHub issue numbers

All 20 issues were created on 2026-07-30 with `create_wave_issues.py wave9.md --order recommended --apply`, in the phase order above rather than document order, then `--relink --apply` rewrote the intra-wave references. The numbers are contiguous from #395, so the mapping is creation position:

    GitHub number = 395 + (position in the wave-order plan - 1)

| Phase                      | Wave 9 sections, in creation order | GitHub  |
| -------------------------- | ---------------------------------- | ------- |
| phase-1-amount-correctness | 137, 138, 136                      | 395–397 |
| phase-2-ttl-correctness    | 139, 140, 151                      | 398–400 |
| phase-3-public-surface     | 145, 146, 147                      | 401–403 |
| phase-4-contract-policy    | 141, 142, 143, 144                 | 404–407 |
| phase-5-frontend-truth     | 148, 149, 150, 153                 | 408–411 |
| phase-6-cleanup-tooling    | 152, 154, 155                      | 412–414 |

Lookup by wave number: 136→397 · 137→395 · 138→396 · 139→398 · 140→399 · 141→404 · 142→405 · 143→406 · 144→407 · 145→401 · 146→402 · 147→403 · 148→408 · 149→409 · 150→410 · 151→400 · 152→412 · 153→411 · 154→413 · 155→414

**A note on cross-references.** The `#136` to `#155` numbers above are _wave 9 section numbers_, not GitHub issue numbers. `create_wave_issues.py` rewrites intra-wave references to the non-linking form `[NN]` on creation, and `--relink` converts them to real issue links once every issue exists. References to numbers below #136 (such as #319, #344 or #367) are genuine GitHub issues from earlier waves and are left untouched.

**A note on process.** Wave 8 closed with two recommendations: require a failing-first test in any PR that closes an issue, and grep for the contract method before closing a UI issue. Neither was adopted, and this wave's #136, #137, #138 and #140 are each a direct instance of what the first one would have caught. #137 is the sharpest example: the PR added the exact test #319 asked for, the test passes, and the bug it was meant to prevent is still there — because 1,000,000 at 7 decimals is small enough to survive the float. A test that cannot fail against the unfixed code is not coverage. The value that does fail (1,000,000 at 18 decimals) was available to anyone who asked which inputs the helper's arithmetic is exact for.

**A note on verification.** The `max_entry_ttl` figure in #139, #140 and #151 was read from the live networks on 2026-07-30 by querying the `CONFIG_SETTING_STATE_ARCHIVAL` ledger entry (`getLedgerEntries` with key `AAAACAAAAAo=`) against both `soroban-testnet.stellar.org` and `mainnet.sorobanrpc.com`; both returned 3,110,400. Network settings change by validator vote, so re-check before acting rather than trusting this number. The clamp-versus-error asymmetry described in #139 and #140 is at `soroban-env-host-21.2.1/src/storage.rs:521-537`, and the 6,312,000 test default is at `soroban-sdk-21.7.7/src/env.rs:514`.
