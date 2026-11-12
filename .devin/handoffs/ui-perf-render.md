# UI Perf / Render Investigation — ClubPage

## Architecture context (verified)
- `ClubLayout.vue:65` uses `v-if="$q.screen.gt.sm"` / `v-else` (:95) — desktop vs mobile slots are **mutually exclusive** (comment at :61-64 confirms a prior double-mount fix). The 7 `v-for`s in ClubPage (389, 684, 755, 898, 1053, 1373, 1516) never render simultaneously across breakpoints.
- **BUT** mobile `q-tab-panels` uses `keep-alive` (`ClubLayout.vue:140-144`) — after visiting each tab once, all 3 panels (players + queue + matches lists) stay mounted and **continue to re-render on every reactive change** (Vue deactivated components still run render effects + patch detached DOM).
- `MatchmakingApp.state` is a deep `reactive()` AppState (`services/matchmaking.ts:98`). Mutations arrive via: realtime WS `club.update` events → `applyServerMatchmaking` (`useCloudSync.ts:664-847`), local actions → `saveState()`/`persist()`, 60s `refreshPlayerRatings` poll (:1130-1133) which mutates player objects in place, 20s staleness poll (:1138), focus/visibility resume → `loadClubData` (:978-993). During active sessions this is a near-constant stream.

## Findings (ranked)

1. **HIGH — Identity churn: every state mutation rebuilds every list with all-new objects.** `players` (ClubPage.vue:1836-1851), `queue` (:1967-2076, incl. second spread pass when `autoSortQueue`), `displayPlayers` (:3894-3939), `matches` (:2093-2145), `cancelledMatches` (:3979-4023), `completedMatchViewModels` (:4025-4070) all `.map`+spread entities per recompute → new array + new row objects → `PlayerList`/`MatchCard`/`MatchResult` props always differ → **every visible row re-renders on every sync event/local action/poll**. Freq: continuous during sessions.

2. **HIGH — No list virtualization anywhere.** `q-list`+`v-for` renders all rows (ClubPage.vue:682, 752, 897, 1370, 1515; PlayerList.vue:3-5). With `matchesFilterBy='completed'` up to `COMPLETED_MATCHES_CAP=500` rows (`matchmaking-core.ts:233`) each render `MatchResult` (~4 players × ~10 helper calls + `formatDate`/`formatDuration` Date allocs + `:meta` object + DUPR menu). One filter switch or any state change while active = thousands of function calls + huge DOM patch. Freq: every recompute while 'completed'/'edited' filter selected; permanent DOM cost otherwise.

3. **HIGH — `filteredMatches` re-sorts on every recompute with per-comparison `new Date()` allocs** (ClubPage.vue:4110-4154). Comparator's `time()` (:4128-4133) allocates a Date per string-date comparison → O(n log n) allocs; for 500 completed ≈ ~4,500 Date objects per recompute. `waitingMatches`/`desktopMatches` (:4072-4082) and `:matches-count` (:250) all depend on it. Freq: every activeMatches/players-of-matches/completedMatches mutation.

4. **HIGH — Mobile keep-alive triple-renders hidden lists.** `ClubLayout.vue:140-160`: once all 3 tabs visited, players+queue+matches panels all stay live; every state change re-renders all three (render + patch into detached DOM). Effectively 3× finding #1's cost on mobile. Freq: every mutation while on mobile after tab exploration.

5. **HIGH — console.log of entire reactive payloads, not stripped in prod build** (quasar.config has no `removeConsole`):
   - `useCloudSync.ts:905` `console.log('[realtime] received message:', msg)` — logs the **full club row incl. entire appState blob** (players, queues, matches, ≤500 completedMatches, ≤200 actionLogs) on **every realtime event**.
   - `useCloudSync.ts:685-696, 841-846` — per-event collection dumps.
   - `ClubPage.vue:2863-2870` `isCurrentUserAdmin` and :2935-2950 `isCurrentUserModerator` — `console.log` the **whole `clubMembers` array** (+filter/map) inside computeds that re-evaluate on every members change; `canManageSession`/`userRole`/~10 template `v-if`s depend on them.
   Devtools-open = severe serialization jank; closed = arg eval still runs per event. Freq: every realtime event / members change.

6. **MED — `matches` computed reads every prop of every player in any active match** (ClubPage.vue:2097-2104 `...MatchmakingApp.state.players[u]`) → any player field write (rating poll, `updatedAt` bumps, duprId) → `computeWinProbability` per match + `filteredMatches` resort + all match rows re-render. Same pattern in `players` (:1839 spreads all players) and `queue` (:1974). `refreshPlayerRatings` (ClubPage.vue:3456-3535) writes `local.updatedAt = Date.now()` per changed field → guaranteed cascade each 60s poll when anything drifts.

7. **MED — `:meta="{...}"` inline object literal per row defeats child memoization** (ClubPage.vue:768-786, 1386-1404; MatchCard.vue:207-223). New identity every render → `MatchResult`/`MatchMetaChips` always re-render; also calls `getDuprStatus`/`getDuprError` 2×/row/render (:782-783, :1400-1401) plus ~6 more calls inside the admin q-menu (:802-861, :1419-1507). `isMatchDuprReady` (:2206-2227) does `Object.values(players).find()` per unmatched player — O(players) per call (menu-open only, transient).

