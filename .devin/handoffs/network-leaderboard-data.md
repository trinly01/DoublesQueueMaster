# Network Leaderboard — Round 1 Agent Reports

## Agent 264eb6cf — Match data contract (COMPLETE)

### DirectusCompletedMatch (src/services/playerProfile.ts:13-68)
- `match_key`, `match_id`, `match_type` ('doubles' observed)
- `team_a`/`team_b`: player objects `{username (req), userId?, name?, firstName?, lastName?, level?, rating?, avatar?, duprId?, linkedTo?}`
- `team_a_score`/`team_b_score`: **match-total only — NO per-game scores**
- `completed_at`, `started_at?`, `club` (string id OR object), `meta?` (matchmakingMode, ratingSkippedReason), `players?` junction

### Decoded-match shape — REUSE `toRankedInputs` (leaderboardCompute.ts:31-62)
```ts
RankedMatchInput = ReplayMatchInput & { matchKey?, matchmakingMode? }
ReplayMatchInput = { teamAScore, teamBScore, teamA: ReplayPlayerInput[], teamB: ReplayPlayerInput[], completedAt? }
```
Per match graph input: `{teamA:[players], teamB:[players], teamAScore, teamBScore, completedAt, matchKey?, matchmakingMode?}`
- **Winner NOT a field** — derived `teamAScore > teamBScore` (ratingReplay.ts:377); ties skipped (:371)

### Player identity / node key
- `playerIdentityKey` (ratingReplay.ts:287-291): `userId` → `username` → `guest:first|last|name`
- `rankClubPlayers` output keyed by this; sorts rating desc → ratedMatchesPlayed → winRate → wins → username
- `RankedPlayer = ReplayPlayer & {reliability, provisional, gamesToReliable, ratedMatchesPlayed}`
- `ReplayPlayer = {username, name, firstName, lastName, rating, initialRating, matchesPlayed, wins, losses, avatar}`

### Filtering & scale
- `NON_COMPETITIVE_MODES = {'variety_first','fair_balance'}` — filtered via `filterCompetitive(matches, includeNonCompetitive)` (missing meta ⇒ competitive)
- Club fetch: `club._eq`, `completed_at >= -30d`, `sort:-completed_at`, `limit:1000` (useLeaderboard.ts:81-93) → ≤1000 matches/club/30d
- Fingerprint-cached (`matchesFingerprint`) + Web Worker (`LeaderboardJob kind: 'club'|'duo'|'matches'`)

### Gaps for graph building
- No per-game scores — only match-total margin signal
- No explicit opponent list — derive as "other team" (each player faces both opponents)
- No per-player outcome attribution — W/L is team-level
- Guest identity fragile (`guest:` composite can split/collide)
- Fixed-duo exclusion (`linkedTo`/`detectFixedDuos`) is a RATING policy — network graph may want those matches INCLUDED; deliberate decision needed
- Tied matches dropped by rating replay — network may want them
- `match_type` not filtered to 'doubles' in club fetch

### Slot-in contract
To reuse `rankClubPlayers` unchanged: emit `Record<identityKey, RankedPlayer-shaped>` and let it sort — OR bypass and emit sorted array directly.

## Agent b3678051 — Algorithm research (COMPLETE, citations unverified — no web_search in scout profile)

### PICK: Personalized PageRank / score-propagation linear system
`r = (1−λ)·p + λ·Pᵀr` ≡ `r = (1−λ)(I − λPᵀ)⁻¹p` — personalized PageRank (Haveliwala WWW'02) with teleportation vector = shrunk own-performance `p_i`.

- `p_i` = normalized per-match performance (reuse ratingReplay delta or score-share), shrunk: `p_i = (n_i·perf_i + C·p̄)/(n_i + C)` — mirrors existing shrinkagePriorWeight C≈12
- `P` = row-stochastic credit-flow matrix: per match each player distributes outgoing weight to teammates (synergy) + opponents (weighted by opponent p and margin). NONNEGATIVE ONLY — "lost to strong" = low p, never negative edges (breaks stochasticity/convergence)
- λ ∈ 0.75–0.9 = single interpretable knob (network-vs-own-performance mix)

### Why it wins
- Literally implements "rank depends recursively on teammates+opponents+their performances" via stationary distribution
- Teleportation `(1−λ)p` makes chain irreducible → single comparable ranking across DISCONNECTED components (decisive vs Katz/eigenvector which produce incomparable per-component scores)
- Isolated players (0 matches): r=0 → recommend explicit "unranked" tier
- 1-match players: shrinkage prior handles noise
- Degree bias: per-match normalization of outgoing weights + column-stochastic division
- Power iteration converges to UNIQUE stationary dist regardless of init → deterministic

### Rejected
- Katz centrality: needs uniform personalization patch for disconnected graphs (extra step PageRank gets free); α < 1/ρ(A) constraint
- Eigenvector: fails on disconnected/sink nodes
- HITS: hub/authority split doesn't map to mixed teammate+opponent semantics
- SpringRank: principled runner-up — pairwise win/loss spring solver, but no native teammate credit-sharing; pick if outcome-prediction is true goal
- Colley/Massey/Elo: rating-based, excluded — but right SOURCE for p_i

### Complexity (~500 players / ~2000 matches)
- Doubles: each player links 1 teammate + 2 opponents ≈ 12k undirected / ~24k directed edges
- Power iteration O(E)≈24k mults/iter, λ=0.85 → ~100-300 iters → ~5M flops → few ms in worker
- Determinism: iterate matches in fixed order (sort by matchKey/completedAt), Map accumulation, stable keys

### Tie-break rule (publish): r desc → matchesPlayed desc → normalized name asc

### NOT COVERED
- Web verification of citations (no search tool)
- Temporal decay on edges (recencyWeight exists in codebase — could fold in)
- Multi-club graph scope; negative encodings beyond "low p" (rejected for convergence)
