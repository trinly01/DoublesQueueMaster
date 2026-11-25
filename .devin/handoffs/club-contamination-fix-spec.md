# Cross-Club Match Contamination — Fix Spec

## Confirmed incident (forensic)
Club `dnk.x` (UUID `2bf82b31-5217-4237-820b-b06bc3439754`) appState contains 4
matches stamped `club: 22e52ef0-bf60-4bd1-bea8-ef66193edf35` = **Siklab Pickleball
Club** (`siklab`). All `generatedBy/scoredBy = "Jel"` (a regular dnk.x player,
not admin/mod — verified via `club_directus_users*` junctions). The matches
legitimately live in siklab's appState; they leaked into dnk.x. dnk.x has ZERO
legitimate matches — its whole match list is foreign.

## Root cause
appState is namespaced per club only at the row/LS-key level. Inside the blob,
matches carry a `club` provenance stamp but **nothing enforced it**:
- `mergeAppState` (matchmaking.ts ~2356 active, ~2454 completed) unions matches
  by `matchId` + `updatedAt` LWW with zero club filtering.
- `useCloudSync` push (~611-644) sets `state.clubUUID`, backfills empty
  `completedMatch.club`, then PATCHes the WHOLE `MatchmakingApp.state` blob —
  foreign matches ride along to the wrong club row and replicate forever.
- `ActiveMatch` had NO `club` field (only `CompletedMatch.club` existed), so
  active matches carried no provenance.
- `/openplay` skips `loadClubData` → `state.clubUUID` retains the last real
  club → open-play matches can inherit a real club stamp; openplay makes
  `isCurrentUserAdmin=true` for everyone.

## Shared predicate (ALREADY ADDED to matchmaking-core.ts)
```ts
export function isForeignClubMatch(
  matchClub: string | undefined | null,
  currentClubUUID: string | undefined | null,
): boolean {
  if (!currentClubUUID) return false;   // no club context → keep all
  if (!matchClub) return false;         // unstamped/legacy → can't prove foreign
  return matchClub !== currentClubUUID; // proven foreign only
}
```
`ActiveMatch` now has `club?: string` (Directus club UUID, stamped at creation).

## Work items

### A. matchmaking service (matchmaking.ts + useManualSelection.ts + spec)
1. Stamp `club: this.state.clubUUID || ''` on the `activeMatches.push` in
   `draftNextMatches` (~1554-1573) and the manual push in
   `useManualSelection.ts` `createManualMatchWithCourt` (~276-302, use
   `MatchmakingApp.state.clubUUID || ''`).
2. `mergeAppState`: drop proven-foreign matches.
   - activeMatches: when building `mergedMatches` (~2414 `allMatches.forEach`),
     skip `isForeignClubMatch(match.club, this.state.clubUUID)`. MUST filter
     BEFORE `playersInMatches` is computed (~2424) so foreign-match players
     don't wrongly evict queue entries.
   - completedMatches: in the `allCompleted.forEach` filter (~2533), skip
     `isForeignClubMatch(match.club, this.state.clubUUID)`.
   - Reference clubUUID = `this.state.clubUUID`. Verify mergeAppState is a
     method with `this.state` access; if the merged target clubUUID is passed
     differently, use that. Fail-safe: empty clubUUID → predicate keeps all.
3. Do NOT backfill `club` onto activeMatches anywhere (leave unstamped legacy
   ones conservative-kept).
4. Add unit tests in matchmaking.spec.ts: foreign-club completed + active
   matches are dropped by merge; same-club and unstamped matches survive;
   empty clubUUID keeps everything.

### B. sync push sanitize (useCloudSync.ts + spec)
In `performCloudSync` right before `const payload = { matchmaking: ... }`
(~620), build a sanitized payload that strips proven-foreign matches so the
server NEVER receives them regardless of how they entered local state:
```ts
const cu = currentClubUUID.value;
const keep = <T extends { club?: string }>(arr: T[] | undefined) =>
  (arr || []).filter((m) => !isForeignClubMatch(m.club, cu));
const payload = {
  matchmaking: {
    ...MatchmakingApp.state,
    activeMatches: keep(MatchmakingApp.state.activeMatches),
    completedMatches: keep(MatchmakingApp.state.completedMatches),
  },
};
```
Import `isForeignClubMatch` from `src/services/matchmaking-core` (check the
existing import block — matchmaking.ts re-exports core; import from the same
place other core symbols come from). Do NOT mutate `MatchmakingApp.state` —
sanitize a copy for the payload only. Add spec: a foreign-club match in state
is absent from the PATCHed appState; same-club/unstamped survive.

### C. openplay guard (useClubData.ts / ClubPage.vue) — investigate + minimal fix
`/openplay` skips `loadClubData`, so `MatchmakingApp.state.clubUUID` keeps the
last real club's UUID and open-play matches inherit that stamp. Find the
safest minimal change so open-play matches do NOT claim a real club's UUID —
e.g. clear `state.clubId`/`state.clubUUID` (or set a sentinel) when entering
openplay, or stamp matches with `''` while `isOpenPlay`. VERIFY remount/
route behavior first (does ClubPage remount between /club/:id and
/openplay?). Keep it minimal — do not break real-club sessions. Report what
you changed + confidence; if no safe minimal change exists, report findings
only.

## Data recovery (orchestrator, after code lands)
PATCH dnk.x club row `appState` to remove the 4 foreign matchIds
(`d176v8a`, `0b2kb75`, `itu5l0s`, `4ophgyk`) from BOTH `activeMatches` and
`completedMatches`. Preserve everything else byte-for-byte. siklab's appState
is untouched (matches belong there). Evaluate whether Jel's foreign
settings_change/reset_all actionLog entries + the `variety_first`/
`availableCourts` setting overwrites should also be reverted — flag to user
before reverting settings (they may be desired).

## Non-goals
- Do NOT change rating/replay logic.
- Do NOT touch the `club` backfill that fills EMPTY completedMatch.club with
  currentClubUUID (it's correct for legit unstamped matches; it skips
  non-empty foreign stamps).
- Conservative predicate only — never drop unstamped matches.
