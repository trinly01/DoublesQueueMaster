# Reset-Detection Contract — Wave 1 shared interface

All agents code against this contract. Do not deviate without updating this file.

## 1. `detectServerResetAdvantage` (Agent B implements in `src/services/cloudSyncHelpers.ts`)

```ts
export interface ServerResetAdvantage {
  players: boolean;
  queues: boolean;
  matches: boolean;        // active matches
  completedMatches: boolean;
  actionLogs: boolean;
  stats: boolean;
}

export function detectServerResetAdvantage(
  local: AppState,
  server: AppState,
): ServerResetAdvantage
```

**Semantics (normative):**
- Per collection, `true` iff server's *effective* checkpoint > local's *effective* checkpoint. Strict `>` — equal means "same reset already adopted", local post-reset edits are legitimate and must survive.
- Checkpoint fields: `playersResetAt`, `queuesResetAt`, `matchesResetAt`, `completedMatchesResetAt`, `actionLogsResetAt`, `statsResetAt`.
- **`completedMatches` uses the effective winner**: per side, `max(fieldValue, settingsFieldTimestamps?.['completedMatchesResetAt'] ?? 0)` — because mergeAppState's per-field LWW can persist a regressed value while the stamp survives (Path-3 defect). Compare effective-vs-effective.
- Missing/undefined fields treated as `0`.
- **NO `Date.now()` calls** — pure value comparison of stored epochs. This is the clock-immunity property.
- Returns all-false when server has no checkpoint advantage (normal merge path unaffected).

## 2. Adoption semantics (Agent B applies at hook points)

When advantage flags a collection:
- Replace that collection's entities with server's version (wholesale per flagged collection — v1, salvage filter deferred because entity stamps are launderable via `mergePlayerFromDB`/`refreshPlayerRatings`).
- Adopt server checkpoint value verbatim into local state.
- For `completedMatches`: also carry `settingsFieldTimestamps['completedMatchesResetAt']` consistently.
- Leave unflagged collections + settings on normal LWW merge.
- Fire a user `notify` ("Club data was reset — unsynced changes discarded") matching existing notify patterns.
- Hook points (Agent B): `applyServerMatchmaking` privileged+dirty branch (~useCloudSync.ts:445-454), `performCloudSync` pre-push merge (~:220-235) AND verify re-merge (~:247-258). Agent C: `loadClubData` mergeEligible block — replaces `isRemoteReset` entirely (fixes its completedMatches-repopulation bug).

## 3. Guard pairing rule (Agent A implements in `mergeAppState`)

