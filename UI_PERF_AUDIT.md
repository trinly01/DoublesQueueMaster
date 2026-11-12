# UI Performance Audit — ClubPage Unresponsiveness

**Date**: 2026-01 · **Method**: 6-agent parallel investigation (render, reactivity, data-volume, network, heavy-work, web-research) · **Status**: findings only — fix debate pending
**Scope**: `/club/:slug` page — Players / Queue / Matches tabs, all nested components, sync pipeline, network layer.
**User symptom**: unresponsive UI, lag, hanging — especially during active sessions.

---

## Executive summary

The jank is **structural, not incidental**. Three systems amplify each other:

```
Realtime WS msg / local mutation / 20s poll
        │
        ▼
┌─ STATE SIDE (~50–200ms main-thread per event) ─────────────┐
│ JSON.parse 1–3MB blob → mergeAppState → collectionEqual    │
│ (JSON.stringify per entity — toRaw bug defeats fast-path)  │
│ → applyMergedState replaces WHOLE collections → new refs   │
│ → enforce×3 + persistSilently → sync LocalStorage.set      │
└────────────────────────────────────────────────────────────┘
        │
        ▼
┌─ RENDER SIDE (~50–150ms per recompute, ×N lists) ──────────┐
│ ~15–20 computeds invalidate → all rows get NEW object      │
│ identity → ~2,000 component instances re-render            │
│ (no virtualization; mobile keep-alive renders hidden tabs) │
└────────────────────────────────────────────────────────────┘
        │
        ▼
┌─ WRITE AMPLIFICATION ──────────────────────────────────────┐
│ persist() on EVERY loadClubData → guaranteed full-blob     │
│ PATCH ~1.5s later → re-broadcast to ALL club subscribers   │
│ → every other client runs the same 50–200ms pipeline       │
└────────────────────────────────────────────────────────────┘
```

**Verdict from agents**: state-side is the primary driver; render-side amplifies each applied change; network layer multiplies the blast radius club-wide.

---

## Findings by severity

### 🔴 HIGH — fix candidates

| # | Finding | Evidence | Mechanism |
|---|---|---|---|
| H1 | **Identity-churn re-render cascade** | `ClubPage.vue:1836-2145,3894-4070`; `matchmaking.ts:98` | Every computed `.map`+spreads entities → new array + new row objects → ALL visible rows re-render on EVERY mutation/sync/poll. ~2,000 component instances (100 PlayerCards × 15-20 Quasar components each). |
| H2 | **No list virtualization** | `PlayerList.vue:3-5`; `ClubPage.vue:682,752,897,1370,1515` | Plain `q-list`+`v-for` renders all rows. `completed` filter = up to 500 `MatchResult` rows (~4 players × ~10 helper calls each). `q-virtual-scroll` already used in `LeaderboardDialog.vue:244,420` — pattern exists, not applied here. |
| H3 | **`collectionEqual` toRaw asymmetry bug** | `cloudSyncHelpers.ts:299,310` | `toRaw()` applied only to side `a`, never `b` — merge results contain reactive proxies → pointer fast-path defeated → **2× JSON.stringify per unchanged entity** on every sync apply. `completedMatches` (500×~1KB) dominates. **Actual bug, not just perf.** |
| H4 | **Per-realtime-message synchronous pipeline, no batching** | `useCloudSync.ts:880-925` → `:664-847` | Every WS msg = full appState blob → JSON.parse + merge + collectionEqual + 3 enforce + `persistSilently` sync LocalStorage write. Est. 50–200ms per remote write; bursts = repeated jank. No debounce/batching. |
| H5 | **`saveState()` ~11 O(state) passes per mutation, stacked** | `matchmaking.ts:173-338` | enforce×3 + dedup + player remap + tombstone GC + 4 checkpoint purges + caps — EVERY mutation. Bulk ops multiply: `addAllPlayersToQueue` = 2N saveStates (`usePlayerActions.ts:564-576`), manual match = ~5, match edit = ~5. ~2-10ms typical, ~30-50ms @M=2000. |
| H6 | **Write amplification: `persist()` on every `loadClubData`** | `useClubData.ts:997` | Unconditional `MatchmakingApp.persist()` whenever `club.players` non-empty → `lastModified=now` → `onStateChange` → debounced push ~1.5s later = light read + FULL probe read + CAS PATCH of whole blob. Fires on mount, every focus/resume, role refresh, poll fallback, join reload. **Each push re-broadcasts ~1MB to every subscriber.** |
| H7 | **appState blob 0.5–1.5MB moved 2–3× per sync + per realtime event per client** | `matchmaking-core.ts:144-236`; `useCloudSync.ts:886-894` | players dict w/ `history.playedWith/playedAgainst` O(roster²), completedMatches≤500, completedMatchIds≤2000, actionLogs≤200. Downloaded per load/probe/pull; uploaded per PATCH; pushed over WS to all subscribers per update. |
| H8 | **console.log of entire appState per realtime event** | `useCloudSync.ts:905,685-696,841-846`; `ClubPage.vue:2863-2870,2935-2950` | `console.log('[realtime] received message:', msg)` logs full club row incl. entire blob EVERY event; computeds log whole `clubMembers` array. No `removeConsole` in build. Devtools-open = severe serialization jank. |
| H9 | **Mobile keep-alive renders all 3 hidden tab panels** | `ClubLayout.vue:140-160` | Vue 3.4 keep-alive does NOT pause render effects — after visiting each tab, players+queue+matches lists all stay live and re-render on every state change. ~3× render cost on mobile. |
| H10 | **LeaderboardDialog open = main-thread replay freeze** | `ClubPage.vue:3099,3312,3737-3744` | Global (≤1000 matches × 8 passes) + my-matches (≤500) `replayMatches*` run INLINE on main thread — worker only covers club/duo. ~0.3–1s block on open, alongside 3 other parallel fetches. |

