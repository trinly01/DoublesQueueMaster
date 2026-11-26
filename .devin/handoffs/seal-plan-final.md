# Contamination Seal — FINAL Plan (post-debate, v2)

Supersedes `seal-plan-draft.md`. Incorporates red-team corrections + both
advocate positions + research. Read `seal-leak-map.md` for the leak inventory.

## Debate outcome (what the agents agreed/disagreed on)

**CONSENSUS:**
- One shared `dropForeignClubMatches(state, clubUUID)` helper (in
  matchmaking-core next to `isForeignClubMatch`) — NOT divergent inline filters.
  Called at every adoption boundary.
- BOTH provenance fixes (P0) AND boundary guards (P1) are required — neither
  alone seals it.
- The two `club` backfills are PURE LAUNDERING → **drop them entirely**.
  (Red-team proved "reorder" is a no-op: `keep()` and backfill mutate the same
  object refs, so order changes nothing.) Nothing downstream needs the stamp
  for legit matches — DUPR/stats read server `completed_match`, not `m.club`.
- `completedMatch.club` preserve (`match.club || state.clubUUID`) is
  near-zero-risk: for every legit match `match.club === state.clubUUID`, so
  output is identical; it only diverges for foreign-stamped matches.
- `mergeClubUUID=''` ambiguity → caller-supplied authoritative clubUUID param
  (commutative by construction), NOT prefer-dominant-stamp (breaks commutativity).
- Unstamped-match lane stays open under every approach → quarantine policy is a
  separate follow-up, honestly deferred.
- Already-laundered + unstamped-foreign data is UNFIXABLE client-side → needs
  data repair / server-side work (follow-up).

**RESOLVED ordering disagreement:** provenance-vs-guards "first" is moot if
shipped together — BUT red-team proved **P0.2+P0.3 (backfill removal) are
BLOCKING prerequisites for P1**: `useClubData.ts:1026-1032` backfill is
unconditional + post-merge, so any guarded match gets laundered on the SAME
load pass. Therefore within the release: provenance edits land FIRST, then
guards.

## THE SAFEST FIX — ordered changes

### Step 0 — shared helper (foundation)
Add to `matchmaking-core.ts`:
```ts
export function dropForeignClubMatches<T extends {club?:string}>(
  state, clubUUID): void  // filters state.activeMatches + state.completedMatches
```
Logs each dropped matchId+stamp (forensics). Conservative: keeps unstamped.

### Step 1 — P0 provenance (BLOCKING prerequisite; ~3 surgical edits)
1a. `matchmaking.ts` `reportMatchScore`: 
    - Add refuse-check IMMEDIATELY after `const match = activeMatches[i]` (:1667),
      BEFORE updateHistory/rating mutations (:1703+): if
      `isForeignClubMatch(match.club, state.clubUUID)` → notify + return undefined.
    - Stamp `completedMatch.club = match.club || state.clubUUID || ''` (:1807)
      — preserve provenance instead of always re-stamping viewing club.
1b. `useCloudSync.ts:614-619`: DELETE the `if(!m.club) m.club=currentClubUUID`
    backfill (it mutates live state pre-filter → laundering).
1c. `useClubData.ts:1026-1032`: DELETE the unconditional post-merge backfill.

### Step 2 — P1 boundary guards (all 5 adoption sites, using helper)
Apply `dropForeignClubMatches` (or inline isForeignClubMatch filter) at:
- `useClubData.ts:320-333` restoreFromCache — AFTER meta read (:308-318), filter
  cachedState.activeMatches/completedMatches by meta.clubUUID (legacy caches
  lack meta.clubUUID → '' → no-op, acceptable).
- `useClubData.ts:905-926` load overwrite — filter serverMatchmaking match arrays
  by club.id BEFORE assign.
- `useCloudSync.ts` `overwriteStateFromServer` (:947-968) — filter both arrays by
  currentClubUUID.value before assign. ALSO set state.clubUUID from server blob
  (currently never set → feeds mergeClubUUID ambiguity).
- `cloudSyncHelpers.ts` `applyServerResetAdvantage` (:432-469) — post-filter
  adopted activeMatches/completedMatches by CALLER's authoritative clubUUID.
  ALSO gate detection: skip adoption ONLY on PROVEN mismatch
  (`server.clubUUID && server.clubUUID !== local.clubUUID`) — red-team: naive
  `!==` kills reset adoption for all legacy blobs (server.clubUUID='').
  NEVER filter by `merged.clubUUID` (undefined → no-op trap).
- `matchmaking.ts` `mergeForPush`/`applyServerMatchmaking` reset-adopt call site
  — same post-filter (covers the second applyServerResetAdvantage caller).

### Step 3 — D1 push-path hardening
- `useCloudSync.ts`: build `pushedBaseline`/`captureBaseline` from the STRIPPED
  payload shape (`{...state, activeMatches: pushedA, completedMatches: pushedC}`)
  so baseline ≡ accepted commit — foreign matches stop looking "clean/synced".
- Sanitize live `state.activeMatches`/`completedMatches` (not just payload copy)
  before push, so B3 cache-restore can't re-seed them.
- Intersect/names-pace `completedMatchIds` pushed with kept completedMatches ids.

### Step 4 — P2 mergeClubUUID ambiguity (commutativity-safe)
- `matchmaking.ts:2422-2427`: replace derivation with caller-supplied
  authoritative clubUUID param (mergeAppState signature change). Callers pass
  `currentClubUUID.value` (useCloudSync:249) / `club.id` (useClubData).
  A 'B'-stamped match in club-A's row is foreign regardless of local.clubUUID.
  Fallback if signature change too risky: keep-all + unconditional ambiguity log.

### Step 5 — tests (test-first per repo convention)
- dropForeignClubMatches: foreign dropped, same-club + unstamped kept, empty
  clubUUID keeps all.
- reportMatchScore: foreign-stamped match refused BEFORE rating/history mutation;
  match.club preserved on completion.
- Each adoption boundary: foreign match in server blob/cache does NOT enter state.
- applyServerResetAdvantage: legacy blob (server.clubUUID='') still adopts reset;
  proven-mismatch blob's foreign matches filtered.
- mergeAppState commutativity spec stays green; update
  `useCloudSync.spec.ts:2250` (backfill assertion) + `matchmaking.spec.ts:6084`
  (ambiguous keep-all) for intended behavior changes.

## Explicitly OUT of scope (follow-ups, honestly deferred)
- Already-laundered + unstamped-foreign production data → needs server-side
  inference or manual blob repair (like the spec's Data Recovery PATCH).
- Unstamped-match quarantine policy (only stamp-on-create-everywhere + quarantine
  closes the lane — risky, separate effort).
- completedMatchIds/actionLogs/players/queues club stamps → schema changes.
- Server-side Directus flow validating embedded clubUUID on appState write →
  spike later (booking's child_record_guard is precedent).
- Enforce-helper pre-filtering (gcTombstones etc.) → named follow-up if residual.
- Cross-club scoring RBAC → membership-model decision, separate from sync seal.

## Top risks (ranked)
1. FALSE-POSITIVE foreign drop deleting real matches — mitigated by conservative
   predicate (unstamped always kept) + authoritative UUID refs + tests.
2. mergeAppState signature change breaking commutativity specs — mitigated by
   external-constant param (commutative by construction) + keeping keep-all
   fallback.
3. applyServerResetAdvantage gate breaking legacy-blob reset adoption — mitigated
   by proven-mismatch-only gate (red-team catch).
4. Backfill removal changing legit-match club attribution — mitigated: nothing
   downstream reads in-blob .club except the guards themselves (verified).
