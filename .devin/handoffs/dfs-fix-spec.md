# draftNextMatches DFS Fix — Consolidated Spec (4-agent debate, 2 rounds)

**Status**: AGREED — implement against this doc. Debate papers: D1 algo, D2 skeptic, D3 research, D4 guardian (all Round-2 positions converged).

## What the debate proved

- **NOT a "seconds freeze" on legal data** — caps (`MAX_AVOIDS_PER_PLAYER=1`, incoming≤50%) keep avoid graphs sparse; strict pass finds conflict-free 4-sets in ~O(N) nodes. Skeptic's bound (~60-200ms) stands for legal inputs.
- **Real correctness bug (deterministic, no timing needed)**: `visited` counter is SHARED across both passes, all `pickUnits` calls, and all while-loop iterations (`matchmaking.ts:1177,1185`). Strict-pass exhaustion → relaxed starves → `pickUnits` null → `draftBlockers` = EVERY avoid edge in pool (false blockers) → `break` → **0 matches on a draftable queue**. Repro: clique-avoid fixture where only splittable combo sits at lexicographic tail (~184k UNSAT leaves precede it).
- **Reachability**: `mergeAppState` copies `avoids` wholesale via `avoidUpdatedAt` LWW (`:1995-1998,:2082-2085`) with NO cap re-validation; `loadState()`/LocalStorage same. Dense avoids are reachable via sync/legacy — write-path caps don't cover them.
- **`canSplitTeams` is NOT the exponential risk today** — depth ≤4 units (needed∈{2,4}) → ≤16 leaves. Its cost is per-call setup+allocations (~20-35 objects/leaf × up to 200k leaves = GC churn) + it becomes real exponential only if synced `teamSize>2` (unvalidated).
- **Determinism is the hard contract**: DFS returns lexicographically-max valid subset; pinned specs assert EXACT drafted sets. Wall-clock budgets REJECTED (device-dependent picks → multi-admin divergence). All budgets = deterministic node/work counters.

## Implementation checklist (in order)

### 1. FAILING REPRO SPEC FIRST
Add to `matchmaking.spec.ts` — algo's clique fixture (48 singles, A-clique p0-39 + B-clique p40-47 + bipartite edges; only splittable combo = {p24,p25,p46,p47} at lexicographic tail). Assert post-fix: `activeMatches.length===1`, `blockers===[]`, drafted set exactly `['p24','p25','p46','p47']`. Direct `state.players[].avoids` writes simulate merged/legacy data (bypass `setPlayerAvoid` caps — cite mergeAppState lines in comment). **Must fail on current code** (0 matches + huge blockers today).

