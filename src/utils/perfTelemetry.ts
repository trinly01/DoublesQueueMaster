/**
 * Lightweight perf telemetry for UI jank investigation (UI_PERF_FIX_PLAN PR-A).
 *
 * - `perfMeasure` wraps synchronous hot paths with performance.mark/measure.
 * - `observeLongTasks` installs a PerformanceObserver('longtask') that buffers
 *   entries; `drainLongTasks()` returns and clears them (call from a debug UI
 *   or console sampler — NOT wired to UI by default to avoid overhead).
 * - All functions are no-ops when `performance`/`PerformanceObserver` are
 *   unavailable (SSR/tests) and marks are cheap (~µs) in production.
 */

const LONGTASK_BUFFER_MAX = 200;
const longTasks: { startTime: number; duration: number; name?: string }[] = [];
let observer: PerformanceObserver | null = null;

/** Install the longtask observer once. Idempotent. */
export function observeLongTasks(): void {
  if (observer || typeof PerformanceObserver === 'undefined') return;
  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (longTasks.length < LONGTASK_BUFFER_MAX) {
          longTasks.push({ startTime: entry.startTime, duration: entry.duration });
        }
      }
    });
    observer.observe({ entryTypes: ['longtask'] });
  } catch {
    observer = null;
  }
}

/** Drain buffered longtask entries (for manual inspection / debug sampling). */
export function drainLongTasks(): { startTime: number; duration: number; name?: string }[] {
  return longTasks.splice(0, longTasks.length);
}

/**
 * Measure a synchronous function. Emits `perf-<name>-start`/`perf-<name>-end`
 * marks + a `perf-<name>` measure visible in DevTools Performance panel.
 * Returns the function result unchanged. Overhead is two mark() calls.
 */
export function perfMeasure<T>(name: string, fn: () => T): T {
  if (typeof performance === 'undefined' || typeof performance.mark !== 'function') {
    return fn();
  }
  const start = `perf-${name}-start`;
  const end = `perf-${name}-end`;
  try {
    performance.mark(start);
    const result = fn();
    performance.mark(end);
    performance.measure(`perf-${name}`, start, end);
    return result;
  } catch (err) {
    try {
      performance.mark(end);
      performance.measure(`perf-${name}`, start, end);
    } catch {
      /* ignore */
    }
    throw err;
  }
}
