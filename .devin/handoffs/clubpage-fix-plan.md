# ClubPage Server-Load Fix Plan — SAFEST-first (post-debate v2)

Goal: server must not be overwhelmed by concurrent players/admins/mods.
Constraint: **zero correctness loss** — every completed match must still
produce `completed_match` row + `directus_users.rating` + `event` rows +
DUPR-submittable `match_key`.

Evidence: `.devin/handoffs/clubpage-server-load.md` + 2 debate rounds
(correctness / client-safety / Directus-capability / red-team).
Both reviewers: **ship-with-changes** — all changes incorporated below.

## Phase 1 — Gate the `get appState` fan-out (flow-only, biggest win)

**Problem**: flow `e6fcb9cf` fires on EVERY `club` PATCH (incl. member/
name/logo edits) and fans out one `save completed match` sub-flow per
`appState.matchmaking.completedMatches` element (cap 500) + one
`update player events` per linked player. Old matches already no-op via
`match_key` UNIQUE — but only AFTER paying O(M) dispatches + exec +
failed inserts per PATCH.

**Verified safe**: effective processed set is IDENTICAL today vs
filtered — the unique constraint already restricts real work to new
keys (insert gate precedes rating trigger; duplicate key kills branch).
Rating is per-match incremental Elo written as absolute values →
reprocessing is a no-op anyway. Fail-safe direction: any filter miss →
over-process = today's behavior.

### Flow edit spec (`e6fcb9cf`, flow-manager.json + live via API)

Current chain: `flow.operation` = `get_players` (id `851c41dd`) →
`trigger_save_completed_matches` → `trigger_save_player_events`.

New chain (insert ops BEFORE `get_players`; rewire `flow.operation`
to the new first op):

```
prep_match_keys (exec)
  → existing_match_keys (item-read, reject → filter_fallback exec)
  → filter_new_matches (exec)
  → assert_new_matches (exec: throw 'NO_NEW_MATCHES' if empty)
      resolve → trigger_save_completed_matches → trigger_save_player_events
      reject → trigger_save_player_events          (skip match fan-out)
```

Op details:

1. **`prep_match_keys`** (exec): read
   `$trigger.payload.appState.matchmaking.completedMatches` (guard
   missing appState → return `{matchKeys: []}`); emit flat `string[]`
   of `` `${m.completedAt}_${m.matchId}` `` — **byte-identical to
   get_players' construction (raw completedAt, NO Date normalization)**.
2. **`existing_match_keys`** (item-read): `collection:"completed_match"`,
   **`permissions:"$full"`** (flow fires on MEMBER patches too —
   accountability-scoped read could fail and kill the whole chain),
   `emitEvents:false`,
   `query.filter.match_key._in = "{{prep_match_keys.matchKeys}}"`,
   `fields:["match_key"]`, **`limit:-1` (mandatory)**.
   - `reject` → **`filter_fallback` exec** returning
     `{newMatches: <raw completedMatches array>}` = fail-OPEN
     (over-process = today). Never fail-closed.
3. **`filter_new_matches`** (exec): `existing = new Set(
   data.existing_match_keys.map(r => r.match_key))`; emit
   **`newMatches` = the RAW match objects** filtered by key absence —
   MUST preserve `meta.matchmakingMode`, `teamA/teamB` rating snapshots,
   scores (same objects currently fed at flow-manager.json:4690).
   ⚠️ NEVER emit `matchPayloads`-shaped objects — they lack `meta` →
   mode guard at :4441 passes → casual/social matches get RATED.
4. **`assert_new_matches`** (exec): `if (!newMatches.length) throw` —
   reject routes to `trigger_save_player_events` directly, so an empty
   filtered set never reaches the trigger op (avoids unverified
   empty-array iteration semantics AND keeps events flowing).
5. **`trigger_save_completed_matches`**: payload →
   `"{{assert_new_matches.newMatches}}"` (or filter_new_matches —
   assert passes data through); `get_players` stays UNCHANGED and still
   feeds `trigger_save_player_events` (events consume cumulative player
   snapshots — timestamps advance via rating sync/DUPR without new
   matches → MUST stay unfiltered; agent-verified).
