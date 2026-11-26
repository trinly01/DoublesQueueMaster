# Contamination Seal — Draft Plan (Round 2 target)

Read `.devin/handoffs/seal-leak-map.md` first for the full leak inventory.

## Guiding principle
SAFEST = smallest blast radius on a fragile sync engine. Prefer guards at
adoption boundaries + provenance correctness over rewriting merge logic.
Never drop unstamped matches (conservative) unless provenance is guaranteed.

## Proposed changes (ordered by risk-adjusted value)

### P0 — Stop provenance destruction (root enabler; makes all filters reliable)
1. `matchmaking.ts:1807` completion: stamp `completedMatch.club` from
   `match.club || state.clubUUID` — preserve the active match's own provenance
   instead of always re-stamping the viewing club. Refuse to score when
   `isForeignClubMatch(match.club, state.clubUUID)` (mirror merge/push predicate).
   Rationale: a match's club must not change because of who scored it.
2. `useCloudSync.ts:614-619` push backfill: reorder — run `keep()`
   (isForeignClubMatch) FIRST, backfill `club` only on survivors. Or drop the
   backfill entirely (unstamped passes predicate anyway → buys nothing).
3. `useClubData.ts:1026-1032` load backfill `if(!m.club) m.club=currentClubUUID`:
   same treatment — do NOT stamp matches that could be foreign. Safest: only
   backfill matches created locally this session (or drop; evaluate impact on
   legit unstamped matches' downstream club attribution).

### P1 — Guard the wholesale-adoption paths (currently zero filtering)
4. `useClubData.ts:905-926` overwrite path: filter `serverMatchmaking.
   activeMatches`/`completedMatches` via isForeignClubMatch(m.club, club.id)
   before assigning to state. (Also gate completedMatchIds/actionLogs if cheap.)
5. `cloudSyncHelpers.ts` `applyServerResetAdvantage`: post-filter adopted
   activeMatches/completedMatches via isForeignClubMatch, AND/OR skip adoption
   entirely when `server.clubUUID !== local.clubUUID` (club-identity gate —
   verify server.clubUUID trustworthiness first).
6. `useClubData.ts:320-333` restoreFromCache: filter cached match arrays by
   isForeignClubMatch(m.club, meta.clubUUID) before Object.assign.

### P2 — Ambiguous-clubUUID hardening (careful — commutativity constraint)
7. `matchmaking.ts:2422-2427` mergeClubUUID='': on local.clubUUID !==
   server.clubUUID (both non-empty), instead of keep-all, prefer the UUID of the
   side whose matches are predominantly stamped that way — MUST preserve merge
   commutativity (A∪B == B∪A). Alternative safer v1: leave as keep-all but LOG
   the ambiguity for forensics. Decide in debate.

### P3 — Deferred / out of scope
8. completedMatchIds namespacing, actionLogs/players/queues club stamps —
   schema changes, defer (bounded impact / shared-by-design).
9. Server-side Directus enforcement — appState is opaque JSON; defer unless a
   cheap flow-level guard exists.
10. Enforce-helper pre-filtering (gcTombstones etc.) — only if P0-P2 land and
    residual leaks observed.

## Open questions for debate
- Q1: Is preserving `match.club` on completion (P0.1) safe? Any legit flow that
  RELIES on re-stamping to viewing club (e.g., match transferred between clubs,
  openplay inheriting last club)?
- Q2: Drop vs reorder the two backfills (P0.2/P0.3)? Impact on legit unstamped
  matches' club attribution for DUPR export/stats?
- Q3: mergeClubUUID='' — keep-all+log vs prefer-dominant-stamp vs quarantine?
  Commutativity is a hard constraint (mergeAppState must be symmetric).
- Q4: Reset-advantage — club-identity gate (skip whole adoption on mismatch) vs
  post-filter only the match arrays? Which is safer given wholesale-replace?
- Q5: Is there a SINGLE chokepoint (sanitize-on-adopt) that covers B1+B2+B3
  more safely than 3 separate guards? Or do the paths diverge too much?
- Q6: Anything in this plan that could BREAK legit sync (false-positive foreign
  detection dropping real matches)? This is the top risk — a wrong filter loses
  real data.
