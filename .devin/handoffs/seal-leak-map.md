# Contamination Seal — Round 1 Leak-Path Map

Goal: seal every remaining path by which a foreign-club match enters / persists /
re-propagates inside a club's `appState`. Predicate under test:
`isForeignClubMatch(matchClub, currentClubUUID)` — true ONLY when both non-empty
and `matchClub !== currentClubUUID` (matchmaking-core.ts:329-336). Conservative:
unstamped matches and empty clubUUID are always KEPT.

## The three failure layers (root insight)

- **A. Provenance ambiguity** — unstamped matches + `mergeClubUUID=''` (when
  local.clubUUID !== server.clubUUID) + clubUUID='' windows (resetState:604,
  constructor:159, club-leave ClubPage:2910, openplay) → matches that can NEVER
  be proven foreign → kept forever.
- **B. Unguarded adoption paths** — three paths bypass `mergeAppState`'s
  isForeignClubMatch filter entirely (overwrite, reset-advantage adopt,
  cache-restore).
- **C. Provenance destruction (most insidious)** — backfills + completion
  re-stamp LAUNDER foreign matches into the current club's UUID, after which NO
  filter can ever detect them again.

## Confirmed unguarded / porous paths

### B1. Server-wins overwrite — useClubData.ts:905-926 (HIGH)
Non-privileged AND clean-privileged devices copy `serverMatchmaking.activeMatches/
completedMatches/completedMatchIds/actionLogs` verbatim (shallow `[...arr]`).
`isForeignClubMatch`/`mergeClubUUID` NOT imported in this file. mergeAppState's
filter only protects DIRTY privileged devices. Leak: any foreign match in the
server blob is adopted, rendered, written to per-club LS cache.
Fix: run both match arrays through isForeignClubMatch before assign, or route
through mergeAppState.

### B2. applyServerResetAdvantage — cloudSyncHelpers.ts:432-469 (HIGH)
Wholesale replaces merged.players/queues/activeMatches/completedMatches/
actionLogs with server.* when a reset checkpoint advantage flags. ZERO club
scoping. Called AFTER mergeAppState in mergeWithResetAdvantage (useCloudSync
:224-228) and directly on live state (useClubData:848-853). Foreign-stamped
matches adopted unfiltered. ALSO detectServerResetAdvantage (:386-407) is
club-blind — a foreign blob with higher checkpoints flags ALL collections.
Secondary poison: adopted foreign checkpoints make victim's own entities look
pre-checkpoint → purged on next merge (delayed wipe). completedMatchIds adopted
un-namespaced (:451-453) → foreign ids pollute tombstone classification.
Fix: gate on server.clubUUID===local.clubUUID before detection+adoption, and/or
post-filter adopted match arrays via isForeignClubMatch.

### B3. restoreFromCache — useClubData.ts:320-333 (MED)
`Object.assign(MatchmakingApp.state, cachedState)` verbatim on every load,
before network fetch. Once foreign matches enter the per-club LS cache they are
restored indefinitely. Fix: filter cachedState match arrays by
isForeignClubMatch(m.club, meta.clubUUID) before assign.

### C1. completedMatches club backfill — TWO sites (HIGH, root enabler)
- useClubData.ts:1026-1032: `if (!m.club) m.club = currentClubUUID` runs on BOTH
  paths → unstamped foreign match permanently stamped club=A → unprovable forever.
- useCloudSync.ts:614-619: backfills BEFORE keep() filter (:629-635) →
  stamped-then-passed → pushed into club A's row.
Asymmetry: activeMatches get NO backfill (stay unstamped, pass keep()).
Spec (club-contamination-fix-spec.md) explicitly listed backfill as a NON-GOAL
"because it skips non-empty foreign stamps" — but it does NOT skip UNSTAMPED
foreign matches; it launders them.
Fix: reorder filter-before-backfill, or drop backfill entirely (unstamped passes
the predicate regardless → backfill buys nothing for legit matches either).

