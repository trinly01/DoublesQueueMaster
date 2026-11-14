// P2P netcode telemetry — singleton metrics sink.
// Exposed as window.__dqmNet for live debugging (devtools console).
// All writers are best-effort; never throws, never blocks the game loop.

const MAX_SAMPLES = 120;
const MAX_DIVERGENCE_SAMPLES = 60;

function ringPush<T>(arr: T[], v: T, max: number) {
  arr.push(v);
  if (arr.length > max) arr.shift();
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((p / 100) * sorted.length)),
  );
  return sorted[idx];
}

export interface NetMetrics {
  /** RTT samples in ms (ring, last 120 pings) */
  rttSamples: number[];
  /** State-packet inter-arrival gaps in ms (ring, last 120) */
  stateGapsMs: number[];
  /** Count of gaps exceeding thresholds */
  gapBuckets: { g66: number; g100: number; g200: number };
  /** Last measured state payload size in bytes (JSON, pre-seq) */
  payloadBytes: number;
  /** EWMA of state payload bytes/sec */
  bytesPerSec: number;
  /** Guest: |localPredictedPos - hostAuthoritativePos| samples (meters) */
  posDivergenceSamples: number[];
  posDivergenceP50: number;
  posDivergenceP95: number;
  /** Render FPS (EMA) */
  fps: number;
  /** Longtask (>50ms) count and total ms observed during play */
  longtaskCount: number;
  longtaskTotalMs: number;
  /** Join-phase timestamps (performance.now() at each milestone) */
  joinMarks: Record<string, number>;
  /** Host: performance.now() of last received input packet */
  lastInputAt: number;
  /** State packets received/sent counters */
  stateRx: number;
  stateTx: number;
}

export const netMetrics: NetMetrics = {
  rttSamples: [],
  stateGapsMs: [],
  gapBuckets: { g66: 0, g100: 0, g200: 0 },
  payloadBytes: 0,
  bytesPerSec: 0,
  posDivergenceSamples: [],
  posDivergenceP50: 0,
  posDivergenceP95: 0,
  fps: 0,
  longtaskCount: 0,
  longtaskTotalMs: 0,
  joinMarks: {},
  lastInputAt: 0,
  stateRx: 0,
  stateTx: 0,
};

export function recordRtt(ms: number) {
  if (ms >= 0 && ms < 10000) ringPush(netMetrics.rttSamples, ms, MAX_SAMPLES);
}

let lastGapMark = 0;
export function recordStateArrival(nowMs: number) {
  netMetrics.stateRx++;
  if (lastGapMark > 0) {
    const gap = nowMs - lastGapMark;
    if (gap > 0 && gap < 2000) {
      ringPush(netMetrics.stateGapsMs, gap, MAX_SAMPLES);
      if (gap > 66) netMetrics.gapBuckets.g66++;
      if (gap > 100) netMetrics.gapBuckets.g100++;
      if (gap > 200) netMetrics.gapBuckets.g200++;
    }
  }
  lastGapMark = nowMs;
}

export function resetStateGapMark() {
  lastGapMark = 0;
}

let lastPayloadAt = 0;
export function recordPayloadBytes(bytes: number, nowMs: number) {
  netMetrics.payloadBytes = bytes;
  netMetrics.stateTx++;
  if (lastPayloadAt > 0) {
    const dt = (nowMs - lastPayloadAt) / 1000;
    if (dt > 0) {
      netMetrics.bytesPerSec = netMetrics.bytesPerSec * 0.9 + (bytes / dt) * 0.1;
    }
  }
  lastPayloadAt = nowMs;
}

export function recordPosDivergence(distMeters: number) {
  if (!isFinite(distMeters) || distMeters < 0 || distMeters > 50) return;
  ringPush(
    netMetrics.posDivergenceSamples,
    distMeters,
    MAX_DIVERGENCE_SAMPLES,
  );
  const sorted = [...netMetrics.posDivergenceSamples].sort((a, b) => a - b);
  netMetrics.posDivergenceP50 = percentile(sorted, 50);
  netMetrics.posDivergenceP95 = percentile(sorted, 95);
}

let fpsEma = 0;
export function recordFrame(dtSec: number) {
  if (dtSec <= 0 || dtSec > 1) return;
  const inst = 1 / dtSec;
  fpsEma = fpsEma === 0 ? inst : fpsEma * 0.95 + inst * 0.05;
  netMetrics.fps = Math.round(fpsEma);
}

export function recordLongtasks(count: number, totalMs: number) {
  netMetrics.longtaskCount += count;
  netMetrics.longtaskTotalMs += totalMs;
}

export function markJoin(phase: string) {
  netMetrics.joinMarks[phase] = performance.now();
}

export function percentileOf(arr: number[], p: number): number {
  return percentile([...arr].sort((a, b) => a - b), p);
}

// Install the debug handle once, as early as possible.
if (typeof window !== 'undefined') {
  (window as unknown as { __dqmNet?: NetMetrics }).__dqmNet = netMetrics;
}
