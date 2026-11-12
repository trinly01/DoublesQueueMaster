# UI Perf Research — Round 2 (Vue 3.5.12 / Quasar 2.17.0 / Vite 5.4.8 / app-vite 2.0.0-beta.22)
All URLs accessed 2026-01.

## 1. Vue 3.5 / 3.6
- 3.5 reactivity refactor: version-counted deps + doubly-linked lists; −56% memory, up to 10× faster large/deep reactive arrays, no stale computeds. https://blog.vuejs.org/posts/vue-3-5 · https://blog.ninja-squad.com/2024/09/05/what-is-new-vue-3.5/
- 3.5.x stable line is now 3.5.44 (Oct 2026) with free perf fixes: "only flush jobs queued by root render" (#15757), stack-overflow fix for huge post-flush queues (#15143), skip refetch of unchanged props (#15105), stable v-for vnode lifecycle (#11682). Bump 3.5.12→3.5.44 (patch-only, safe). https://github.com/vuejs/core/blob/HEAD/CHANGELOG.md
- Vue 3.6 RC (rc.14 Oct 2026): Vapor Mode feature-complete for an API subset; @vue/reactivity rewritten on alien-signals; Vapor ≈ Solid/Svelte5 in benchmarks (score ~90 vs React 68). Official rec: partial adoption in perf-sensitive pages. https://github.com/vuejs/core/releases/tag/v3.6.0-rc.1 · https://todovue.blog/blog/vue-3-6-rc-vapor-mode-status-limits-evaluation-2026.en/
- Vapor talks: VueConf 2025 alien-signals deck https://github.com/VueConf/2025 ; Vue.js Nation 2025 Vapor talk https://vueschool.io/articles/news/building-vues-high-performance-future-vapor-mode-insights-from-rizumu-ayakas-vue-js-nation-2025-talk/ ; Vue Fes Japan 2025 "Reactivity Frontline in Vue 3.6 era" (migration pitfalls) https://zenn.dev/shun91/articles/vue-fes-japan-2025?locale=en
- v-memo skips VNode creation for memoized subtrees; docs say built for v-for >1000 items. https://vuejs.org/api/built-in-directives ; official perf checklist https://vuejs.org/guide/best-practices/performance
- 0.5–1.5MB state blob: wrap payloads in shallowRef/markRaw/toRaw so Vue skips deep proxying (proxy traps on deep reads are the classic slowdown). https://www.jamesrossjr.com/blog/vue-3-performance-optimization
- Benchmarks: js-reactivity-benchmark (Vue vs Solid/alien-signals/Svelte5) https://github.com/transitive-bullshit/js-reactivity-benchmark ; Solid's own bench shows @vue/reactivity ~2-3× slower on graph churn https://fossies.org/linux/solid/packages/solid/bench/results.md
- useTemplateRef returns ShallowRef usable inside composables — enables lazy/deferred heavy child mounting. https://blog.vuejs.org/posts/vue-3-5

## 2. Quasar 2.17
- QVirtualScroll > QInfiniteScroll for big lists: only the visible slice is rendered; QInfiniteScroll keeps appending chunks (data-fetch latency per scroll). https://quasar.dev/vue-components/virtual-scroll · https://medium.com/quasar-framework/the-new-qvirtualscroll-component-dd662f2e36c7
- Set `virtual-scroll-item-size` near the *minimum* row height; tune `virtual-scroll-slice-size` + ratio-before/after (defaults render ~10 visible + equal buffers; issue #12049 showed 9× overshoot). Freeze the items array (`Object.freeze`) so Vue skips reactivity — official tip on Select docs applies equally. https://quasar.dev/vue-components/select · https://github.com/quasarframework/quasar/issues/12049
- Variable-height rows still cause scroll jumping (issue #5317, images); mitigations: fixed row height, `q-virtual-scroll--with-prev`/`--skip` classes, or QTable `virtual-scroll` + `table-style max-height`. https://quasar.dev/vue-components/table · https://github.com/quasarframework/quasar/issues/5317
- Avoid selection + QPopupEdit inside virtual scroll (issue #7551: 130→330ms load). https://github.com/quasarframework/quasar/issues/5317 sibling: https://github.com/quasarframework/quasar/issues/7551
- Browser hard limit ~33.5M px scroll height if spacer-div approach used (issue #8472). https://github.com/quasarframework/quasar/issues/8472
- Quasar 2.18.x exists (2.18.6, Nov 2025) with minor perf work (QPagination events #18097); 2.17.x ended at 2.17.7 (Jan 2025). https://github.com/quasarframework/quasar/releases/tag/quasar-v2.18.6
- Dark mode flips `body--dark` + auto-sets `dark` on every Quasar component — a full-tree prop change; scope dark styles via `body.body--dark` CSS rather than per-component JS where possible. https://quasar.dev/style/dark-mode · https://quasar.dev/quasar-plugins/dark

## 3. Reactive-UI-at-scale sources
- React Fiber architecture (incremental rendering, lanes, yield ~every 5ms) — model for chunking Vue flushes. https://github.com/acdlite/react-fiber-architecture · https://github.com/reactwg/react-18/discussions/27
- HighLevel eng blog (Jun 2025): Vue 2 monolith + 60 Vue3 microapps via module federation; browser memory/render bottleneck case study. https://engineering.gohighlevel.com/post/a-frontend-performance-odyssey-unraveling-the-browsers-bottlenecks
- js-framework-benchmark numbers behind Vapor claims: https://blog.vuejs.org/posts/vue-3-2 (v-memo put Vue among fastest)

## 4. State-sync protocols
- Yjs sync = state vectors + `encodeStateAsUpdate(doc, stateVector)` → send only missing diffs; updates are binary, commutative, idempotent. Direct blueprint for their ws blob sync. https://docs.yjs.dev/api/document-updates · https://github.com/yjs/y-protocols/blob/master/PROTOCOL.md
- Delta-state CRDTs (Almeida/Shoker/Baquero, JPDC 2018): deltas are themselves CRDTs; fall back to full state on cold start. LWW merge is convergent but lossy under clock skew — needs HLC/Lamport timestamps + deterministic tie-break. https://sujeet.pro/articles/crdt-for-collaborative-systems · https://dl.acm.org/doi/full/10.1145/3695249
- JSON Patch (RFC 6902) for partial REST updates; `test` op guards lost updates; JSON Merge Patch (RFC 7396) is cheaper for simple field sets. https://www.rfc-editor.org/info/rfc6902/ · https://mnot.net/blog/2012/patch
- Directus realtime subscriptions accept `query.fields` + `query.filter` → server sends only needed fields/rows; payloads are full item objects (not deltas), deletes send only `id`. https://directus.com/docs/guides/realtime/subscriptions

## 5. Rendering pipeline / jank
- `content-visibility: auto` + `contain-intrinsic-size`: measured 144→38ms first frame on 3,000 cards (headless Chromium); keep size estimate accurate or scrollbar jumps; Safari lagging (Tech Preview). https://web.dev/articles/content-visibility · https://nolanlawson.com/2024/09/18/improving-rendering-performance-with-css-content-visibility/ · https://agustinbarrientos.com/writing/senior-eye/content-visibility-vs-virtualization
- IntersectionObserver render-on-visible for offscreen heavy rows (incl. charts): ~40% faster initial render in Chrome/Firefox emoji benchmark. https://nolanlawson.com/2024/09/18/improving-rendering-performance-with-css-content-visibility/
- `scheduler.yield()` inside async loops with a ~50ms deadline chunks long tasks; `await` is mandatory; setTimeout fallback; per-iteration yield overhead can exceed savings in tight loops. https://web.dev/articles/optimize-long-tasks · https://developer.chrome.com/blog/use-scheduler-yield · https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/yield
- Passive listeners: touchstart/touchmove passive-by-default since Chrome 56, wheel/mousewheel on root since Chrome 73 — never register non-passive scroll listeners. https://developer.chrome.com/blog/scrolling-intervention · https://developer.chrome.com/blog/scrolling-intervention-2
- Animate only transform/opacity; `will-change` sparingly (layer explosion costs memory on low-end devices). https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count · https://web.dev/articles/animations-overview

## 6. Case studies / stack-specific
- ECharts (dep present, ^6.1.0): `large:true`+`largeThreshold`, `progressive`/`progressiveThreshold` (auto >3000 pts), `sampling:'lttb'`, `showSymbol:false`, `useDirtyRect` for frequent updates; defer chart init via IntersectionObserver. https://apache.googlesource.com/echarts-doc/+/refs/heads/infrastructure-ruleset-bot/default-branch-protection/en/option/partial/progressive.md · https://howtocodepage.com/learn/echarts/echarts-datazoom-large-data-performance/
- Vue3 admin checklist: stable primitive props, computed derived values, v-memo, hoist formatting out of cells. https://appmaster.io/blog/vue3-admin-ui-performance-checklist
- Daniel Roe "Unpacking Bundling" (Vue.js Nation 2025): INP regressions traced to pre-render payload timing; RAF+timeout (~8ms) fix pattern. https://confpad.io/conferences/vue-js-nation-2025/unpacking-bundling

## Techniques the position agents likely missed
1. **Free upgrade first**: Vue 3.5.12→3.5.44 and Quasar 2.17.0→2.18.6 — patch-level scheduler/reactivity/perf fixes, zero migration.
2. **Vapor Mode partial adoption**: Vue 3.6 RC officially recommends compiling only the hot page in Vapor (no VDOM diffing for the 2000-instance subtree), interoping via component boundaries — biggest single lever if they can tolerate RC or wait for stable.
3. **State blob**: shallowRef/markRaw the 0.5–1.5MB JSON (deep proxying is the reactivity tax); better, adopt Yjs-style state-vector diffing or JSON Patch deltas over ws/REST instead of full-state sync; Directus subscriptions already support `query.fields`+`filter`.
4. **LWW merge**: convergent but lossy under clock skew — move to HLC timestamps + deterministic tie-break, or delta-state CRDT if true multi-writer collaboration is the goal.
5. **Zero-JS complement to virtualization**: `content-visibility:auto` + `contain-intrinsic-size` on rows, and IntersectionObserver-gated mounting for below-fold heavy cells (charts, 3D/tresjs).
6. **scheduler.yield chunking**: wrap bulk state application in an async loop with a 50ms deadline so the 2000-instance flush can't become one long task; Vue's scheduler dedupes jobs but a manual chunk prevents a single giant flush.
7. **v-memo + frozen items**: memoize list-row subtrees on stable deps and `Object.freeze` the array so Vue skips reactivity entirely (official Quasar guidance).
8. **QVirtualScroll caveats**: assumes near-fixed item size — keep rows fixed-height or use `--with-prev`/`--skip`; avoid selection/QPopupEdit inside it; 33.5M-px DOM height ceiling.
9. **Chart/3D jank**: ECharts large/progressive/lttb modes and IntersectionObserver-deferred init; treeshake unused echarts/three modules.
10. **Compositing discipline**: transform/opacity-only animations, restrained `will-change`, dark-mode via `body--dark` CSS class scoping to avoid per-component dark prop storms.
