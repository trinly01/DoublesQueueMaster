# Boot Performance Audit — DinkMatch PWA

> Read-only audit. No code changed. Findings ranked by estimated impact on
> time-to-first-paint / time-to-interactive for a first-time visitor.
> Sources: static analysis + live measurement of https://dinkmatch.club
> (2026-11-11). All 5 agent deep-dives complete and merged below.

---

## TL;DR

The server is fast (~0.5s TTFB, edge-cached). **The problem is client-side:
every visitor downloads and parses ~3.6 MB of JS (≈880 KB gzipped) before the
app can mount** — including Three.js, ECharts, a P2P websocket library, and a
QR scanner that most visitors never use. The cause is two config/code choices
that defeat code-splitting:

1. `quasar.config.ts` `manualChunks` forces **all** of `node_modules` into one
   `vendor` chunk that loads eagerly at boot.
2. `src/router/routes.ts` **eagerly imports** `PlayerPage.vue` (3,405 lines,
   pulls ECharts + QRCode) and `ClubPage.vue` (5,494 lines, pulls cloud-sync,
   payments, QR scanner, 15+ dialogs) — so even the page code isn't deferred.

Fixing those two would likely cut first-load JS by 60–80% for landing/booking
visitors.

---

## Measured baselines

| Metric | Value | Source |
|---|---|---|
| HTML TTFB (edge) | 0.49–0.62 s curl / **162–194 ms** real nav | curl + headless Chrome |
| **First Contentful Paint** | **~1.2 s cold conn / ~0.48 s warm** | CDP measurement |
| **DOMContentLoaded (home)** | **~1.79 s cold / ~0.70 s warm** | CDP measurement |
| `/book` shell DCL | ~0.65 s — but **venue data usable ~2.2–3.9 s** | CDP measurement |
| index.html size | 14.6 KB (5.4 KB wire) | curl + CDP |
| Caching | `x-cache: HIT` (Fastly); hashed assets `max-age=14400` **no immutable** | headers + CDP |
| API TTFB (api.dinkmatch.club) | ~0.33–0.40 s ping; **item queries 1.2–1.75 s + CORS preflight** | curl + CDP |
| Total JS shipped | **3,567 KB** across 27 files | build output |
| `vendor-*.js` | **2,862 KB** (≈880 KB gz) | docs/assets |
| `index-*.js` (app code) | 483 KB | docs/assets |
| CSS total | 266 KB (vendor CSS 196 KB) | docs/assets |
| Fonts (woff/woff2 on disk) | ~416 KB across 8 files | docs/assets |
| SW precache entries | 52 assets | docs/sw.js |
| PlayPage chunk | 100 KB (lazy ✓) | docs/assets |
| LandingPage chunk | 48 KB (lazy ✓) | docs/assets |

Server/CDN is NOT the bottleneck. Everything below is client-side.

---

## Findings

### F1 — CRITICAL: `manualChunks` collapses all dependencies into one eager vendor chunk

`quasar.config.ts:68-72`:

```ts
manualChunks: (id: string) => {
  if (id.includes('node_modules')) {
    return 'vendor';
  }
},
```

Every npm dependency — used or not, lazy-route or not — lands in `vendor`,
which `main.js` imports eagerly. Rollup cannot split `three`, `echarts`,
`@trystero-p2p/nostr`, `edge-tts`, `html5-qrcode`, `qrcode`, `@likha-erp/likha-sdk`
into per-route chunks because the function returns `'vendor'` for all of them.

**Result:** `vendor-*.js` = 2.86 MB and it is render-blocking for every route,
including the anonymous landing page and `/book` checkout flow.

Estimated heavy residents (from `package.json` + import graph):

| Package | Used by | Approx. min+gz |
|---|---|---|
| `echarts` | PlayerPage only | ~350 KB gz |
| `three` + `@tresjs/core` | PlayPage (Play 3D) only | ~160–200 KB gz |
| `@trystero-p2p/nostr` | useP2P (club sync) | moderate |
| `@kingdanx/edge-tts-browser` | announcer/edgeTts | moderate |
| `html5-qrcode` + `qrcode` | AddPlayerDialog, profile QR | moderate |
| `quasar` + `vue` + `vue-router` | everything (legit core) | ~150 KB gz |