6. Optional: `iterationMode:"batch"`+`batchSize` — VERIFY exists on
   11.17.4 first (PR #16773 says ≥9.23; unconfirmed on this fork).
   Insurance only, skip if unsure.

**Expected effect**: per-PATCH cost drops from O(M≤500) match sub-flows
to O(new matches ≈ 0-2 typical) + unchanged O(R) guarded player-event
runs (R = linked players; each = 1 read + timestamp-guard throw — cheap
but real; documented residual, safe follow-up would need a different
gate since stats advance without matches).

### Pre-deploy checklist (ALL mandatory)

- [ ] Export live flow; diff ops vs flow-manager.json (drift check)
- [ ] **Live `match_key` format probe**: `SELECT match_key FROM
      completed_match ORDER BY completed_at DESC LIMIT 5` vs computed
      `${completedAt}_${matchId}` — MISMATCH = plan silently no-ops
      (fail-safe but useless); also confirms `script_transform_match`'s
      key construction (its exec tail is unreadable in export)
- [ ] Probe `item-read` with `_in: []` → `[]` not error
- [ ] Confirm `permissions:"$full"` accepted on item-read in this fork
- [ ] Post-deploy: tail flow run logs through one real admin PATCH +
      one member PATCH; verify completed_match row appears for a fresh
      test match and ratings update

### Rollback

Restore exported ops via API (flow-manager.json is repo source of
truth). Action flows are fire-and-forget — worst case is silent
no-op, never a blocked PATCH.

## Phase 2 — Client request reductions (independent, ship anytime)

| # | Change | File | Notes |
|---|---|---|---|
| 1 | `fetchKeysUntilMapped`: compute pending matchIds BEFORE fetch → skip GET when zero unmapped (today: fetch-then-check = wasted GET per client per completion) | ClubPage.vue:2878-2890 | SAFE, free win |
| 2 | Retry loop (≤7 GETs @4s) → gate on **`isCurrentUserAdmin`** (NOT canManageSession — mods can't submit); members keep single best-effort fetch for status chips | same | Red-team correction applied |
| 3 | `fetchDuoLeaderboard`: add missing `if (loading) return` guard — toggle currently double-fires up to 10 paged GETs | useDuoLeaderboard.ts:~97 | SAFE bug fix |
| 4 | Leaderboard tabs: TTL ~60-120s per (club, flag) — NO hard guard (dialog has no manual refresh); **invalidate TTL on `completedMatches.length` change** so fresh matches appear | ClubPage.vue:3687-3699 | Red-team: add invalidation |
| 5 | `refreshPlayerRatings` 60s poll: early-return when `document.hidden` INSIDE the poll fn (covers all callers; resume-sync re-pulls on return). Keep interval — only directus_users sync channel | useCloudSync.ts:1295-1298 | SAFE |
| 6 | Staleness poll: same `document.hidden` early-return; keep 20s visible | useCloudSync.ts:1163-1219 | SAFE |
| 7 | Feedback cache TTL (tab re-opens skip refetch); NO row limit — UI renders all rows | ClubPage.vue:3795-3820 | SAFE |

## Phase 3 — Later / optional

- Cron sweeper backstop for pre-existing at-most-once gap (sub-flow
  dies between create and rating write) — unchanged by Phase 1.
- `Submit DUPR Matches`: bound unbounded `dupr_connection` scan.
- Dashboard chart aggregation caching.
- Player-events fan-out cost: O(R) guarded reads/PATCH — only optimize
  with a stats-diff signal, NOT newMatches-participation (stats advance
  without matches — agent-verified unsafe to filter).

## Rejected (debate)

- Client flag in appState blob — LWW merge semantics, old-client break.
- Dedicated trigger collection — schema+perms+client queue, disproportionate.
- Native trigger field-filter — doesn't exist in Directus 11.x.
- Hard leaderboard guards — no manual refresh in dialog.
- Removing 60s ratings poll — only directus_users sync channel.
- Filtering player-events by newMatches — unsafe (stats advance
  without matches; player_day rolls daily).

## Risk register (final)

| Risk | L | Mitigation |
|---|---|---|
| Live flow drift vs export | M | Step-0 diff before edit |
| match_key format mismatch | L | Mandatory live probe; fail-safe = today |
| item-read error kills whole flow | L | reject → filter_fallback (fail-open) |
| Empty-array trigger semantics | L | assert_new_matches guard — never sends [] |
| meta-loss → casual matches rated | L→eliminated | R2 spec: raw objects only |
| Accountability-scoped read fails on member PATCH | L→eliminated | permissions:$full mandated |
| Concurrent-PATCH race | pre-existing | unique constraint backstops identically |
| O(R) player-event residual | accepted | documented; cheaper than O(M); safe follow-up needs stats-diff signal |
