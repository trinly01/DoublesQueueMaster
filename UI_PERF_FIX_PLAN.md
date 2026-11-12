# UI Performance Fix Plan — ClubPage Jank

**Date**: 2026-01 · **Method**: 6-agent audit → 5-agent debate (2 rounds, cross-examined) · **Status**: AGREED — ready to implement
**Inputs**: `UI_PERF_AUDIT.md` + 6 handoffs (`ui-perf-*.md`) + research (`ui-perf-research-round2.md`)

---

## Debate outcome

All four position camps converged after Round-2 cross-examination. The skeptic's "magnitudes unproven" attack successfully demoted speculative architecture to profile-gated, while proven-mechanism cheap fixes ship immediately. **No unresolved disagreements.**

### Rejected by consensus
| Proposal | Why rejected |
|---|---|
| `shallowReactive`/`markRaw` on collections | ~200+ in-place entity mutation sites silently stop propagating → stale-UI bug class; doesn't fix actual disease (churn = computeds spreading + whole-collection replacement). Two agents independently verified. |
| Vue Vapor Mode (3.6 RC) | Unstable RC, Quasar compat risk — revisit post-stable |
| Yjs/CRDT delta-sync | Wrong tool — LWW+CAS already solves their problem; phase-2 ceiling only |
| `Object.freeze` on items | Contradicts in-place mutation idiom |
| Per-entity `applyMergedState` | **Demoted to profile-gated** — skeptic verified reset contract is collection-granular (`applyServerResetAdvantage`); array patching degenerates to full rewrite anyway |
| `q-virtual-scroll` (all lists) | Players/queue/active = NO (interactive rows, popup issues, small n). Completed-500 = deferred until profiling |
| Drop `keep-alive` | Was a *deliberate* fix for remount cost; prop-stability may make hidden panels cheap anyway — measure first |
| `v-memo` primary | Dep-array omission → stale rows; >1000-item tool, our rows are 100-500 |

---

## PR-A — Instrumentation + zero-risk fixes (ship first)

**Goal**: capture before/after metrics in the same release so PR-B/C effects are measurable.