### F2 — CRITICAL: `PlayerPage.vue` and `ClubPage.vue` are eagerly imported

`src/router/routes.ts:2-4`:

```ts
import MainLayout from 'layouts/MainLayout.vue';
import PlayerPage from 'pages/PlayerPage.vue';   // ← static, not lazy
import ClubPage from 'pages/ClubPage.vue';       // ← static, not lazy
```

Every other page uses `() => import(...)`. These two don't:

- **PlayerPage.vue — 3,405 lines**, 24 imports incl. `import * as echarts`,
  `qrcode`, likha-sdk, matchmaking, ratingReplay, runLeaderboard,
  useDupr, usePayment, useProFeatures. It is the `/profile` route — and `/`
  **redirects logged-in users to `/profile`** (router guard, index.ts:52-54),
  so this is the most common logged-in landing page.
- **ClubPage.vue — 5,494 lines**, 53 imports incl. useCloudSync, useClubData,
  usePayment, useProFeatures, useWakeLock, PlayerList, MatchCard,
  AddPlayerDialog (→ html5-qrcode), LeaderboardDialog, EditPlayerDialog,
  ReplacePlayerDialog, PlayerReportDialog, MatchResultDialog, DuprLogo,
  EmptyState, PayBanner — a small application inside one file.

Because they're static imports of the router module, their code + component
deps are in the eager path even though only one can render at a time.

### F3 — HIGH: `likha` boot file awaits a token refresh before mount (logged-in users)

`src/boot/likha.ts:5-34` — `boot(async ...)` is awaited by Quasar before the
app mounts. When `dink-auth` exists and `expires_at` is near/past, it
`await likhaClient.refresh()` — a network roundtrip (~330–400 ms API TTFB)
**on the critical path before first paint**.

Anonymous visitors skip it entirely (`LocalStorage.has('dink-auth')` false) —
so this only hits returning logged-in users, who are arguably the majority of
repeat traffic. Mitigations exist in comments (only refresh when near expiry),
but the await still serializes mount behind the API when it does fire.

### F4 — HIGH: path-style URLs cause a full double-boot

Two layers now rewrite `pathname → #/path` via `location.replace`:

- `index.html:346-362` (pre-bundle inline IIFE — runs first, good)
- `src/boot/cleanUrl.ts:37-44` (fallback for stale-cached HTML)

For `dinkmatch.club/book` (no hash): inline script replaces URL → **full page
reload** → second load boots the app with `#/book`. Every path-style visit =
2× HTML + 2× JS parse/boot (JS is cache-warm the second time, but boot and
parse still run twice). First-time `/book` visitors pay the 3.6 MB download
**twice-ish** (once per document load, though HTTP cache dedupes the bytes).

This is inherent to hash-router + pretty paths, but worth noting since `/book`
is a primary CTA. Alternative: history-mode router behind a real server
rewrite (not possible on GitHub Pages), or accept the cost.

### F5 — MEDIUM: Meta Pixel loads in `<head>` on every page

`index.html:263-291` — fbevents.js injected synchronously in head (async
script, but still competes for bandwidth/CPU at boot, plus its own
subresource chain). ~100 KB+ third-party JS + tracking overhead on every
visit including `/book` checkout where conversion tracking matters but speed
does too.

### F6 — MEDIUM: font payload

`quasar.config.ts:31-32` extras → `roboto-font` (6 weights, ~350 KB woff on
disk) + `material-icons` (128 KB woff2). Browsers fetch per-weight on first
use — Roboto 400/500/700 likely = ~150–200 KB. `font-display:block` on
Material Icons means icon text can block paint briefly. Self-hosted (good —
no Google Fonts roundtrip), but the icon font is monolithic: every icon user
pays the full 128 KB.

### F7 — MEDIUM: service worker precaches ~52 assets (~4 MB) on first visit

