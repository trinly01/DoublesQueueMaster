# UI Perf Research — ClubPage (Vue 3.5.12 + Quasar 2.17.0, Vite PWA, hash router)
Versions confirmed in package-lock.json: quasar 2.17.0, vue 3.5.12. All sources accessed 2026-01.

## 1. Vue 3 reactivity pitfalls
- `reactive()` deep-wraps every nested object in Proxies; cost scales with data volume — use `shallowRef`/`shallowReactive`/`markRaw` for large collections replaced wholesale. https://vuejs.org/api/reactivity-advanced
- Computeds cache until a dep changes, but depending on a large reactive source invalidates on ANY nested mutation; narrow dep scope, split chains. Vue 3.4+ only re-triggers effects when the computed value actually changed (app is on 3.5.12 — already benefits). https://vuejs.org/guide/essentials/reactivity-fundamentals.html ; https://github.com/vuejs/blog/blob/main/posts/vue-3-4.md
- Watchers on whole objects / `deep:true` / watcher→watcher chains cause "watcher storms"; prefer computed, `flush:'post'`, debounce I/O watchers. https://medium.com/simform-engineering/7-vue-3-performance-pitfalls-that-quietly-derail-your-app-33c7180d68d4

## 2. Large list rendering
- Official guidance: virtualize large lists; `:key` must be a stable primitive id (never index for stateful rows). https://vuejs.org/guide/best-practices/performance ; https://vuejs.org/guide/essentials/list.html
- `v-memo="[deps]"` (Vue 3.2+) skips vnode creation for unchanged rows — ideal for selection/flag updates in long lists. https://blog.vuejs.org/posts/vue-3-2
- vue-virtual-scroller benchmark (secondary): 5k items 3.2s→0.1s initial render, 180MB→35MB. https://dev.to/alan_529cf536b9cf0f88ec8c/5-practical-solutions-for-large-list-rendering-in-vue-3-4lbi

## 3. Quasar-specific
- `q-virtual-scroll` (type="list"/"table") renders only the visible slice; docs TIP: pass `items` WITHOUT ref()/computed()/reactive() wrapper (or Object.freeze) for best perf. https://quasar.dev/vue-components/virtual-scroll
- `q-list` does NOT virtualize — plain `v-for` renders every row; QTable virtual-scroll requires `table-style` max-height. https://quasar.dev/vue-components/table
- Known issues: #12049 virtual scroll rendered ~9x visible rows (fixed v2.4.11 — irrelevant at 2.17); #9329 scroll debounce is by-design; #7551 selection+QPopupEdit slow virtual scroll. https://github.com/quasarframework/quasar/issues/12049 ; /issues/9329 ; /issues/7551

## 4. JSON.stringify / deep-equal costs
- `JSON.stringify(a)===JSON.stringify(b)` is ~7x slower than fast-deep-equal (23k vs 158k ops/s), O(size) per call, early-exits only on mismatch; key-order false negatives. https://github.com/FormidableLabs/react-fast-compare/issues/35 ; https://www.mattzeunert.com/2016/01/28/javascript-deep-equal.html
- `toRaw()` before comparing reactive entities; `shallowRef` avoids per-element proxy creation; `structuredClone` strips reactivity (use only for snapshots). https://vuejs.org/api/reactivity-advanced ; https://vuejs.org/guide/extras/reactivity-in-depth

## 5. WebSocket / realtime updates
- Never write reactive state per message: buffer into plain vars, flush once per `requestAnimationFrame` or ~50-100ms timer; >60 msg/s unbatched burns the whole frame budget on invisible intermediate states. https://www.real-time-websocket.com/frontend-real-time-state-hooks-ui-patterns/vue-3-composables-for-real-time/ ; https://siebly.io/blog/websocket-ui-batching-javascript
- Keep the socket/timers in closure vars; expose only rendered slices as `shallowRef`; aggregates via `computed`. (same sources)

## 6. Browser-level jank
- Long tasks >50ms on the main thread are the direct jank source; interleaved DOM read/write causes layout thrashing. https://web.dev/articles/manually-diagnose-slow-interactions-in-the-lab
- `content-visibility:auto` + `contain-intrinsic-size` skips offscreen render (~7x on long pages); `contain: layout paint` isolates expensive subtrees. https://web.dev/articles/content-visibility ; https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Using

## 7. Measurement plan (verification before/after)
- Vue DevTools Timeline profiler = which components rendered + durations (per-render, NOT paint). Enable `app.config.performance` for Vue markers in Chrome's timeline. https://vuejs.org/guide/best-practices/performance
- Chrome Performance panel: record the slow interaction → Main thread long tasks → widest bar = hot function; >16ms render misses a frame, >100ms = severe. https://developer.chrome.com/docs/devtools/performance

## Likely causes ranked for THIS app
1. **Deep `reactive()` AppState + ~59 computeds in one 4300-line component** — every mutation (realtime msg, 20s poll apply, local action) invalidates shared deps → `players`/`queue`/`matches`/`filteredMatches`/`queueStats`/`completedMatchViewModels` all recompute → whole page re-renders. `src/services/matchmaking.ts:98`; computeds `src/pages/ClubPage.vue:~1809-4200`.
2. **No virtualization on the big lists** — `filteredMatches` rendered via plain `q-list`+`v-for` in multiple branches (ClubPage.vue:684, 755, 898, 1373, 1516); `q-virtual-scroll` already used elsewhere (PlayerPage.vue:739, LeaderboardDialog.vue:244) — pattern exists, not applied here.
3. **`collectionEqual`/`jsonEqual` hot path** — every sync walks all collections; ref-differing entities fall back to per-entity `JSON.stringify` (`src/services/cloudSyncHelpers.ts:261-317`); `JSON.stringify` also used as merge tie-break comparator (`matchmaking.ts:1944,2149,2199,2294`).
4. **Whole-state LocalStorage blob** — `flushPersist()` → `LocalStorage.set(key, this.state)` serializes the entire reactive state through proxy traps per save batch (`matchmaking.ts:148-161`); already deferred via requestIdleCallback — good, but still O(blob).
5. **Render-per-realtime-message** — no batching in the subscribe handler (`useCloudSync.ts:880-925`); `collectionEqual` guards make no-op echoes cheap, but any real change = full page render; privileged path also runs `enforceOneMatchPerPlayer/Court` scans synchronously (L730-731).
6. **20s staleness poll + 1500ms debounced push** are reasonable cadences; risk is the synchronous merge+apply cost per pull, not the interval itself.

## Version-specific flags
- Vue 3.5.12: has 3.4 computed dirty-checking + `v-memo`; consider `shallowRef`/`markRaw` on `state.players`/`queues`/`activeMatches`/`completedMatches`/`actionLogs` (biggest single lever) — must audit mutation sites first.
- Quasar 2.17.0: `q-virtual-scroll` mature; prefer it over `q-infinite-scroll` for long lists (infinite-scroll checks run on main thread — quasar discussion #13673).
