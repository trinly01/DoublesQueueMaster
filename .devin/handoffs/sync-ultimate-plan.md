# Sync Ultimate Plan — Multi-Agent Debate Synthesis

Date: 2026-11-19. Status: PLAN (debate complete, awaiting implementation go-ahead).

## Context

Dirty-unit tracking shipped (`a5b376b`): only genuinely-edited AppState units
compete in `mergeAppState`'s client-clock LWW at the PUSH merge; clean units
adopt server wholesale. Question debated: is the "ultimate" commit-anchored
ordering needed now, and what's the right next step?

## Debate participants (4 Round-1 + 2 Round-2 resumes)

- Commit-anchored design (feasibility) → produced full design, confirmed hard
- Residual-risk analyst → build-later
- Alternatives researcher → initially server-clock stamping, CONCEDED to defer
- Skeptic red-team → don't build rewrite; cheapest gap-closures

## UNANIMOUS CONVERGENCE

1. **Commit-anchored entity stamps = correct end-state, WRONG next step.**
   mergeAppState ~117 timestamp sites, semantic event-times (deletedAt/
   completedAt/queuedAt/startedAt) are BOTH data AND LWW tokens — can't cleanly
   re-key; mixed-version fleet diverges during rollout; blast radius = every
   device's ratings/leaderboards/duo. Defer until a real incident demands it.

2. **Server-clock stamping = REJECTED (both debaters conceded).** Same
   over-engineering class as commit-anchoring but BIGGER blast radius: ~60-80
   synced-state stamp sites need semantic-vs-recency classification; HTTP Date
   is 1s-granular; offline rebase falsely orders stale edits as newest; the
   existing 5-min `clampFuture` already neutralizes the catastrophic
   future-stamp direction. Commit-anchoring supersedes it if ever needed.

3. **Read-path bypass is THE remaining hole worth fixing now.** Inbound
   merges (`applyServerMatchmaking` privileged-dirty ~useCloudSync.ts:1051,
   `useClubData` mergeEligible ~778/785) run plain `mergeWithResetAdvantage`
   with no dirty tracking → stale can win, get laundered into state, then a
   later push that skips `mergeForPush` (timestamps match) propagates it.
   Cheaply closable by reusing shipped machinery.

## THE PLAN

### P0 — Close the read-path hole (~½ day, DO FIRST)
Apply dirty-tracking to inbound merges, reusing existing exports:
`loadBaseline` / `computeDirtyUnits` / `buildLocalForMerge` /
`refreshBaselineAfterMerge` / `saveBaseline`.

- Sites: `useCloudSync.ts` applyServerMatchmaking privileged-dirty branch
  (~1051) and `useClubData.ts` mergeEligible block (~778/785).
- **CRITICAL correctness detail**: use `refreshBaselineAfterMerge`, NOT
  `captureBaseline`, after inbound merges — otherwise genuine pending local
  edits get falsely marked synced and are LOST on next push. The dirty set
  is the owed-to-server set.
- `baseline === null` → all dirty → byte-identical to today (safe fallback).
- Perf: one extra O(state) fingerprint per inbound merge — same order as
  existing collectionEqual stringifies. Acceptable.
- Read-side for NON-privileged/clean devices stays unchanged (server-wins).

### P1 — Per-entity granularity for match collections (OPTIONAL, later)
Extend fingerprintUnits/buildLocalForMerge to `coll:<name>:<entityKey>`
(queue→username, matches→matchId). Confines LWW to edited entities. Only if
collection-granularity bugs are observed. ~1-2 days, array-surgery fiddly.

### DEFER — Commit-anchored entity stamps (documented end-state)
Embedded `prov={c:commitTs,s:localSeq}` per entity + settings/checkpoint
sidecar; merge compares commit-order then local-seq then content-tiebreak.
Design captured in agent report (commit-anchored-design). Revisit on: real
same-field concurrent-edit incident, admin count growth, or per-entity sync.

### REJECTED — server-clock stamping, version vectors, CRDT, write-lease,
server-merge-endpoint. Cost/benefit unfavorable for this app's scale.

## Residuals accepted (document, don't fix now)
- Dirty-vs-dirty same-field client-clock LWW (rare × low-blast-radius;
  5-min clamp covers catastrophic direction)
- Fingerprint-neutral reset edge (narrow)
- Whole-collection granularity until P1

## Verification for P0
lint, typecheck, vitest (extend useCloudSync/useClubData specs: inbound
merge re-baselines clean units, preserves dirty pending edits), rebuild
docs/, commit, push.