`docs/sw.js` precache manifest = 52 entries ≈ the whole JS+CSS+fonts payload.
GenerateSW precaches at SW install — on a first visit this download competes
with critical resources; on repeat visits it's why the app feels fast (good).
`skipWaiting`/`clientsClaim` set (good for updates). Trade-off is standard
for installable PWAs; flag only because first-visit bandwidth is already the
problem in F1.

### F8 — LOW: `useSessionGuard` + `App.vue` mount hooks

`App.vue` starts session-guard listeners onMounted (visibilitychange/pageshow
→ conditional `likhaClient.refresh()`). Event listeners only — no eager
network. Fine.

### F9 — LOW: SEO fallback div

`index.html:384-427` + inline CSS — actually *helps* perceived performance:
crawlable landing copy paints before Vue mounts. Keep.

---

## What's already good

- Edge caching + small HTML (14.6 KB), fast TTFB
- Real code-splitting exists for most pages (Play/Book/Landing/Clubs/Login
  are lazy chunks)
- SW `skipWaiting`+`clientsClaim`, navigateFallbackDenylist for SEO files
- No render-blocking external scripts besides Meta Pixel
- Boot files minimal: cleanUrl (sync, cheap) + likha (conditional await)
- Router guard is synchronous LocalStorage check — no blocking fetch

---

## Recommended fix order (for later — NOT applied)

1. **Split vendor chunk** — replace blanket `manualChunks` with per-package
   grouping (e.g. `echarts`, `three`, `quasar/vue`, rest) OR remove it and let
   Rollup auto-split so lazy routes defer their deps.
2. **Lazy-import PlayerPage + ClubPage** in routes.ts (one-line each) —
   instantly removes echarts/QR/cloud-sync from anonymous+landing path.
3. **Dynamic-import heavy libs** inside pages (`await import('echarts')` in
   PlayerPage chart setup; `import('three')` in PlayPage) so they follow the
   route chunk.
4. Consider deferring Meta Pixel to `requestIdleCallback`/after-mount.
5. Re-measure with the waterfall agent's method after changes.
6. **Consolidate auth keys** (F31): derive guard state from `likha-data`
   expiry, not the `dink-auth` flag — kills the stale-flag → 401 cascade.
7. **Deduplicate mount queries** (F32): share `completed_match` fetch
   between profile/recent-clubs; skip `checkClubMembership` when
   `loadClubData` already returned membership; batch feedback user lookups.
8. **Cache headers** (F26): hashed assets need `max-age=31536000,
   immutable` — GitHub Pages/Fastly `_headers` or `docs/.headers` config.
9. **URGENT before next deploy** (F37): add
   `globIgnores: ['**/ads/**','**/*.mp4']` to `extendGenerateSWOptions` —
   next build would precache all 18 ad MP4s (~60 MB) for every first visit.
10. **Housekeeping** (F11/F20/F12): remove `public/ads/*.mp4` (~60 MB) and
    dead files from deploy; extend `navigateFallbackDenylist` to cover
    `csv|mp4|woff2?`; fix duplicate logo fetch (F25).
11. **Kill the double-boot** (F36): switch the path→hash rewrite in
    `index.html` from `location.replace` to `history.replaceState` — the
    script only runs inside index.html so it's safe; router picks up the
    hash without a reload. Keep `location.replace` in `404.html`.

---

## Appendix — files inspected

- `quasar.config.ts` (build.manualChunks, pwa.workbox, extras, boot order)
- `src/router/routes.ts`, `src/router/index.ts`
- `src/boot/cleanUrl.ts`, `src/boot/likha.ts`
- `src/App.vue`, `src/layouts/MainLayout.vue`
- `src/pages/{PlayerPage,ClubPage,PlayPage,LandingPage}.vue` (import graphs)
- `index.html` (inline scripts, pixel, icons, SEO fallback)
- `docs/` build output (asset sizes, sw.js precache count)
- `package.json` (12 runtime deps)

## Agent report — live waterfall measurement (COMPLETE, headless Chrome CDP)