### 🟠 MEDIUM

| # | Finding | Evidence |
|---|---|---|
| M1 | `filteredMatches` sort allocates `new Date()` per comparison | `ClubPage.vue:4110-4154` — ~4,500 Date objects per recompute @500 rows |
| M2 | Whole-collection replacement on any diff | `matchmaking.ts:1914,2255,2618` → `cloudSyncHelpers.ts:324-330` — new identity → ~15-20 computeds invalidate |
| M3 | `matches`/`players`/`queue` computeds spread every entity | `ClubPage.vue:1839,1974,2097-2104` — any player field write (60s rating poll bumps `updatedAt`) cascades all match rows |
| M4 | Per-row component weight | PlayerCard ~10 Quasar components/row; MatchCard ×4 players + MatchMetaChips ~10 conditional chips |
| M5 | `:meta="{...}"` inline object per row defeats memoization | `ClubPage.vue:768-786,1386-1404` + `getDuprStatus`/`getDuprError` 2×/row/render |
| M6 | Constant-fire watchers | deep `watch([canManageSession, queue])` `:3810-3825`; duprId join-string `:1855-1865`; announcer getter `useAnnouncer.ts:53-61`; adminMatchStats O(history) recompute while dialog closed `useClubMembers.ts:97-171` |
| M7 | Per-row O(n²)/O(n log n) helpers | `avoidStateFor` `players.find` per row `PlayerList.vue:448-459`; `displayPlayers` re-sort `localeCompare` `:368-424`; `isMatchDuprReady` `Object.values(players).find` `ClubPage.vue:2206-2227` |
| M8 | 1s ticker re-renders in-progress MatchCards | `useNowTicker.ts:6-16` shared interval → every in-progress card re-runs all helpers each second |
| M9 | Infinite CSS animations on rows | pulse animations `PlayerCard.vue:471-557`, `MatchCard.vue:488-592` — constant repaint |
| M10 | Push path serializes blob 3× | CAS probe full read + PATCH stringify + up to 2 merges (`useCloudSync.ts:369-476`) |
| M11 | Cold mount ≈10-11 REST + 2 WS, gated by heaviest read | `ClubPage.vue:3613-3636`; `completed_match` keys fetched twice (`:3633` + watcher `:2899-2905`) |
| M12 | `draftNextMatches` DFS pathological case | `matchmaking.ts:989-1206` — 200k-visited cap; seconds of CPU on Generate click with dense avoid graphs |
| M13 | dupr_submission refetch-all per WS event | `useDupr.ts:285-289` — limit-500 fetch per message + 10s reconnect flap |
| M14 | Steady-state ~4 REST/min idle is fine; degraded = full `loadClubData` every 20s when realtime dead | `useCloudSync.ts:1051-1061` |

