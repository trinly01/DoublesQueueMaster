# Rating Update Pipeline

How a completed match turns into a rating change — and when it deliberately doesn't.

## The rule

A match updates **persisted ratings** only when ALL of these hold:

| Gate | Where enforced |
|---|---|
| Mode is rated — Standard (`balanced_variety`), Competitive (`balance_first`), or Pro Pick (`strict_balance`) | Frontend + backend flow |
| Score is decisive (no tie) | Frontend `completeMatch` blocks ties before submission; flow re-checks |
| **Every** player has a linked account (`userId`) | Frontend + backend flow |

Casual (`fair_balance`) and Social (`variety_first`) never update ratings — in
any layer. A match with even one guest/manual player produces **no** rating
writes for anyone — linked players are never partially updated. In all cases
the completed match itself is still saved.

## The layers

```
score entry → reportMatchScore (local state)
            → cloud sync → save-completed-match flow
            → directus_users.rating (LWW, via rating_updated_at)
```

### Frontend (`src/services/matchmaking.ts` → `reportMatchScore`)

Runs `RatingEngine.calculateShift` for every completed match:

- **Unrated mode** → `applyRatingChange=false`: wins/losses/matchesPlayed
  increment, ratings untouched.
- **Rated mode, all linked** → full local shift. The flow will persist the
  same result to `directus_users`.
- **Rated mode, mixed (≥1 unlinked player)** → guests keep the local shift
  (a guest's local rating is the only rating they have — it feeds
  matchmaking), but linked players' `rating`/`ratingUpdatedAt` are reverted
  to pre-match values. Without this revert the scoring device would hold a
  "phantom" rating newer than `directus_users`, diverging from every other
  device until the player's next officially-rated match.

The completed-match record stores the outcome in `meta`:

```ts
meta.ratingApplied:        boolean
meta.ratingSkippedReason:  'unrated_mode' | 'unlinked_players'  // when false
```

This flows through to the backend record unchanged (`meta` is passed
through), so the reason is inspectable anywhere the match is viewed.

### Backend (Directus flow `daa0ffa5`, run-script op `77006b79`)

Same gates, same constants, same allocation math. Returns:

- `completedMatch` — **always** built and saved (score, teams, `meta`).
- `newPlayersRatings` — `[]` when any gate fails, so the downstream
  update-users step no-ops.

`directus_users.rating` is only written by this flow. The frontend never
PATCHes ratings; devices adopt them via LWW on `rating_updated_at`
(`mergePlayerFromDB`).

## Admin-facing signals

| Surface | Signal |
|---|---|
| Score-entry dialog (`MatchResultDialog`) | Amber banner: "Ratings won't update — \<names\> have no linked account. Guests still get local rating movement." Grey banner on Casual/Social: "…mode doesn't update ratings." |
| Completed-match card (`MatchMetaChips`) | Grey `Unrated` chip; tooltip states the reason (unlinked players vs. unrated mode) |

## Leaderboard exclusion: fixed-duo matches

Replays (`replayMatches`, `replayMatchesForRanking` — club leaderboard,
profile "Computed (30d)") skip any match containing a player with
`linkedTo` set — a declared fixed-duo pairing isn't rotating-partner
evidence. `linkedTo` is snapshotted into `CompletedMatchPlayer` at report
time so the exclusion survives session resets and DB fetches; matches
completed before this existed (no `linkedTo` on record) count normally.
The **Best Duos** tab is unaffected — it reads raw match inputs and is
literally about duo results.

### Undeclared fixed duos (pattern detection)

`linkedTo` only catches pairs that declared themselves. `detectFixedDuos`
(`src/utils/duoStats.ts`) additionally scans the replayed match set for
pairs that *behave* like a fixed duo, and replay excludes their matches
the same way. Detection is deterministic — same match list → same flags
on every device — and applies identically to club leaderboard, global
leaderboard, and profile computed ratings.

A pair is flagged at ≥4 games together when EITHER:

- **Concentration** — mutual top partners AND each member spent ≥50% of
  their games with the other, OR
- **Corroborated lower share** — ≥40% share one direction AND one of:
  - *persistence* — paired on ≥2 distinct days
  - *carry* — intra-pair rating gap ≥200 AND the weaker member's win rate
    with the partner is ≥15pts above their win rate without them
  - *monoculture* — ≥60% of the pair's games vs the same opposing pair

Thresholds live in `DUO_DETECT`. Only 2v2 matches feed detection (singles
have no partner). Partners are keyed by `duoPlayerKey` — the same
userId/username/guest identity used by the replay, so flags line up with
replayed participants.

### Global leaderboard: registered-only matches

The global board (PlayerPage + ClubPage global tab) additionally drops any
match containing a player without `userId` before replay — mirroring the
backend rule that mixed/guest matches never write `directus_users`
ratings. Replayed global ratings therefore move only on matches that were
actually rated. Club-level boards still include guest matches (the club
leaderboard is a local board where guests legitimately appear).

## Constants (shared)

`K=64` doubles / `36` singles · margin `0.15·log(1+margin)` · partner-gap
factor `0.5` · underdog loss blend `1.0` · floor `100` · max partner
allocation ratio `2.0`.