Real navigation timing against https://dinkmatch.club (cache disabled, SW
bypassed, fresh profile, no throttling). Scripts/data in
`%TEMP%\dinkmeasure\`.

### Measured timings

| Page | FCP | DOMContentLoaded | Load event | Wire bytes |
|---|---|---|---|---|
| `/` cold conn (rep1) | **1196 ms** | 1789 ms | ~1795 ms | 1.83 MiB / 20 req |
| `/` warm conn (rep2) | 480 ms | 698 ms | 699 ms | 1.83 MiB |
| `/#/book` | ~440 ms | **~650 ms** | ~650 ms | 1.62 MiB / 23 req |

### The `/book` hidden waterfall — API latency dominates content

SPA shell paints fast (~650 ms) but **venue data isn't usable until
~2.2–3.9 s**:

- `GET /items/book_tenants` — **1454–1755 ms** for a 576 B–1.4 KB payload
  (pure latency, not bandwidth)
- `GET /items/book_courts` — **1167–1445 ms**
- Both require **CORS preflight OPTIONS** — an extra round trip each
- Venue logo (185 KB) can't start until tenants JSON returns → finishes
  ~2.9–3.9 s

→ **F24 — Directus API latency is the real `/book` bottleneck**: ~1.2–1.75 s
per call + preflight, sequential-ish. Not a frontend bundle problem — a
backend/network-path problem (api.dinkmatch.club TTFB ~330–400 ms measured
by curl, but item queries take 3–5× that under load/ cold conn).

### Top resources by wire bytes (home page)

| Resource | Wire | Decoded | Share |
|---|---|---|---|
| `vendor-*.js` | **907 KB** | 2.86 MB | **47% of page weight** |
| `queue master logo-*.png` ×2 (!) | ~370 KB | — | ~10% — **fetched TWICE** |
| Material Icons woff2 | 129 KB | — | |
| `index-*.js` | 126 KB | 483 KB | |
| `fbevents.js` + signals config | **~210 KB** | ~800 KB | Meta Pixel |
| vendor CSS | 36 KB | 201 KB | |
| 4× Roboto woff | ~83 KB | — | |

### New findings

- **F25 — Duplicate logo fetch**: `queue master logo.png` (185 KB) fetched
  **twice** on the wire in all cold runs (identical ETag) — racy cache-dedup
  failure (~10% of page bytes wasted).
- **F26 — Hashed assets served `max-age=14400` (4 h), no `immutable`** —
  Vite content-hashed filenames should get `max-age=31536000, immutable`.
  GitHub Pages/Fastly config issue, not app code. HTML `max-age=600` is fine.
- **F27 — Meta Pixel total cost ~210 KB** wire (~800 KB decoded) per load —
  bigger than estimated; fires `PageView` pre-mount.
- **F28 — Longtasks modest**: ~0.4–0.7 s cumulative main-thread blocking on
  home (largest single 275 ms) — no catastrophic jank; JS heap ~15–18 MB.
- **Clean run**: 0 failed requests, 0 exceptions, 0 console errors.
- h2 on fresh conn → h3/QUIC on reuse. Cloudflare beacon + RUM beacon minor.

### What this changes in the verdict

- First-visit JS weight confirmed: **~1.07 MB wire JS** (vendor 907 KB +
  index 126 KB) = ~59% of the 1.83 MiB page. F1/F2 remain the top fix.
- `/book` UX problem is **API latency + waterfall**, not bundle size —
  venue/court fetches + preflights + logo gating push usable content past
  2 s even though the shell paints at ~0.65 s.
- Repeat-visit (SW-controlled) numbers still unmeasured — worth one more
  pass with cache enabled if desired.

---

## Agent report — runtime network/data audit (COMPLETE)

Static trace of every API call per route + module-eval side effects.
Confirms waterfall measurements and adds new findings:

### Per-route request counts (verified statically)

