# Agent Notes — DinkMatch

## Environment

- **Node ≥22.22.0 required for `quasar dev`/`quasar build`** (@quasar/app-vite 2.6.x enforces it). Default shell node may be older — use `nvm use 24.21.0` (or any installed ≥22.22) before building. `vitest`/`eslint`/`vue-tsc` run fine on older node.
- Windows + Git Bash. nvm-windows root: `%LOCALAPPDATA%\nvm`.

## Commands

- `npm test` — vitest (23 files / ~590 tests)
- `npm run typecheck` — `vue-tsc --noEmit` (vue-tsc 2.x; the vite-plugin-checker `vueTsc` overlay was removed — it only supports vue-tsc 1.x)
- `npm run lint` — eslint
- `npm run build` — `quasar build -m pwa`, outputs to `docs/` (GitHub Pages). **Rebuild and commit `docs/` whenever `src/` ships.**

## Toolchain (post-2025 upgrade)

- quasar 2.35.3, @quasar/app-vite 2.6.2 (rolldown-vite underneath), vue 3.5.45, typescript ~5.8.3, vue-tsc ~2.2.x.
- `tsconfig.json` has **inlined compilerOptions** — app-vite 2.6 removed `tsconfig-preset`; do not re-add `extends: "@quasar/app-vite/tsconfig-preset"`.
- `skipLibCheck: true` is set — required (workbox/vite .d.ts noise across duplicate vite majors).
- vue-tsc 3.x reports false-positive TS6133 on string template `ref="x"` bindings; 2.x does not — stay on 2.x unless 3.x issues are resolved.

## Architecture pointers

- `src/services/matchmaking.ts` — `LocalMatchmakingSystem` (deep `reactive()` AppState). `saveState()` = ~11 O(state) enforce/purge passes → `schedulePersist()` (idle-deferred LS write) → `onStateChange` → cloud-sync debounce.
- `src/composables/useCloudSync.ts` — realtime WS (50ms max-lastModified coalescer), 20s staleness poll, CAS push (`date_updated` precondition), reset-advantage detection. **Reset contract: `.devin/handoffs/reset-detection-contract.md` — do not bypass collection-granular reset adoption.**
- `src/utils/perfTelemetry.ts` — `perfMeasure(name, fn)` marks + `observeLongTasks()`/`drainLongTasks()` for jank investigation.
- Perf work tracked in `UI_PERF_FIX_PLAN.md` / `UI_PERF_AUDIT.md`; reset saga in `RESET_DECISION.md`.
