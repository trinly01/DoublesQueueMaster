# Boot Performance — Fix Plan v2 (post-debate)

Source: `BOOT_PERF_AUDIT.md` (38 findings) + 4 analysts + 2 debate resumes + 1 red-team.
Status: **plan only — awaiting approval before implementation.**

## Debate outcomes (what changed vs v1)

| Item | v1 said | After debate/red-team |
|---|---|---|
| Fix #3 (matchmaking) | "(a) split core module" | **(a)-minimal decided** — `export *` re-export = zero importer changes; only `LandingPaddleStack.vue:393` repoints. Cheaper than feared (~half day, compiler-checked). Hydrate alone is <1ms for fresh visitors, but (a) also removes ~150–250KB of module bytes from the **landing chunk** — that's the real win, not the hydrate |
| manualChunks regex | proposed | **Red-team verified safe** — entire eager npm closure enumerated; likha-sdk has exactly 1 transitive dep (`@directus/sdk`), both whitelisted; `vue-demi` correctly excluded; quasar has zero runtime deps |
| 60–70% estimate | headline metric | **Downgraded to "needs trial build"** — likha-sdk/directus transitive deps (`ohash`/`ufo`/`cookie`/`jose`) auto-split into extra eager chunks; unmeasured. Verify with eager-byte budget, not just modulepreload inspection |
| Metrics | single "eager JS" number | **Split into boot-eager JS vs landing-route JS** — fix #3 affects landing chunk, not entry |

## Red-team attacks that survived (verified in code)

- Lazy `import()` chunks can't be served `index.html` by `navigateFallback` (not navigate-mode requests)
- Only worker (`leaderboard.worker.ts`) imports zero node_modules — `manualChunks` can't break it
- likha refresh single-flighted across all callers — fire-and-forget can't race token rotation
- Auth guard reads `dink-auth` flag only — unaffected

## Fix bundle (implementation order)

### Phase A — zero-risk config/html (do FIRST, before any build)

**A1. Workbox `globIgnores` + `navigateFallbackDenylist` — `quasar.config.ts` pwa block**
```ts
cfg.globIgnores = [...(cfg.globIgnores ?? []), '**/node_modules/**/*', '**/ads/**', '**/*.mp4'];
// AND extend existing denylist (it ASSIGNS, not extends — push onto array):
cfg.navigateFallbackDenylist.push(/\.(?:csv|mp4|woff2?)$/);
```
- Defuses ~60MB MP4 precache bomb AND fixes F12 (`.csv` template navigations returning HTML)
- Broader patterns per red-team (`**/ads/**`, `**/*.mp4`) — not brittle `ads/*.mp4`

**A2. likha boot await → fire-and-forget — `src/boot/likha.ts`**
```ts
void likhaClient.refresh().catch(() => console.warn('[Boot] refresh failed'));
```
- `.catch()` mandatory; removes mount-blocking await; single-flight makes it safe

**A3. `index.html` — `history.replaceState` for BOTH branches**
- Path→hash branch AND `?r=` deep-link branch (red-team caught v1 missed the second)
- try/catch with `location.replace` fallback

**A4. `preconnect` — `index.html` head**
```html
<link rel="preconnect" href="https://api.dinkmatch.club" crossorigin>
```

### Phase B — coupled bundle fix

**B1. Lazy routes — `src/router/routes.ts`**
```ts
component: () => import('pages/PlayerPage.vue')  // profile
component: () => import('pages/ClubPage.vue')    // club/:clubId + openplay (one shared chunk)
```

**B2. Whitelist manualChunks — `quasar.config.ts:64-74`** (red-team verified regex)
```ts
manualChunks(id: string) {
  if (!id.includes('node_modules')) return;
  if (/[\\/]node_modules[\\/](?:@vue|vue|vue-router|quasar|@quasar|@likha-erp|@directus|register-service-worker)[\\/]/.test(id)) {
    return 'vendor';
  }
}
```
- echarts→PlayerPage chunk, three+trystero→PlayPage, qrcode→shared lazy, html5-qrcode+edge-tts→ClubPage
- Whitelist fails safe: missed eager dep → extra eager chunk (same bytes, no breakage)
- **Rejected**: per-package groups (cycle risk, cache granularity negated by SW precache)

**⛔ GATE: `quasar build -m pwa` + modulepreload audit HERE**
- Assert: `docs/index.html` preloads only vendor+index+boot JS; NO echarts/three/qrcode chunks eager
- Record actual eager bytes → validates or corrects the 60–70% estimate BEFORE risky code change
- If chunk explosion → add `experimentalMinChunkSize` before proceeding

### Phase C — landing-route diet (after gate passes)

**C1. `matchmaking-core.ts` extraction — DECIDED: variant (a)-minimal**
- Move pure zone (~lines 1–968: types, consts, helpers, `RatingEngine`, `computeWinProbability`, `MatchmakerEngine`) → `src/services/matchmaking-core.ts`
- `matchmaking.ts` keeps class + `export * from './matchmaking-core'` + imports what it needs → **zero changes to ~15 existing importers/specs**
- Repoint only `LandingPaddleStack.vue:393`
- Shared helpers used by both → live in core, `matchmaking.ts` imports back (one-directional)
- Effort ~half day; `vue-tsc` enumerates stragglers; run matchmaking specs after
- Fallback if measurement shows trivial cost: skip entirely — hydrate <1ms fresh, ~3–10ms parse residual

**C2. Chunk-load-error handler (PROMOTED to required by red-team)**
- GitHub Pages `max-age=600` + deploy-deleted hashed chunks = stale index.html → dead chunk URLs → blank page; `vite:preloadError` can't catch entry failures but CAN catch lazy-route chunk failures (our main new risk)
- Add handler: `window.addEventListener('vite:preloadError', () => location.reload())` in entry or boot
- Document residual: entry-chunk 404 still needs hard reload (pre-existing, unchanged)

## Expected impact (revised, honest)

| Metric | Now | After B1+B2 | After +C1 |
|---|---|---|---|
| Boot-eager JS (entry graph) | ~3.0–3.3MB | ~0.9–1.3MB **est. — VERIFY at gate** | same |
| First-visit wire JS | ~907KB | ~350–450KB est. | same |
| Landing-route JS | includes 3.5k-line matchmaking | same (lazy chunk) | −150–250KB |
| SW precache of app shell | ❌ vendor.js >2MiB dropped | ✅ restored if vendor <2MiB | ✅ |
| `/`→`/profile` redirect | n/a | +1 chunk RTT for logged-in cold starts (SW mitigates after install) | same |

## Verification

1. Gate build after B2 (above) — eager-byte budget assertion
2. Final `quasar build -m pwa` → modulepreload audit + `sw.js` vendor.js presence check
3. `npm run lint` + `npm test` (matchmaking/announcer specs)
4. Smoke: `/`, `/book`, `/profile`, `/club/x`, `/play` cold + warm; watch console for chunk errors; measure `/`→`/profile` redirect chunk latency
5. Headless-Chrome waterfall re-measure → append to `BOOT_PERF_AUDIT.md`

## Explicitly NOT doing

- Per-package manualChunks groups — same bytes, cycle risk
- Raising Workbox `maximumFileSizeToCacheInBytes` — papers over bloat
- Meta Pixel deferral standalone — already async, ~1KB
- Immutable caching — impossible on GitHub Pages (`max-age=600` fixed)
- `playerProfile` lazy-init on Login/Play/Clubs — optional, low value
- ECharts selective imports — do later if `/profile` profiling warrants (fix B2 already defers it)