### 🟡 LOW / INFO
- Avatar lazy-loading exists (`PlayerAvatar.vue:34`) but all img elements mount; masked fallback hits `cdn.quasar.dev`
- `queueStats` = 5× queue scans; `getMatchGenerationHint`/`canGenerateMatches` called ~8×/render
- SettingsDialog member lists render all rows with non-lazy avatars on first open
- Action Logs ≤200 rows render fully on expansion; feedback list unbounded (`playerReport.ts:315-335`)
- Dialog data mostly lazy — good; `adminMatchStats` recomputes even when closed (M6)
- No ECharts on club page; TTS/audio fully async; no canvas image processing found

---

## Convergent themes (all agents agree)

1. **Single deep `reactive()` blob + identity churn** is the root amplifier — flagged by render, data, reactivity, AND research agents independently.
2. **The sync pipeline runs synchronously per message with no batching** — research recommends rAF/50-100ms flush; agents measured 50-200ms per event.
3. **Write amplification is club-wide** — one admin's `loadClubData` triggers a push that makes EVERY subscriber run the same expensive pipeline.
4. **The codebase has been iteratively optimized** (worker for club/duo leaderboards, requestIdleCallback persist, prior O(n²)→Map fixes, CORS strip) — remaining issues are structural, not oversights.

## Already-mitigated (don't re-fix)
- Desktop/mobile double-mount — fixed via `v-if` (`ClubLayout.vue:61-64`)
- LocalStorage persist deferred to `requestIdleCallback(2s)`
- Cloud push debounced 1500ms; CAS bounded to 2 attempts
- Club/duo leaderboard compute in worker with fingerprint cache
- Realtime echo skipped by timestamp; staleness poll lightweight (skipped while realtime fresh)
- 401 retry single-flight; realtime backoff capped 30s

## Measurement plan (for fix verification — from research agent)
1. Vue DevTools Timeline profiler — which components render + durations
2. `app.config.performance = true` in dev → Vue markers in Chrome Performance panel
3. Chrome Performance: record slow interaction → Main thread long tasks → widest bar = hot function; >16ms misses frame, >100ms severe
4. Before/after: same club, same session length, compare long-task count + total blocking time

## Debate questions for fix planning
1. **shallowRef/markRaw on state collections** — biggest single lever per research, but requires auditing ALL mutation sites (entities are mutated in place throughout). Alternative: keep deep reactive but narrow computed deps?
2. **Realtime batching** — rAF/50ms flush window: acceptable staleness for UI vs sync correctness?
3. **Per-entity apply vs whole-collection replace** — `applyMergedState` could preserve unchanged entity refs (H3 fix makes this cheaper anyway).
4. **Virtualization scope** — which lists need it (players ~100, completed ~500) vs which are small enough (queue, active matches)?
5. **Write amplification fix** — gate `persist()` on actual-change (H6) vs slim the realtime payload vs both?
6. **console.log removal** — `removeConsole` build flag vs manual strip (keep warn/error)?
7. **saveState batching** — bulk actions (addAllPlayersToQueue) could defer enforcement to one pass.
8. **Keep-alive render cost** — `:animated="false"` won't help (render effects still run); needs lazy-mount-on-active-tab or accept 3× cost?

## Source handoffs
- `.devin/handoffs/ui-perf-render.md` — component/template findings (13 findings)
- `.devin/handoffs/ui-perf-reactivity.md` — state/mutation/sync-internals (8 findings + verdict)
- `.devin/handoffs/ui-perf-data.md` — row counts × per-item cost (17 findings)
- `.devin/handoffs/ui-perf-network.md` — request patterns + request-count tables
- `.devin/handoffs/ui-perf-heavywork.md` — synchronous main-thread work quantified
- `.devin/handoffs/ui-perf-research.md` — cited Vue/Quasar best practices + measurement plan