### C2. Completion re-stamp discards provenance — matchmaking.ts:1807 (HIGH)
`completedMatch.club = this.state.clubUUID || ''` — stamps the VIEWING club,
discarding `match.club` (the active match's own provenance). A foreign match
scored in the wrong club context is permanently re-attributed to that club;
push sanitizer then sees it as legitimate. Paired with :1896 tombstone.
Fix: preserve `match.club` on completion (fall back to state.clubUUID only when
match.club empty), and/or refuse to score when isForeignClubMatch(match.club,
state.clubUUID).

### A1. mergeClubUUID='' ambiguity — matchmaking.ts:2422-2427 (HIGH)
`local.clubUUID || server.clubUUID`, but '' when both non-empty and DIFFER
(deliberate, for merge commutativity). Empty → isForeignClubMatch always false →
ALL matches kept incl. provably foreign. useClubData force-sets
state.clubUUID=club.id (:627) but never compares serverMatchmaking.clubUUID.
Fix: on ambiguous-differ, prefer server-stamped UUID or side with more stamped
matches (verify commutativity); or quarantine.

### D1. Push-path residue — useCloudSync.ts:629-651 (MED)
Payload copy filters activeMatches+completedMatches via isForeignClubMatch, but:
- completedMatchIds + actionLogs pass through `...state` unfiltered
- unstamped foreign matches pushed (backfill C1 pre-launders completedMatches)
- live state keeps foreign matches (only payload copy is clean) → they persist
  locally and re-contaminate on next restoreFromCache
Fix: sanitize state match arrays themselves before push (not just payload copy);
namespace or intersect completedMatchIds with kept completedMatches.

### E1. Unguarded entity types (schema limitation, LOW-MED)
- completedMatchIds: flat string ids, no club field — foreign ids union in
  (matchmaking.ts:2703-2709), bounded by cap 2000.
- actionLogs, players, queues: NO club stamp exists → entirely unguarded by this
  mechanism. players/queues are legitimately shared (multi-club members) so this
  may be by-design; actionLogs is audit-trail pollution.

### F1. Enforce helpers act on unfiltered state (MED, downstream)
matchmaking-core gcTombstones (:388), enforceOneMatchPerPlayerOnState (:407),
enforceOneMatchPerCourtOnState (:479), enforceConcurrencyLimitOnState (:552) — no
club check; if foreign matches leak in unstamped they get tombstoned AND push
foreign usernames into local queue. Relies entirely on merge-boundary filtering.

## Cross-club SCORING (roles scout — separate but related)
- Role is strictly per-club (club.players/admins/moderators M2M junctions).
- Only scoring gate = canManageSession (admin‖moderator of VIEWED club), UI-only.
- reportMatchScore has ZERO role/membership validation; scoredBy is a label.
- completedMatch.club stamped from state.clubUUID (viewing club) — see C2.
- Dual-club admin scoring into "wrong" club is authorized-but-misattributed:
  no rule binds a match to a club beyond the stamp. Backend enforces nothing
  role-wise (CAS on date_updated only). → primarily a frontend provenance fix.

## Debate axes for Round 2
1. WHERE to enforce: boundary-filter each path (A) vs single chokepoint/sanitize
   funnel (B) vs server-side Directus (C).
2. Unstamped-match policy: conservative-keep (current, safe but leaks) vs
   quarantine-vs-club-context vs stamp-on-create-everywhere.
3. mergeClubUUID='' ambiguous-differ: keep-all (current) vs prefer-one-side vs
   quarantine — must preserve merge commutativity.
4. Whether to fix C1/C2 (provenance destruction) FIRST since it disables all
   downstream filters, or guard B-paths first since they're the active leaks.
5. Reset-advantage: club-identity gate (skip adoption on mismatch) vs post-filter
   adopted arrays — which is safer given wholesale replace semantics.