| Route | API requests at mount | Notes |
|---|---|---|
| Anonymous `/` | **0** | Only pixel/fonts/logo/JS — confirmed |
| `/book` | 2 (tenants+courts, parallel) | spinner until resolved |
| `/book/v/:slug` | 7 | venue + 6 parallel bundle reads |
| `/book/v/:slug/book` | 8 | + day slots |
| `/openplay` | **0** | local sandbox mode |
| `/play` | 1 POST (TURN creds, module-eval) | lazy route only |
| `/profile` (logged-in `/` redirect target) | **~8–11** | fetchProfile 4–5 sequential + DUPR + recent clubs |
| `/clubs` | ~7–9 | `completed_match` queried **twice** (500 + 250) |
| `/club/:id` | **~8–10 + 2 WS subs** + 60s/20s timers | heaviest path; debounced sync = up to 4 reqs/push |

### New findings

- **F29 — Module-eval side effects in the eager bundle**: because
  `PlayerPage`/`ClubPage` are static imports, their module-level code runs
  on EVERY page load — `matchmaking.ts:3534` constructs
  `MatchmakingApp = new LocalMatchmakingSystem(2)` → synchronous
  `LocalStorage` read of the whole AppState blob + `pagehide` listener;
  `playerProfile.ts:321` same pattern; `useDeviceSettings.ts:48` reactive
  localStorage hydrate. CPU/parse cost on every visit, anonymous included.
- **F30 — `/play` TURN POST at module eval** (`useP2P.ts:143`):
  `fetchCloudflareTurnServers()` fires when the PlayPage chunk loads —
  one POST per page load, 5s timeout, non-blocking. Lazy route so not a
  boot cost, but fires even if user never starts a match.
- **F31 — Auth-key split can cause 401 logout cascade**: three separate
  localStorage keys — `dink-auth` (router guard/boot/session-guard),
  `likha-data` (SDK tokens), `current_user_id` (ClubPage cache). Stale
  `dink-auth` + dead `likha-data` passes the guard → first API call 401s
  → refresh fails → forced logout. Guard checks the flag, not validity.
- **F32 — Duplicate/overlapping reads on mount**: `completed_match`
  fetched at limit 500 (profile) AND limit 250 (recent clubs) on
  `/profile`+`/clubs`; club players M2M embedded in `loadClubData` payload
  AND re-fetched by auto-join `checkClubMembership`; club feedback does
  **N+1 user lookups** (one request per feedback entry).
- **F33 — Two API base-URL config paths**: hardcoded `LIKHA_URL`
  (`likhaClient.ts:10`) vs `localStorage['likhaUrl']` (`ClubPage.vue:2759`)
  — a stale manual value would split API vs asset hosts.
- **F34 — `navigateFallbackDenylist` replaces, not extends**: assigning
  `cfg.navigateFallbackDenylist` drops Workbox's default `sw.js`/`workbox-*`
  denylist entries (minor).
- **Confirmed good**: SW registration waits for `window.load` (post-load,
  non-blocking); no `runtimeCaching` → API never SW-cached (correct for
  fresh data); boot files run sequentially with `await` (cleanUrl→likha);
  `MatchmakingApp`/`useP2P`/`useCloudSync` do NOT connect at boot —
  realtime/P2P only on ClubPage/PlayPage mount.

---

## Agent report — CSS / fonts / static assets (COMPLETE)

### New findings

- **F17 — Quasar CSS monolith is render-blocking**: `vendor-*.css` ≈ **213 KiB**
  contains ALL Quasar component CSS — the same `manualChunks` vendor rule
  collapses component CSS into one global sheet, defeating Quasar's
  per-component CSS splitting. Plus `index-*.css` ≈ 52 KiB (inflated by eager
  PlayerPage/ClubPage styles). ~265 KiB render-blocking CSS on every route.
- **F18 — `book.scss` ships globally**: `src/css/app.scss` imports
  `book.scss` (~7.7 KB source) → all `/book` styles load on every route.
- **F19 — Logo PNG is heavy and eager**: `src/assets/queue master logo.png`
  (**184 KB**) imported by 10 components incl. LandingNav/LandingFooter →
  eager on `/`. Plus `public/queue master logo.png` — an **unreferenced
  duplicate** also shipped+precached.