### 2. UNIT-CONFLICT BITMASK (Fix A — pre-approved, needs golden-master)
Per `pickUnits` call, precompute ONCE:
- `unitOfName`: Map<username, unitIndex> over `list`
- `nbrs: Set<number>[]` or bitmask words — SYMMETRIZED (union of both directions; `avoidPairs` is outgoing-only per member but `matchConflicts` checks both ways — Trap 1)
- Dead targets (not in `unitOfName`) → non-neighbor. Self-edges (both endpoints same unit) → `selfBanned[i]=true`, NOT a self-loop.
- Strict include-gate: `chosen.some(c => conflict(i, idxOf(c)))` — O(|chosen|), zero allocs. **Keep `matchConflicts` for violation REPORTING** (:1207-1211 needs actual {from,to} pairs).
- `canSplitTeams` rewrite: `bannedRow` unit-level bitmask per leaf + `teamMask[2]` bitmask inner DFS O(1)/node + **pin `chosen[0]`→team0** (team labels pure symmetry, boolean-only consumer) + selfBanned unit → immediate UNSAT (matches today's both-teams-fail) + **deterministic inner node cap ~1024** (only reachable via teamSize>2 garbage; cap-hit = leaf fails, documented).
- Equivalence: identical feasible sets → identical booleans → identical first-found subset. DFS order/traversal UNCHANGED.

### 3. SUFFIX-REACHABILITY PRUNING (pre-approved, proven admissible)
`reach[i]` bitmask of sums achievable by `list[i:]` ignoring constraints (sizes only), O(n·needed) per call. Prune node iff `needed-sum ∉ reach[i]`. Constraint-free relaxation → cannot remove first-success branch (guardian+scout both proved). Add `sum+size>needed` pre-check before push. **Bitmask width guard**: JS bitwise = 32-bit; `needed>30` → fallback boolean[]/Set path (teamSize synced-unvalidated).

### 4. BUDGET REDESIGN (the correctness fix)
- Per-`attempt` node slices inside `pickUnits`: strict gets slice, **relaxed guaranteed reserved slice** (kills starvation). Per-`pickUnits`-call ceiling.
- **Global run ceiling** across whole `draftNextMatches` call (all while-iterations × pickUnits × attempts).
- **`canSplitTeams` inner assignments COUNT against budget** (guardian ruling — node counter ignoring inner loop doesn't bound the pathological case).
- Tri-state per attempt: `{found | infeasible | exhausted}`.
  - strict-exhausted → relaxed still runs (fresh slice)
  - relaxed-found → normal draft + violations (unchanged reporting)
  - exhausted → `lastDraftInfo.searchExhausted = true` (additive transient field), **NO phantom blockers** — do not dump pool avoids as blockers on exhausted path. `infeasible` (budget-unexhausted UNSAT proof) → current blocker logic stands (spec :939 must pass).
  - On exhausted: `break` while-loop, zero tombstones, players stay queued.
- NO wall-clock anywhere. Budgets deterministic.

### 5. SMALL FIXES
- **Dead-edge filter** at `makeUnit` (:1063-1067): restrict `avoidPairs` to targets in `liveUsernames` — apply consistently so all consumers see same set; do NOT touch `getPlayerAvoids`/UI display.
- **teamSize guard**: deterministic guard/clamp for absurd `state.teamSize` values at draftNextMatches entry — NEVER silently mutate the synced setting; teamSize∈{1,2} behavior bit-identical.
- **selfBanned units**: exclude from pickUnits candidate lists entirely (never draftable under either pass anyway); keep in `units` for blocker reporting (:1291-1298 scans `units`).
- `perfMeasure('draft-next-matches', ...)` wrap in `generateNewMatches` (useMatchActions.ts:377) — perfTelemetry exists.

### 6. SPECS (all required)
- Repro fixture (above) — fails pre-fix, passes post-fix
- Budget-partition spec: strict-heavy fixture → relaxed still drafts (starvation regression)
- Golden-master/equivalence: corpus of small states → identical drafted sets vs recorded old-DFS output (or property: new output === old output computed inline in test)
- Determinism: structuredClone(state) → identical teams/membership
- Dead-edge + selfBanned + teamSize-guard fixtures
- All existing 607 tests stay green UNMODIFIED (pinned exact-set specs are the regression gate)

## Explicitly OUT OF SCOPE (separate tickets)
- `mergeAppState` avoid re-validation/clamp (LWW-ambiguous — needs its own design)
- Dup-player `continue` tombstone bug (:1361-1369 — unreachable today, don't make reachable)
- PlayerPage.vue worker-ification (leaderboard follow-up — computeMatchesReplay/runClubRanking now exist)
- Async/yield refactor of draftNextMatches (API ripple, post-fix draft <0.5s worst)
- CP-SAT/DLX/DSATUR/memoization/(i,sum)-memo (all rejected by debate)
- Wall-clock budgets of ANY kind (determinism)

## Verify before reporting
`npx vitest run` full suite green · `npx vue-tsc --noEmit` clean · `npx eslint` clean on touched files. Report: repro confirmed failing pre-fix, each checklist item's status, spec count added, any deviation with justification.
