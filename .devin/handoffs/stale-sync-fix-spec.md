# Stale-Offline-Admin Sync Fix — Implementation Spec

## Problem (root cause, agent-verified)

`mergeAppState` (`src/services/matchmaking.ts` ~1850) does per-field/per-entity
last-writer-wins on **client wall-clock stamps** (`updatedAt`,
`statsUpdatedAt`, `ratingUpdatedAt`, `settingsFieldTimestamps`, `lastModified`,
`*ResetAt`). Server commit order (`date_updated`) is NEVER an input to the
merge. Consequence: an admin device that was offline reconnects, merges, and
any field/entity where its stored client stamp ≥ the server's is won by the
(stale) local content — then the merged blob is pushed as a NEW commit and
propagates to every other admin device as "latest."

Commit-order CAS (`date_updated`) protects the write BOUNDARY but not content.

## Fix — dirty-unit tracking (only genuine local edits compete)

Track which units of `AppState` the device **genuinely edited since its last
successful sync**, via a fingerprint baseline. At the pre-push merge, units
NOT in the dirty set adopt the **server version wholesale** (no LWW); only
dirty units run the existing LWW. Stale carryover can no longer propagate.

This mirrors the existing `applyServerResetAdvantage` wholesale-adopt pattern
(`src/services/cloudSyncHelpers.ts` ~432) and reuses `jsonEqual`/
`collectionEqual` (`cloudSyncHelpers.ts` ~261-336).

## Dirty-unit granularity

- `players` (Record<string,Player>): **per player key**
- `settings` fields: **per field name** (top-level scalar settings keys)
- `queues`, `activeMatches`, `completedMatches`, `completedMatchIds`,
  `actionLogs`: **whole-collection** for V1 (arrays — collection-level is the
  safe unit; finer granularity is a documented follow-up)
- Scalar/meta keys (`lastModified`, `teamSize`, `clubId`, `clubUUID`,
  `settingsUpdatedAt`, `settingsFieldTimestamps`, `*ResetAt`,
  `completedMatchIds` handled above): follow existing merge logic — never
  force-dirty.

## API (new module `src/services/syncDirtyTracker.ts`)

```ts
// Fingerprint one dirty-unit's value → stable string (JSON.stringify with
// sorted keys, or reuse an existing canonicalizer if present).
unitFingerprint(value: unknown): string

// Compute the set of dirty unit-keys for the current state vs baseline.
// unitKey format: 'players:<key>' | 'settings:<field>' | 'coll:<name>'
computeDirtyUnits(state: AppState, baseline: DirtyBaseline | null): Set<string>

// Build a baseline snapshot from a state (called on successful push AND
// whenever server state is adopted locally so adopted content is not
// mistaken for local edits).
captureBaseline(state: AppState): DirtyBaseline

// Persist/load per club: LocalStorage key `sync_dirty_baseline_${clubUUID}`
loadBaseline(clubUUID): DirtyBaseline | null
saveBaseline(clubUUID, baseline): void
```

`DirtyBaseline = Record<string, string>` (unitKey → fingerprint).

## Merge wiring — `src/composables/useCloudSync.ts`

Only the PUSH path (privileged devices about to write) — read-side merges
(`useClubData.ts`, realtime apply for readers) stay unchanged.

Inside `mergeWithResetAdvantage` (~line 198) OR at its two push call sites
(`performCloudSync` ~458 and CAS-backstop ~557):

1. `const dirty = computeDirtyUnits(MatchmakingApp.state, loadBaseline(clubUUID))`
2. Build `localForMerge` = shallow-clone of local state where every CLEAN
   unit is replaced by the server's version:
   - `players`: `localForMerge.players = { ...server.players }` then for each
     dirty player key present in local, set `localForMerge.players[k] = local.players[k]`
     (local-only dirty players are kept; clean players = server version).
   - settings fields: for each clean settings field, copy `server[field]`.
   - clean collections (`queues`, `activeMatches`, `completedMatches`,
     `completedMatchIds`, `actionLogs`): `localForMerge[name] = server[name]`.
3. Run existing `mergeAppState(localForMerge, server)` (+ reset-advantage).
   Clean units are now identical local==server → server wins; dirty units LWW.
4. After successful CAS push (~line 644, near `clearPendingSync`):
   `saveBaseline(clubUUID, captureBaseline(mergedPushedState))`.
5. ALSO refresh baseline when server state is adopted wholesale
   (`overwriteStateFromServer` ~856 / `applyServerMatchmaking` clean path)
   so adopted content isn't later seen as local edits.

`baseline === null` (first run / cleared storage): treat ALL units as dirty
(current behavior — conservative, no regression). Baseline self-heals after
the first successful push/adopt.

## Secondary fix — reset-checkpoint asymmetry

`detectServerResetAdvantage`/`applyServerResetAdvantage` only fire when
server checkpoint > local. Add the symmetric guard so a device whose LOCAL
`*ResetAt` checkpoint exceeds the server's cannot smuggle a stale "reset"
through the normal merge: in the dirty-tracker merge path, treat a local
`*ResetAt` that is NOT corroborated by the server as NOT dirty (defer to
server) unless it is a genuine pending local reset. Implement conservatively:
if `local[*ResetAt] > server[*ResetAt]` and the collection is otherwise clean,
prefer server. (Keep this minimal — do not redesign reset detection.)

## Constraints

- Do NOT change `mergeAppState`'s signature or its ~117 timestamp sites.
- Read-side merges must be byte-for-byte behavior-identical (no baseline
  reads on the reader path — keep it push-path only).
- Fingerprinting must be deterministic (sorted keys) and cheap enough to run
  once per push + once per merge (state ~1MB is fine — push already
  serializes the whole blob).
- No secrets, no new deps. TypeScript strict. Match existing code style.

## Tests (add to `src/services/syncDirtyTracker.spec.ts` + extend
`useCloudSync.spec.ts` if practical)

- clean unit (unchanged vs baseline) → server version wins in merged output
- dirty unit (edited vs baseline) → local LWW still applies
- baseline=null → all dirty (current behavior preserved)
- baseline refreshed on adopt → adopted server content not flagged dirty
- players per-key granularity: editing one player leaves others clean
- settings per-field granularity
- a stale-offline simulation: local has old stamps + server newer → clean
  fields take server, dirty field keeps local edit

## Verification

`npm run lint`, `npm run typecheck`, `npm test`, `npm run build` (Node 24).
Rebuild + commit `docs/` (quasar build -m pwa outputs there).

## NOT in scope (follow-ups)

- Entity-granular dirty for match arrays (queues/activeMatches/completedMatches)
- Commit-anchored entity stamps (`date_updated`-keyed ordering) — the
  ultimate fix; this is the safe stepping stone.
- HLC/CRDT — rejected by research as wrong cost/benefit here.
EOF