- **F20 — Dead files**: `src/assets/quasar-logo-vertical.svg` (zero refs),
  `public/ads/*.mp4` — **18 videos ≈ 60+ MB** (BigScreen-16x9 alone 4.57 MB),
  zero references in `src/`; only 2 get SW-precached, rest are pure deploy
  bloat.
- **F21 — External avatar CDN**: `PlayerAvatar.vue` masked fallback loads
  `cdn.quasar.dev` JPGs with no `loading="lazy"`; book-page venue/court
  `<img>`s also lack lazy attrs.
- **F22 — Fonts detail**: Roboto shipped as `.woff` (not woff2), 6 weights
  (~15–20 KB each), only ~3 used; Material Icons woff2 ~110–130 KB with
  `font-display:block` and icons **above the fold on landing**
  (LandingNav + ~13 icons in LandingPaddleStack).
- **F23 — Splash PNGs precached**: all 15 `apple-launch-*.png` (est.
  0.5–4 MB total) in SW precache — iOS-only assets every user downloads.

### Ranked static weight (first paint)

1. vendor CSS 213 KiB (render-blocking)
2. index CSS 52 KiB (render-blocking, eager-page inflated)
3. Material Icons ~120 KB (first icon paint, `font-display:block`)
4. Roboto ~45–55 KB for used weights
5. logo PNG 184 KB (eager on landing)
6. SW precache background: ~4 MB splash/icons + all chunks + 2 MP4s

---

## Agent report — boot sequence deep-dive (COMPLETE, last to finish)

Full trace of Quasar's generated entry (`client-entry.js`): HTML parse →
inline IIFE → module scripts (entry + vendor modulepreload) → plugins +
router install (initial navigation starts, async) → boot files run
**sequentially awaited** → `app.mount` → lazy route chunks → `#seo-fallback`
hides via CSS sibling selector.

### New findings

- **F35 — Eager graph quantified at ~30,000 lines**: pages ~7,300
  (ClubPage ~4,500 + PlayerPage ~2,800) + services ~5,400 (incl.
  `matchmaking.ts` alone = **3,534 lines**) + composables ~7,300 +
  components ~8,500 (15 club dialogs) + utils ~1,900 — all evaluated at
  startup for every visitor. Only CourtPhotoDialog/ImageLightbox/
  AvoidPlayerDialog escaped via dynamic import.
- **F36 — `replaceState` could kill the double-boot** (refines F4): the
  path→hash rewrite in `index.html:358` uses `location.replace` → full
  reload. But that script ONLY ever runs inside `index.html` (404.html has
  its own script) — so `history.replaceState({}, '', '/#' + path + search)`
  is safe there and lets vue-router's hash history pick it up **without a
  reload**. Worth testing; eliminates F4 entirely for the SW-controlled
  case. Keep `location.replace` in `404.html`.
- **F37 — Next build will precache ALL 18 ad MP4s (~60 MB)**: current
  `docs/sw.js` is a stale build — only 2 MP4s made it under Workbox's
  2 MB/file cap. The other 16 were added to `public/ads/` after. On the
  next `quasar build -m pwa`, **every MP4 under 2 MB enters precache** →
  first-visit SW install could download tens of MB in background.
  **Add `globIgnores: ['**/ads/**','**/*.mp4']` before the next deploy.**
- **F38 — Module-eval singletons (sharpens F29)**: `matchmaking.ts:3534`
  `MatchmakingApp` → `loadState()` JSON.parse of entire club state +
  `reactive()` deep-wrap; `playerProfile.ts:321` same for profile
  (completedMatches/events arrays); `useDupr.ts:888` DuprServiceInstance.
  All synchronous main-thread work pre-mount; all cascade out of the entry
  chunk once routes go lazy.
- **Boot-order nuance**: router's initial navigation starts at plugin
  install — concurrent with boot awaits — so the likha-refresh delay (F3)
  is `max(refresh RTT, remaining chunk fetch)`, not purely additive.

