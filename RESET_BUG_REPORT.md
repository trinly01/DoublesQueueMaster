# Club Data Reset — Stale-Device Resurrection Bug

Investigation: 4 bounded agents (merge internals, sync orchestration, reset coverage/UI, spec recon).
Status: **root cause confirmed — 3 merge paths + 4 sync windows + 1 coverage gap.**

## Symptom

Admin resets data (Settings → Data Management) on device A. Device B (stale admin) shows
resurrected players/queue/matches — and can push the ghosts back to the server.

## Architecture recap

- Reset = clear collections + stamp `*ResetAt = now` checkpoints
  (`playersResetAt, statsResetAt, queuesResetAt, matchesResetAt,
  completedMatchesResetAt, actionLogsResetAt`)
- Sync = `performCloudSync` → read server → `mergeAppState(local, server)`
  (privileged+dirty only) → verify → PATCH `club.appState.matchmaking`
- Non-privileged devices: pull-only, self-heal via realtime/poll/mount.
  **Bug is admin/moderator-specific.**

## ROOT CAUSE — mergeAppState resurrection paths (matchmaking.ts)

### Path 1 — behind-clock device (critical)
`guardFutureCheckpoint` (:1733-1739) zeroes any checkpoint `> Date.now()`
**on the merging device's clock**. A slow-clocked device discards the
legit server reset → `effectiveResetAt=0` → `filterPlayers` returns
unfiltered (:1786, same :1837/:1855) → ALL stale local entities merge
→ pushed verbatim (:284-292). Symmetric guard also discards legit
server checkpoints — it's meant to stop future-dated attacks but
punishes clock skew.

### Path 2 — ahead-clock / post-checkpoint touches
Pre-filter keeps entities whose `max(createdAt,updatedAt,deletedAt,
statsUpdatedAt[,link/avoid]) >= checkpoint` (:1792-1866). Any entity the
stale device touched after reset wall-time survives — including
`mergePlayerFromDB` avatar/name edits bumping `updatedAt`
(cloudSyncHelpers.ts:225-242). Inherent LWW trade-off, widened by skew.

### Path 3 — `completedMatchesResetAt` winner-take-all LWW flaw
Unlike other checkpoints (`Math.max`, :1740-1757), this uses per-field
LWW on `settingsFieldTimestamps` (:2285-2314): local's older/0 epoch can
become `winningResetAt` → stale completedMatches kept (:2332). Persisted
value can diverge/regress to 0 — which also disables the saveState purge
(`if (completedCheckpoint > 0)`, :317).

### Structural gaps
- **No post-merge purge** — pre-filters are the only gate;
  `applyMergedState` assigns without `saveState()`; checkpoint purge only
  runs on local mutations (:247-334)
- `actionLogsResetAt` max-merged with **NO future guard** (:2510-2513)
- `actionLogs` never checkpoint-filtered in merge (union/dedup/cap only)
  → `resetState()`'s cleared logs repopulate from stale admins
- merge `serverHasNoMatches` counts tombstones; useClubData's
  `isRemoteReset` filters `!deletedAt` — asymmetry
- merge filter includes `link/avoidUpdatedAt`; saveState purge omits
  them → flap

## SYNC-WINDOW findings (useCloudSync.ts)

| # | Window | Detail |
|---|---|---|
| W1 | verify→PATCH TOCTOU | re-read ts at :242-263 then PATCH :288 — reset landing in between is overwritten; no server precondition |
| W2 | merge shortcut defeated | fast-path needs `serverTime > localTime` (:1721-1728); any offline activity bumps local `lastModified` → per-entity merge → Path 1/2 live |
| W3 | cached privileges no TTL | `club_meta_*` adminIds repopulated w/o expiry (useClubData.ts:271-308) |
| W4 | pending flag blinds poll | `hasPendingCloudSync` skips 20s staleness poll (:718) — failed push = stale AND blind |

Good news: server read fails → no push (:302-309); non-priv never push;
`skipServerMerge=true` is dead param (no caller).

## RESET-COVERAGE findings

All reset paths stamp their checkpoints correctly — **no path clears
without stamping**. Exceptions/notes:
- `actionLogs` never cleared by `hardResetEverything` (array kept) and
  never checkpoint-filtered in merge → stale logs repopulate (documented
  as intended but inconsistent with `resetState`)
- Players column = raw `state.players` filtered only by `!deletedAt`
  (ClubPage.vue:1836-1851) — no checkpoint filter; ghosts display as
  soon as merge resurrects them
- Admin gating strict: typed club-slug confirm + admin-only

## ADJACENT BUGS found
- `isRemoteReset` branch (useClubData.ts:661-730) clears `completedMatches`
  but never repopulates from server → post-reset matches lost locally
- `useDataManagement.spec.ts` doesn't assert checkpoint stamping;
  `beforeEach` misses 3 of 6 checkpoints → test state leaks

## TEST EVIDENCE (agent D)
- `mergeAppState` is pure/exported — fully testable
- Naive repro (empty-server-newer) PASSES — coverage exists
  (matchmaking.spec.ts:2398-2783, 3363)
- **Failing-test sketch confirmed**: stale device with entity stamps
  post-checkpoint + `lastModified > server` → entities survive filters →
  FAIL predicted. Second variant: server missing `*ResetAt` fields →
  `effectiveResetAt=0` → full resurrection

## PROPOSED FIX PLAN (priority order)

**P0 — merge correctness (matchmaking.ts):**
1. `guardFutureCheckpoint` → asymmetric: accept checkpoints up to bounded
   future skew (e.g. +24h) instead of zeroing; or `max()` before guard
2. `completedMatchesResetAt` → `Math.max` merge like siblings (kill
   winner-take-all fts flaw)
3. Post-merge checkpoint purge pass on `mergedState` before return
   (defense-in-depth)
4. `actionLogsResetAt` → add future guard; filter actionLogs by checkpoint
5. Align `serverHasNoMatches` with `!deletedAt` semantics

**P1 — sync hardening:**
6. TTL on `club_meta_*` cached privileges
7. `pollServerState` should pull (not skip) when pending flag came from
   a FAILED push
8. Fix `isRemoteReset` completedMatches repopulation

**P2 — tests:**
9. Add failing repro specs (clock-skew + missing-checkpoint variants) →
   fix → green; backfill checkpoint assertions in useDataManagement.spec

**P3 — product decision (needs user input):**
- Post-reset-touch resurrection is inherent LWW — accept, or add
  per-entity reset tombstones (bigger change)?
- W1 TOCTOU residual: accept (~1 RTT window) or add version precondition?
