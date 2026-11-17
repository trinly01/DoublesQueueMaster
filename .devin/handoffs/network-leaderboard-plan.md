# Network-Based Club Leaderboard — Implementation Plan (Round-2 updated)

## Goal
Club leaderboard tab ranks players by **network position** (who they play with/against and those players' performances), NOT rating, NOT wins/losses. Data: completed matches only — team composition + match-total scores.

## Algorithm: Personalized PageRank — `r = (1−λ)·p + λ·Pᵀr`
Jacobi power iteration, init `r₀ = p̃`, stop `max|Δr| < 1e-10` or 500 iters. **λ = 0.8** (not 0.85 — dense-club flattening: in near-complete graphs Pᵀr≈r̄ degenerates to `r_i ≈ λp̄ + (1−λ)p_i`; 0.8 keeps ~20% own-performance weight).

### p_i — own performance (Round-2 ruled: outcome-gated margin, NOT Elo, NOT raw score-share)
Per match for player i: `μ = (sF − sA)/(sF + sA)` ∈ (−1,1) where sF=own team score, sA=opp score.
- win: `perf = 1 + 0.25μ` → [1, 1.25]
- tie: `perf = 0.5`
- loss: `perf = 0.25·(−μ)` → [0, 0.25]
Outcome classes never overlap; margin modulates within class only. (Raw score-share rejected: 10-9 loss outscores 21-19 win.)
- Shrink: `p̃_i = (n_i·meanPerf_i + C·p̄)/(n_i + C)`, **C=12**, target = club mean `p̄` (NOT zero — zero amplifies noise). p is opponent-blind BY DESIGN: p=what you did, Pᵀr=who you did it with.

### P — credit-flow matrix (Round-2 ruled: structural symmetric equal-share ONLY)
- Per match: every co-participant pair (within-team AND cross-team) gets edge weight `1/(teamSizeA + teamSizeB − 1)` per player, accumulated BOTH directions → W symmetric. 2v2 → each player: 1 teammate + 2 opponents at 1/3 each.
- Row-normalize: `P_{ij} = W_{ij} / Σ_k W_{ik}`.
- REJECTED: weighting by opponent's p_j (double-counts quality — r_j handles it in iteration); margin-weighted edges (ambiguous sign, margin lives in p); teammate≠opponent weights (no evidence, one constant to change later).
- Volume-farming defense: row-normalization makes P_{ji} = fraction of j's connection-mix → replaying same opponent doesn't grow share of their vote. Residual in-degree bias accepted ("more evidence = more exposure").
- KNOWN LIMIT (document in tooltip): closed weak clique self-consistent high rank — ranks within observed network, not absolute skill.

### Matches included
ALL matches in fetched set build edges — fixed-duos, ties, non-competitive (per includeNonCompetitive toggle) are real connections; rating-policy exclusions don't apply. Degenerate matches (`tA<2 || tB<2`, empty teams, duplicate identity keys within a side) skipped. Ties: perf=0.5 AND edges built (deliberate divergence from ratingReplay.ts:371 which drops ties — comment it).

### Ranking & output
Sort: `r` desc → matchesPlayed desc → normalized name asc. Isolated players (0 matches): provisional tier (dash rank). Determinism: accumulate W iterating matches sorted by `matchKey` then `completedAt`; Jacobi init-independent.

## Data path
Reuse `toRankedInputs(matches)` → `RankedMatchInput`. Match set = existing club fetch (club._eq, 30d, limit 1000). Identity = `playerIdentityKey`.

## Integration
- New worker job `'network'` + `computeNetworkRanked` (new file `src/utils/networkRanking.ts` — pure, unit-testable) + `runNetworkRanking` wrapper. Do NOT touch `computeClubRanked` (feeds Global tab too).
- `useLeaderboard.fetchClubLeaderboard`: club tab → `runNetworkRanking`; **bump LS key `club_leaderboard_v2`→`v3`** (fingerprint doesn't version algorithm).
- Map → `ClubLeaderboardEntry`: `score` = scaled centrality int; keep games/wins/losses caption; `rating` for avatar color only; `provisional`/`reliability`/`gamesToReliable` → network semantics (<N matches or isolated → provisional).
- `LeaderboardDialog.vue`: club-tab-only chip label/tooltip ("Network" score, not Elo); guard shared row template with `leaderboardTab==='club'`; rewrite help tooltip; check `hideInternalRating`/`ratingColor` treatment of centrality score.

## Verification
- `networkRanking.spec.ts`: chain/star/disconnected/isolated/tie/degenerate-match cases; determinism (same input→same output); the two Q4 sanity graphs (K4 → A>B=C>D; star → X top, victims compressed-fair).
- Update `useLeaderboard.spec.ts` club-tab assertions; `leaderboardCompute.spec.ts` untouched.
- lint / typecheck / vitest / build docs/ → commit + push.

## Round-2 red-team findings
(pending — agent 0e4f881a)

## Round-2 red-team amendments (VERDICT: ship-with-changes)
- P normalization: accumulate raw credit A_ij across ALL matches, then P_ij = A_ij/Σ_k A_ik ONCE per player (global row-normalize). Zero-out rows allowed (teleport covers).
- `rating` field: populate from latest match-embedded player.rating snapshot per identity key.
- Identity guard: dedupe keys within each team; SKIP match if teamA ∩ teamB ≠ ∅ (guest-name collisions).
- Worker: explicit 'network' branch in ternary chain BEFORE else; export playerIdentityKey from ratingReplay.ts.
- Chip: club-tab-only neutral color + "Network" label/tooltip; check showRatingChip/hideInternalRating semantics.
- Match order inside compute: sort completedAt→matchKey (precedent ratingReplay.ts:474-481).
- Ties: count in matchesPlayed, NOT in wins/losses; winRate = wins/(wins+losses) decisive-only (0 if none).
- Team-size agnostic: edges = all within-team + all cross-team pairs, weight 1/(tA+tB−1) per player.
- Provisional: matchesPlayed < 3 OR zero graph edges → dash rank.
- Score display: normalize r → 0-100 scale ("% of network score") — finalize vs ratingChipText signature at impl.
- p_i clamped nonnegative (formula guarantees; enforce anyway).