### Praised as already-good

- `#seo-fallback` + `#q-app` sibling-hide = instant perceived content
- `animations: []` — zero animation CSS/JS shipped
- Lazy discipline otherwise clean; `useDupr` uses dynamic `import()` for
  heavy SDK calls; `leaderboard.worker` on-demand only
- `useCloudSync`/`useP2P` fully guarded — anonymous `/openplay` fires nothing

---

## Agent report — bundle/build deep-dive (COMPLETE)

Independent verification of the built `docs/` output. Confirms F1/F2 with
hard numbers and adds new findings:

### Verified in built output

- `docs/index.html:106-107` emits `<link rel="modulepreload" href="vendor-*.js">>`
  — vendor is **explicitly preloaded**, not just statically imported.
- `vendor-*.js` (2,854,914 B) confirmed to contain: echarts + zrender,
  three.js (107 `WebGLRenderer/THREE` marker hits), `@tresjs/core`,
  qrcode/aztec encoder, Html5Qrcode, trystero/nostr, edge-tts.
- **No `PlayerPage-*.js` or `ClubPage-*.js` chunk exists** — both compiled
  into `index-*.js` (482,554 B) alongside router + ~15 composables/services.
- Eager import chain extends further than routes: `edge-tts` is reachable
  via `announcer.ts → useAnnouncer → ClubPage` (eager); `html5-qrcode` via
  `AddPlayerDialog → ClubPage` (eager).
- `PlayerPage.vue:1733` uses `import * as echarts` — **full ECharts bundle,
  no tree-shaken modular imports** (~1 MB min before gzip).

### New findings

- **F10 — PWA precache is ~106 entries**, not 52 (my earlier grep undercounted
  — it only matched `assets/`). Includes all 17 `icons/apple-launch-*.png`
  iOS splash images, `screenshot.png` (1438×922, est. 200–600 KB), favicon
  set, 12 SEO HTML pages, `sitemap.xml`, `robots.txt`, `llms.txt`, `ai.txt`,
  and **2 orphaned `ads/*.mp4` files** (EveryGameCounts-16x9/-1x1 — Workbox's
  2 MB cap excluded the other 16 MP4s).
- **F11 — Orphaned deploy weight**: `public/ads/*.mp4` (18 videos) and
  `public/remotion/` media are **not referenced anywhere in `src/`** — dead
  weight shipped to every visitor's precache/download path.
- **F12 — `navigateFallbackDenylist` gap** (`quasar.config.ts:180-182`):
  covers `html|xml|txt|json|png|ico|svg|webmanifest` but **not `csv`, `mp4`,
  `woff`**. Navigating to `/club_match_csv_template.csv` under SW control
  returns `index.html` instead of the file.
- **F13 — Dead code**: `src-pwa/custom-service-worker.ts` exists but
  `workboxMode: 'GenerateSW'` ignores it (only used with InjectManifest).
- **F14 — Roboto fonts are `.woff`, not `.woff2`, with no `font-display`**
  (vendor CSS `@font-face`) → browser-default blocking behavior for body
  text; Material Icons is `font-display:block` → glyphs invisible until the
  ~128 KB font arrives.
- **F15 — No `dns-prefetch`/`preconnect`** for `api.dinkmatch.club` or
  `connect.facebook.net` in index.html — first API/pixel call pays full
  DNS+TLS setup on the critical path.
- **F16 — `vite-plugin-checker`** runs vueTsc + full eslint on every build
  (`{ server: false }`) — build-time cost only, no runtime impact.
- **Good**: `leaderboard.worker` spawns on-demand only (9.9 KB chunk);
  boot files compile to tiny dynamic-import chunks (~1.2 KB total);
  `likhaClient` SDK construction at module scope is cheap object creation.

### Open question raised

Does `@likha-erp/likha-sdk`'s `realtime()` open a websocket at import time?
`likhaClient.ts` constructs auth+rest+realtime at module scope — needs a
network-tab check (waterfall agent may capture this).

---

## Appendix — files inspected