`guardFutureCheckpoint` currently zeroes ANY checkpoint `> Date.now()` on the merging device — this re-breaks adopted server checkpoints on subsequent merges (skeptic's pairing catch).

**New rule (commutative — preserves merge symmetry tests):**
- `value <= Date.now()` → accept.
- `value === peerValue` (both sides carry the same epoch, even if future-dated) → **accept** (corroborated adoption — two devices agreeing on an epoch is strong evidence it's real).
- `value > Date.now()` and `value !== peerValue` → reject (0), keep `console.warn`.

Apply symmetrically to all `effective*ResetAt` Math.max blocks AND `actionLogsResetAt` (which currently lacks the guard entirely — add it).

**Known residual (documented, do NOT fix in wave 1):** a device with clock hours behind will have its own post-reset entity stamps fall below the checkpoint → purged on next merge. Entity-stamp floor (`max(Date.now(), minEntityTimestamp)`) is a Phase-2 consideration.

## 4. Privilege fail-closed (Agent B gate + Agent C cache)

- Agent C: `club_meta_*` cache entries gain `verified: boolean` — `true` only after a fresh server fetch of admins/moderators M2M. TTL also applied (suggest 5min for privilege fields specifically; UI seeds may use longer).
- Agent B: `performCloudSync` privilege gate (~:195-206) requires **verified** cached ids OR fresh-fetch confirmation — cached-but-unverified ids may seed UI, never authorize push.
- Contract between them: the meta cache shape `{ adminIds, moderatorIds, timestamp, verified }`. Agent B reads `verified`; absent field (legacy cache) = unverified = no push.

## 5. Path-3 fix (Agent A, unconditional)

`completedMatchesResetAt` → `Math.max` of both sides' *effective* values (same effective-winner computation as detection), plus explicit `completedMatchesResetAt` key in the merged-state literal AFTER `...mergedSettings` so the persisted value can't regress via pickSettings. Zero test breakage expected (all specs have value==stamp).

## 6. Predicate unification (Agent A)

Merge filter includes `linkUpdatedAt`/`avoidUpdatedAt`/`lockUpdatedAt` but saveState purge omits them → merge keeps, saveState drops → flap. Extract shared predicate or add the missing fields to saveState's purge — ONE rule everywhere. Copy-on-write for stats block (merge shares entity refs).

## 7. actionLogs (Agent A)

- Add missing `guardFutureCheckpoint` + Math.max merge for `actionLogsResetAt`.
- Content filter: drop logs with `timestamp <= effectiveActionLogsResetAt` EXCEPT reset-audit actions (the `RESET_LOG_ACTIONS` set used by cap-immunity code ~:2537-2555). Filter BEFORE cap slice. **Update spec :4341-4362** which asserts pre-reset logs survive — the contract changes to "pre-reset logs are filtered, reset audit trail preserved".

## 8. Test-first protocol (all agents)

Write failing repro specs BEFORE fixes where feasible:
- Path-3 divergence: `{value:7000, no stamp, settingsUpdatedAt:9500}` vs `{value:3000, stamp:6000}` → assert merged epoch == filter epoch used.
- Clock-skew: server checkpoint future-dated on merger's clock, stale entities → assert empty merge.
- Privilege: cached unverified meta + demoted user → assert push blocked.
- Constraint specs that MUST stay green: merge symmetry/commutativity/idempotence, post-checkpoint entities survive, older-stamp can't resurrect.

## 9. Agent C additions (useClubData / useAuth / services) — coordinate with Agent B

### 9a. Privilege meta cache — write side DONE, gate side needs this

- `club_meta_<clubId>` entries now carry `verified: true` + `timestamp` **only when written from a fresh admins/moderators M2M fetch** (`loadClubData` post-merge write ~useClubData.ts, `refreshClubMembers` meta update ~useClubMembers.ts). Both write paths just fetched the M2M relations, so `verified:true` is accurate at write time.
- **TTL = 5 minutes** for privilege fields, exported as `CLUB_PRIVILEGE_META_TTL_MS` from `src/services/clubMembersMapper.ts`.
- **Agent B gate requirement:** in `performCloudSync`, read `LocalStorage.getItem('club_meta_' + currentClubId)` and authorize push-privileged ids ONLY when `isClubPrivilegeMetaVerified(meta)` (exported from `clubMembersMapper.ts`) returns true — i.e. `verified === true && 0 <= now - timestamp <= 5min`. Absent `verified` (legacy cache) or expired timestamp = unverified = may seed UI, never push. In-memory `clubAdminIds`/`clubModeratorIds` refs alone are NOT sufficient proof (they're seeded from cache on restore).
- ⚠️ **GAP FOUND (Agent B action needed):** the current `useCloudSync` gate (~line 261-276) checks only `privilegeMeta?.verified === true` — it does NOT enforce `CLUB_PRIVILEGE_META_TTL_MS` / `isClubPrivilegeMetaVerified`, so a verified entry authorizes pushes indefinitely if fresh fetches stop (unbounded demotion window). Please switch the check to `isClubPrivilegeMetaVerified(privilegeMeta)` — the helper already treats missing/future/expired timestamps as unverified.
- Cached ids still seed `clubAdminIds`/`clubModeratorIds`/`clubMembers` on `restoreFromCache` for UI — unchanged.

### 9b. Logout flush hook — Agent B should register

- `src/composables/useAuth.ts` exports `registerBeforeLogoutHook(hook): () => void` (module-level). `logout()` awaits all registered hooks with a 5s bound BEFORE `likhaClient.logout()` (SDK logout wipes credentials) and before `clearLocalSession()`.
- **Agent B:** in `useCloudSync`, register `performCloudSync` (or a lightweight flush that pushes pending state without server reads if preferable) via `registerBeforeLogoutHook` on setup and unregister on unmount. This closes the reset-loss-on-logout hole (RESET_DECISION #16) — without a registrant the hook set is empty and logout proceeds as before.

### 9c. Invisible privileged writer — resolved client-side

- `mapClubToMembers` now returns `adminIds`/`moderatorIds` **intersected with member (players M2M) ids**. A user in admins/moderators M2M but not players M2M gets no member row and no admin UI — and now also fails the `useCloudSync` push gate, so no invisible writes. Member rows' `isAdmin`/`isModerator` flags still reflect true roles. No useCloudSync change needed — the gate reads the same refs.

### 9d. loadClubData hook — DONE (replaces isRemoteReset)

- `loadClubData` mergeEligible branch now calls `detectServerResetAdvantage(state, serverMatchmaking)`; on any flag it runs the normal LWW merge, then `applyServerResetAdvantage(state, serverMatchmaking, advantage)` — the shared §2 helper in `cloudSyncHelpers.ts` (Agent B's implementation) wholesale-adopts flagged collections + verbatim checkpoints (incl. `completedMatches` repopulation + `completedMatchIds` + `settingsFieldTimestamps['completedMatchesResetAt']` carried from the server stamp), then notifies "Club data was reset — unsynced changes discarded". This is the 4th detection hook point (contract §2).
- Imports `detectServerResetAdvantage` + `applyServerResetAdvantage` + `ServerResetAdvantage` from `cloudSyncHelpers` — requires Agent B's §1/§2 exports to be present.
