# Read-Path Dirty-Tracking (P0) + Entity Granularity (P1) — Spec

Builds on shipped `src/services/syncDirtyTracker.ts` (commit a5b376b) and
`.devin/handoffs/sync-ultimate-plan.md`. Two work items, P0 first.

## P0 — Close the read-path hole (REQUIRED, ship independently)

Inbound merges currently run plain `mergeAppState`/`mergeWithResetAdvantage`
with NO dirty tracking → stale local content can win, get laundered into
state, then propagate on a later push that skips mergeForPush.

Apply the SAME dirty-tracked merge used on the push path to these inbound
sites, reusing existing exports from `syncDirtyTracker.ts`:
`loadBaseline`, `computeDirtyUnits`, `buildLocalForMerge`,
`mergeWithResetAdvantage` (already imported where needed),
`refreshBaselineAfterMerge`, `saveBaseline`, plus `applyMergedState`.

### Site 1 — `src/composables/useCloudSync.ts` `applyServerMatchmaking`
privileged+dirty branch (~line 1049-1066). Currently:
`mergeWithResetAdvantage(MatchmakingApp.state, serverState)` → applyMergedState.
Change to compute dirty vs baseline, buildLocalForMerge, then merge, then
apply, then refreshBaselineAfterMerge + saveBaseline.

### Site 2 — `src/composables/useClubData.ts` `mergeEligible` block
(~lines 770-800). Two mergeAppState calls:
- isFreshState branch (~778): local is empty → mergeAppState already adopts
  server; dirty-tracking optional here (baseline=null→all-dirty anyway).
  Apply for consistency IF simple; safe either way.
- existing-state branch (~785): THE hole. Wrap with dirty-tracked merge.

### CRITICAL correctness rules (do NOT violate)
- After an inbound merge, call `refreshBaselineAfterMerge(baseline, state,
  dirty)` — NOT `captureBaseline` — so clean units adopted from server are
  re-baselined BUT dirty units keep their pre-merge fingerprints (still owed
  to server). Using captureBaseline here would falsely mark pending local
  edits as synced → DATA LOSS on next push.
- `baseline === null` → computeDirtyUnits returns all-dirty →
  buildLocalForMerge is identity → byte-identical to today. Safe fallback.
- Only apply to the privileged/dirty inbound paths. Non-privileged clean
  devices keep server-wins wholesale adopt (unchanged).
- clubUUID for baseline key = `currentClubUUID.value` (useCloudSync) /
  `currentClubUUID.value` (useClubData — it's a ref in that composable).
- Match existing code style; no mergeAppState signature changes.

## P1 — Per-entity granularity for match collections (SECOND, careful)

Extend dirty-unit granularity from whole-collection to per-entity for:
`queues`, `activeMatches`, `completedMatches`. KEEP whole-unit for
`completedMatchIds` (derived companion) and `actionLogs` (append-only).

### Entity keys
- QueueEntry → `username` (queues dedup by username — verify in
  matchmaking.ts ~219-241)
- ActiveMatch / CompletedMatch → `matchId` (verify field name)

### Changes to syncDirtyTracker.ts
- `fingerprintUnits`: emit `coll:<name>:<entityKey>` per entity INSTEAD of
  `coll:<name>` for the 3 entity collections. Handle missing/duplicate keys
  defensively (fall back to index-suffixed key).
- `buildLocalForMerge`: for these collections, build the local side as a
  per-entity merge — server array as the base ORDER, substitute local
  version for dirty entities, append local-only dirty entities, drop
  local-only CLEAN entities (server wins). MUST preserve array order
  (queues are FIFO-ordered — order is semantic!). Then mergeAppState LWWs
  the result vs server: clean entities identical → server wins; dirty →
  LWW. Tombstones: entities deleted via `deletedAt` keep their key →
  fingerprint changes → dirty → LWW propagates correctly.
- Keep `computeDirtyUnits`, `refreshBaselineAfterMerge`, baseline persistence
  UNCHANGED (they're key-agnostic — unitKey is just a string).

### Risks to respect
- Array ORDER is semantic for queues — never reorder; preserve server order
  for clean entities, local order only among dirty/local-only entities.
- Do NOT break the whole-collection fallback for completedMatchIds/actionLogs.
- If per-entity proves too risky in review, ship P0 alone and document P1
  deferred — P0 is the required fix.

## Tests
- P0: extend useCloudSync.spec.ts / useClubData.spec.ts — inbound merge
  adopts server for clean units, preserves dirty pending edits,
  refreshBaselineAfterMerge keeps dirty units dirty (no false-sync).
- P1: syncDirtyTracker.spec.ts — per-entity dirty keys, clean entity adopts
  server inside a dirty collection, queue order preserved, tombstone delete
  propagates.

## Verify
npm run lint, npm run typecheck, npm test. Then npm run build (Node 24) →
docs/, commit, push.
