# Favorite-Win Rating Suppression — Implementation Spec

## Goal
When the pre-match forecast gives one team a win probability **≥ 0.70** AND that
favorite actually wins, the match produces **no rating change** (W/L still count).
An upset (underdog wins) always rates normally. Threshold constant already added:
`SUPPRESS_FAVORITE_WIN_PROB = 0.7` in `src/services/matchmaking-core.ts` (~line 640).

## Shared suppression predicate (MUST be identical everywhere)
```
teamRating(team) = 0.6*harmonicMean + 0.4*arithmeticMean   // = computeTeamRating
P(A) = 1 / (1 + 10^((rB - rA)/400))                        // = computeWinProbability
favProb = max(P(A), 1-P(A))
favoriteIsA = P(A) >= 0.5
aWon = teamAScore > teamBScore
SUPPRESS = (favProb >= 0.70) && (favoriteIsA === aWon)
```
Use the **stored/pre-match player ratings** (`p.rating` / `teamX[].rating`), NOT any
evolving replay rating state. `computeWinProbability(teamA, teamB)` already returns
`{teamA, teamB}` probabilities and is exported from `matchmaking-core.ts`.

## New meta value
`ratingSkippedReason` gains `'favorite_win_suppressed'` (union currently
`'unrated_mode' | 'unlinked_players'`). `ratingApplied` becomes `false` when
suppressed. Reason priority when ratingApplied=false:
`unrated_mode` > `favorite_win_suppressed` > `unlinked_players`.

## Agent A — LIVE PATH + TYPES + DISPLAY
Files (own these; do NOT touch ratingReplay.ts / leaderboardCompute.ts):
- `src/services/matchmaking.ts` — in `reportMatchScore` (~line 1647-1690):
  - import `computeWinProbability` + `SUPPRESS_FAVORITE_WIN_PROB` from './matchmaking-core'
  - after `isNonCompetitive`/`allLinked` computed, compute suppression via
    `computeWinProbability(teamA, teamB)` on the still-unshifted player ratings
    (teamA/teamB hydrated at ~1614-1615; teamAWon at 1617).
  - `ratingApplied = !isNonCompetitive && allLinked && !suppressed`
  - `ratingSkippedReason`: unrated_mode if isNonCompetitive; else
    'favorite_win_suppressed' if suppressed; else 'unlinked_players' if !allLinked.
    (suppressed should take precedence over unlinked_players — a blowout moves
    nobody's rating, guests included.)
  - `calculateShift(..., applyRatingChange)` 4th arg: currently `!isNonCompetitive`.
    Change to `!isNonCompetitive && !suppressed` → uses the existing
    applyRatingChange=false branch (counts matchesPlayed/wins/losses, skips rating
    + ratingUpdatedAt). This also correctly suppresses guest local ratings.
  - The `revertLinked` block (~1679) is a harmless no-op when suppressed (no shift
    produced); may add `&& !suppressed` for clarity but not required.
- `src/types/matchMeta.ts` — add `'favorite_win_suppressed'` to the union.
- `src/components/MatchCard.vue` (~line 375) — same union on the Match prop type.
- `src/components/MatchMetaChips.vue` (~140-147) — add tooltip branch:
  `ratingSkippedReason === 'favorite_win_suppressed'` → e.g. "Favorite won by a
  wide margin — rating unchanged." (chip already renders on ratingApplied===false).
- `src/pages/ClubPage.vue` (~2109-2113) — widen the inline
  `ratingSkippedReason` union type to include the new value.
- Tests: extend `src/services/matchmaking.spec.ts` (or nearest spec) — cover:
  70/30 favorite wins → no rating delta but W/L counted + meta stamped;
  same matchup underdog wins (upset) → normal rating delta;
  <70% favorite wins → normal rating; non-competitive mode unaffected;
  suppressed match sets ratingApplied=false + correct reason.

## Agent B — REPLAY / LEADERBOARD PATH
Files (own these; do NOT touch matchmaking.ts / matchMeta.ts / components):
- `src/utils/ratingReplay.ts` — add suppression to BOTH replay paths using the
  STORED pre-match ratings on `m.teamA`/`m.teamB` (ReplayPlayerInput.rating) and the
  match winner — recompute via `computeWinProbability` imported from
  `./matchmaking-core` (or `../services/matchmaking-core`; it's pure TS). Do NOT use
  the evolving replay rating state — must be deterministic across all ranking passes.
  - `replayRankingPass` (~line 388): fold suppression into the skip condition so a
    suppressed match counts `matchesPlayed`+`wins`/`losses` and recomputes
    reliability, but does NOT touch `rating` or `ratedMatchesPlayed` — mirror the
    existing `isNonCompetitive` W/L-only block (388-411). Cleanest: compute
    `isSuppressed` and treat like the unrated branch.
  - `replayMatches` (legacy ~line 205-238): ReplayPlayer has NO ratedMatchesPlayed;
    add a branch that increments matchesPlayed/wins/losses but skips the rating
    update (the rated path at ~221-230 currently does both together — split it).
  - Check for `src/utils/ratingReplay.legacy.ts` or similar duplicate and apply the
    same change if it's live (not dead code).
  - `includeNonCompetitive` interaction: suppression applies to competitive matches;
    when includeNonCompetitive=true the match is treated as rated — suppression
    should still apply (it's about imbalance, not mode). Decide + document.
- `src/utils/leaderboardCompute.ts` — only if needed to pass stored ratings through
  (scout says teamA/teamB[].rating already reach replay inputs; verify, change only
  if a rating is being stripped).
- Tests: extend `src/utils/ratingReplay.spec.ts` — cover: favorite-win at >=0.70
  suppressed (rating flat, W/L counted, ratedMatchesPlayed NOT incremented) in both
  replayMatches and replayMatchesForRanking; upset counts normally; <0.70 rated.

## Backend flow (handled separately by orchestrator — NOT in agent scope)
Directus `save completed match` flow op `script transform match` (77006b79) will be
patched to return `newPlayersRatings=[]` for suppressed matches. Agents do NOT touch
backend_schema_flows/ or live Directus.

## Verification (orchestrator runs after both agents)
`npm run lint`, `npm run typecheck`, `npm test`, `npm run build` (Node 24), rebuild docs/.