8. **MED — `adminMatchStats` recomputes O(completedMatches + activeMatches + actionLogs) on every relevant mutation even with SettingsDialog closed** (`useClubMembers.ts:97-171`, caps 500+200) via `watch(..., {immediate:true})` at ClubPage.vue:2999-3004 → `_adminMatchStats` ref → SettingsDialog prop (:1619). Freq: every match completion / check-in / log write.

9. **MED — Watchers firing constantly:**
   - `watch([canManageSession, queue], {deep:true})` ClubPage.vue:3810-3825 — new array identity each `queue` recompute → fires on nearly every mutation; deep traversal of all queue rows.
   - `watch(() => players.value.map(duprId).join(','))` :1855-1865 — rebuilds full duprId string per players recompute → `Dupr.ensureRatings` batch (dedup'd, useDupr.ts:783-795).
   - `watch` settings fields `flush:'sync'` :3700-3729 — sync getter over 12 state fields per settings write.
   - Count watchers :4229-4263 — setTimeout shake per length change.
   - `useAnnouncer` watch getter (:53-61) — filters+sorts+joins all matches per `matches` recompute.
   - `useMatchSettings` watchers (useMatchSettings.ts:154, 213) — cheap.

10. **MED — Per-row method calls in templates (re-run every render):**
    - PlayerList.vue:13,16,17 — `isPlayerSelected` (O(selected) `.some`), `linkStateFor`, `avoidStateFor` per row; `avoidStateFor` does `props.players.find()` per row → **O(n²)** while avoid-mode armed (:448-459). `displayPlayers` re-sorts O(n log n) w/ `localeCompare` on every prop change (:368-424).
    - PlayerCard.vue — ~8 helper calls/row/render (`duprChipRating`×3, `duprSinglesRating`×2, `showRatingChip`, `ratingChipText`, `getRatingColor`, `Object.keys(avoids)`×3 :81-100); `watch(() => props.player)` fires per row per parent render (:407-412).
    - MatchCard.vue — same chip-helper pattern ×4 players (:52-75, :178-201), `isSelfPlayer`×4, `getMatchStatusLabel`, `:meta` object; `useNowTicker` (:463) → **every in-progress MatchCard re-renders every 1s** (shared interval, useNowTicker.ts:6-16) re-running all helpers.
    - MatchResult.vue — `isBlurred`/`blurText`/`formatDate`/`formatDuration`/chip helpers per player per render; `useNowTicker` (:371) — early-returns for non-editable so mostly dormant.

11. **LOW-MED — `saveState()` runs ~8 full-collection enforcement passes per mutation** (`matchmaking.ts:173-338`: oneMatchPerPlayer, oneMatchPerCourt, concurrency, queue-match constraint, orphan cleanup, dedup, tombstone GC, checkpoint purges, caps) + `lastModified` write; LocalStorage write itself is idle-debounced (:108-161) — good. Freq: every `persist()` (settings setters, all match/player actions).

12. **LOW — Dialogs are eager-mounted but q-dialog content is lazy** (first-open mount only): SettingsDialog (ClubPage.vue:1588-1637, ~25 props incl. whole `actionLogs`/member arrays) renders 3 member v-fors (:621,727,856) + actionLogs (:405) + `sortedFeedback` sort (:1315-1321) on first open; LeaderboardDialog uses `q-virtual-scroll` (:244,420 — good); `MemberMatchStats` is trivial chips, no chart compute (:1-134); AddPlayerDialog gets whole `players`+`clubMembers` (:1556-1559). One-time jank on first open for large clubs.

13. **LOW — Misc per-render work:** `queueStats` = 5× O(queue) filters (:3941-3963); `getMatchGenerationHint()` = 2× `queue.filter` per call, invoked in template (:4274-4275, called :646/:1308); `unlockedQueueCount` iterates queue twice (:2080-2092); `canGenerateMatches()` called ~8×/render (:526,535,580,590 + mobile mirrors); `busyPlayers` returns fresh object → ClubLayout prop churn (:1868-1881, ClubLayout prop :178); `filteredMatches.indexOf(match)` in click handlers only (O(n) per click, fine); `hasNameConflict` O(players) per keystroke in edit dialog (:4208-4219).

## Top-10 jank sources (by impact × frequency)
1. Identity-churn re-render of all rows on every sync/mutation (#1)
2. No virtualization + 500-row completed filter (#2)
3. `filteredMatches` per-comparison Date-alloc sort (#3)
4. Mobile keep-alive triple render (#4)
5. Whole-appState console.log per realtime event + member-array logs in computeds (#5)
6. `matches`/`players` spread-dependency on all player props (#6)
7. `:meta` object-literal prop churn + per-row DUPR calls (#7)
8. `adminMatchStats` O(history) recompute while dialog closed (#8)
9. Constant-fire watchers incl. deep queue watch + announcer getter (#9)
10. Per-row O(n²)/O(n log n) helpers in PlayerList/PlayerCard/MatchCard (#10)