| # | Fix | File | Effort |
|---|---|---|---|
| A1 | **Instrumentation bundle**: `PerformanceObserver({entryTypes:['longtask']})` + `performance.mark/measure` around `applyServerMatchmaking`/`saveState`/`performCloudSync` + `app.config.performance=true` (dev) | new `src/utils/perfTelemetry.ts` + wire into useCloudSync/matchmaking | ~½ day |
| A2 | **Strip console.log sites**: `useCloudSync.ts:905,685-696,841-846` (full appState blob per WS msg!), `ClubPage.vue:2863-2870,2935-2950` (clubMembers in computeds) — keep warn/error | those files | ~1h |
| A3 | **`toRaw` both sides** in `collectionEqual` (`cloudSyncHelpers.ts:299,312`) — restores merge fast-path (privileged+dirty path only, but 2 lines) | cloudSyncHelpers | 2 lines |
| A4 | **Vue/Quasar patch bump**: lockfile `vue 3.5.12→3.5.44`, `quasar 2.17.0→2.18.6` — free scheduler/reactivity fixes (#15757/#15143/#15105) | package.json/lock | ~30min + test |
| A5 | **`persist()` gate** (`useClubData.ts:997`): `persistSilently()` when player-merge changed nothing (reuse `mergePlayerFromDB` `{changed}` flag) — kills guaranteed admin push-per-mount/focus/resume | useClubData | ~1h |

## PR-B — Sync layer (after A lands)

| # | Fix | Detail | Effort |
|---|---|---|---|
| B1 | **Newest-wins coalescing** in realtime handler (`useCloudSync.ts:880-925`): buffer WS payloads, keep **max `lastModified`** (NOT last-arrived — echo edge case proven by sync agent), flush on ~50ms trailing timer + immediate on `pagehide`/`visibilitychange`. Per-message `handleRealtimeRoleFields` runs BEFORE buffering; `lastRealtimeMessageAt` stamps on RECEIPT. Lossless proven: snapshots supersede, `Math.max` monotonicity guards | useCloudSync | ~½ day |
| B2 | **CAS slim probe** (`useCloudSync.ts:203-223,369-442`): probe fields → `['date_updated', 'json(appState,matchmaking.lastModified)']`; full `readServerMatchmaking()` only on ts-mismatch. Removes 1-2 full-blob reads per push | useCloudSync | ~2h |
| B3 | **dupr_submission throttle** (`useDupr.ts:285-289`): ~750ms leading+trailing (NOT debounce — starvation under bursts) | useDupr | ~30min |

## PR-C — Render layer (parallel-safe with B, different files mostly)

| # | Fix | Detail | Effort |
|---|---|---|---|
| C1 | **`:meta` hoist into view-models** (`ClubPage.vue:768-786,1386-1404`; `MatchCard.vue:207-223`): move inline object literal + `getDuprStatus/getDuprError` into `matches`/`cancelledMatches`/`completedMatchViewModels` computeds → stable identity → `shouldUpdateComponent` bailout. ~30 lines, proven mechanism | ClubPage + MatchCard | ~2h |
| C2 | **`filteredMatches` sort decorate** (`ClubPage.vue:4110-4154`): precompute epoch keys once per row, not `new Date()` per comparison (~4,500 allocs @500 rows) | ClubPage | ~30min |
| C3 | **`content-visibility:auto` + `contain-intrinsic-size:auto ~120px`** on `.player-item`/`.match-item`/`.match-result` rows — kills offscreen layout/paint, keeps DOM/a11y | PlayerCard/MatchCard/MatchResult CSS | ~5 lines |
| C4 | **`adminMatchStats` closed-gate** (`useClubMembers.ts:97-171` → `ClubPage.vue:2999-3004`): computed returns `{}` unless SettingsDialog club-tab open — unsubscribes from 700-entity scan | useClubMembers/ClubPage | ~1h |
| C5 | **`completedMatchViewModels` chunking**: 500×`computeWinProbability` synchronous on filter select → `scheduler.yield` or idle-deferred build | ClubPage | ~1h |

## PR-D — Profile-gated (after A-C measured)

Unlock ONLY if longtask/component data shows these still dominate:

| # | Candidate | Gate condition |
|---|---|---|
| D1 | Row-VM reconciliation (stable row objects via shallow-equal reuse across ~15 computeds) | render counts still high post-C1; equality predicate must cover volatile fields (nested `player.avoids` hazard) |
| D2 | Dep-narrowing (de-spread `matches`/`cancelledMatches`, per-`matchId` memo for completedMatchViewModels) | computed re-eval in top-3 long tasks |
| D3 | `saveState` batch() for bulk ops (addAllPlayersToQueue=2N saves etc.) | saveState sweeps in top-3 long tasks; needs enforcement-ordering audit |
| D4 | `q-virtual-scroll` on completed-500 | >100ms long tasks on completed-filter AFTER C1-C3 land; choose normalized-height vs DynamicScroller |
| D5 | Keep-alive drop or lazy-mount | mobile tab-switch remount cost measured low-end |
| D6 | Per-entity `applyMergedState` | **requires dedicated reset-semantics audit first** — collection-granular adoption is load-bearing |
| D7 | Slim realtime fields → hint+pull; Yjs delta protocol | backend/Directus work, phase 2 |

---

## Verification protocol (built into A1)

1. **Before/after capture**: same club fixture (100 players, 500 completed), active session, Chrome Performance panel + longtask observer
2. **Metrics**: longtask count+total blocking per minute, per-list render counts (Vue DevTools), WS msg/sec, PATCH count/min, blob bytes transferred
3. **Regression**: 563 existing tests + new specs for coalescer (max-ts selection, role-field bypass, receipt-stamp), persist-gate (no-op merge → no push), toRaw (proxy fast-path)
4. **Manual smoke**: 2-admin edit burst, mobile 3-tab session, offline→reconnect, reset-then-sync (reset contract regression check!)

## Effort estimate
- **PR-A**: ~1 day (instrumentation is the long pole)
- **PR-B**: ~1 day
- **PR-C**: ~1 day (parallelizable with B — different files mostly)
- **PR-D**: gated, ~2-3 days if unlocked

## Risk register
| Risk | Mitigation |
|---|---|
| Coalescing breaks echo-suppression | max-lastModified selection + reorder test + role-fields bypass (proven by sync agent) |
| persist-gate skips a real change | reuse existing `{changed}` flag; spec asserts onStateChange NOT fired on no-op |
| `:meta` hoist stale DUPR data | VM computeds keep tracked reads → recompute on DUPR events as today |
| Row-VM reconcile stale rows (nested `avoids`) | D1 gate requires equality-predicate audit + tests |
| Vue/Quasar bump breaks something | patch-level only; full test suite + smoke before commit |
| Instrumentation overhead in prod | telemetry behind dev flag or sampled; ~free per skeptic |
