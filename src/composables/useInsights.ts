import { ref, shallowRef } from 'vue';
import { LocalStorage } from 'quasar';

export type InsightStatus =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'loading'
  | 'ready'
  | 'generating'
  | 'done'
  | 'error'
  | 'unsupported';

// Mobile-first model ladder. All are prebuilt MLC models with
// low_resource_required. Sizes: 1.7B ≈ 1.4GB download / 2.0GB VRAM,
// 0.8B ≈ 0.9GB / 1.6GB, 4B ≈ 2.5GB / 3.4GB.
const MODEL_HIGH = 'Qwen3-4B-q4f16_1-MLC';
const MODEL_STD = 'Qwen3-1.7B-q4f16_1-MLC';
const MODEL_LOW = 'Qwen3.5-0.8B-q4f16_1-MLC';

// Universal CPU fallback (llama.cpp WASM) — no WebGPU needed. Works on
// blocklisted GPUs, iOS Safari, in-app webviews. Single-thread build because
// multi-thread requires COOP/COEP headers that would break cross-origin API
// calls. ~470MB weights, cached by wllama after first download.
const WASM_GGUF_URL =
  'https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_K_M.gguf';

const INSIGHT_CACHE_KEY = 'dm_insight_cache_v1';
const INSIGHT_CACHE_MAX = 30;

// Payload hash drives caching: unchanged stats -> instant cached insight,
// new match data -> new hash -> regenerate.
function payloadHash(contextLabel: string, stats: unknown): string {
  const s = contextLabel + '|' + JSON.stringify(stats);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

type InsightCacheEntry = { text: string; ts: number; ctx?: string };

function readInsightCache(): Record<string, InsightCacheEntry> {
  try {
    return (
      (LocalStorage.getItem(INSIGHT_CACHE_KEY) as Record<
        string,
        InsightCacheEntry
      > | null) ?? {}
    );
  } catch {
    return {};
  }
}

// Most recent cached entry for the same context — shown upfront while a
// fresh insight generates, so the card is never empty on data changes.
function latestForContext(
  cache: Record<string, InsightCacheEntry>,
  ctx: string,
): InsightCacheEntry | null {
  let best: InsightCacheEntry | null = null;
  for (const entry of Object.values(cache)) {
    if (entry.ctx === ctx && (!best || entry.ts > best.ts)) best = entry;
  }
  return best;
}

// Some models emit <think>…</think> blocks even with thinking disabled —
// strip them before display or caching.
function stripThink(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?think>/gi, '')
    .trim();
}

// Any await that can legitimately hang (worker init, a wedged inference
// stream, a parked mutex) gets a bounded wait — never wait forever.
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out`)), ms),
    ),
  ]);
}

// Streams are consumed via explicit iterator so a stall between tokens
// can be detected and aborted.
async function* timedStream<T>(
  stream: AsyncIterable<T>,
  idleMs: number,
): AsyncGenerator<T> {
  const it = stream[Symbol.asyncIterator]();
  for (;;) {
    const next = await withTimeout(it.next(), idleMs, 'Generation stalled');
    if (next.done) return;
    yield next.value;
  }
}

// Workers and WASM libs throw plain objects, not always Error.
function describeErr(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function writeInsightCache(hash: string, ctx: string, text: string) {
  try {
    LocalStorage.set(INSIGHT_USED_KEY, true);
    const all = readInsightCache();
    all[hash] = { text, ts: Date.now(), ctx };
    const keys = Object.keys(all);
    if (keys.length > INSIGHT_CACHE_MAX) {
      keys
        .sort((a, b) => all[a].ts - all[b].ts)
        .slice(0, keys.length - INSIGHT_CACHE_MAX)
        .forEach((k) => delete all[k]);
    }
    LocalStorage.set(INSIGHT_CACHE_KEY, all);
  } catch {
    /* storage full or unavailable — caching is best-effort */
  }
}

const SYSTEM_PROMPT =
  'You are a pickleball sports analyst doing live TV commentary. Given JSON ' +
  'stats plus precomputed storylines, deliver one punchy broadcast-style ' +
  'segment (3-5 short sentences, plain text, no markdown, no bullet lists). ' +
  'Lead with the headline story (dominance, tight race, streak). Use vivid ' +
  'broadcast language ("on a tear", "breathing down their neck", ' +
  '"the duo to beat") but stay accurate — use only the numbers given, ' +
  'first names only, never invent stats. Interpret storylines into drama: ' +
  'gaps mean dominance, small margins mean a battle, high synergy means ' +
  'chemistry, negative recent form means slumping.';

// Engine state is module-level: every insight card shares one worker/model
// instance — spawning a second WebGPU/WASM engine per card would be heavy.
const sharedEngine = shallowRef<
  import('@mlc-ai/web-llm').WebWorkerMLCEngine | null
>(null);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sharedWasmEngine = shallowRef<any>(null);
const sharedModelId = ref('');
const sharedIsCpuMode = ref(false);
let sharedWorker: Worker | null = null;
// Serializes concurrent generateInsight calls from multiple cards.
let engineBusy = false;
// Single in-flight init shared by warm-up and card requests.
let enginePromise: Promise<void> | null = null;

const INSIGHT_USED_KEY = 'dm_insight_used';
let warmStarted = false;

export function useInsights() {
  const status = ref<InsightStatus>('idle');
  const progressText = ref('');
  const progressPct = ref(0);
  const output = ref('');
  const staleOutput = ref('');
  const error = ref('');
  const modelId = sharedModelId;
  const isCpuMode = sharedIsCpuMode;
  const engine = sharedEngine;
  const wasmEngine = sharedWasmEngine;

  // Pick the biggest model the adapter can plausibly hold. WebLLM does its
  // own limit check during init and throws — we catch and step down.
  async function pickModel(): Promise<string | null> {
    const nav = navigator as Navigator & {
      gpu?: {
        requestAdapter: () => Promise<{
          limits: { maxStorageBufferBindingSize: number };
        } | null>;
      };
      deviceMemory?: number;
    };
    if (!nav.gpu) {
      error.value = 'WebGPU API not exposed by this browser.';
      return null;
    }
    try {
      const adapter = await nav.gpu.requestAdapter();
      if (!adapter) {
        error.value =
          'WebGPU adapter rejected — this GPU is likely blocklisted or too old.';
        return null;
      }
      const lim = adapter.limits;
      const storageBuf = lim.maxStorageBufferBindingSize;
      const mem = nav.deviceMemory ?? 0;
      const mobileUA = /Android|iPhone|iPad/i.test(navigator.userAgent);
      // <128MB storage buffers can't bind MLC kernels.
      if (storageBuf < 128 * 1024 * 1024) return MODEL_LOW;
      if (!mobileUA && (mem === 0 || mem >= 8)) return MODEL_HIGH;
      if (mem > 0 && mem < 4) return MODEL_LOW;
      return MODEL_STD;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      return null;
    }
  }

  async function createEngine(id: string) {
    if (!sharedWorker) {
      sharedWorker = new Worker(
        new URL('../workers/insights.worker.ts', import.meta.url),
        { type: 'module' },
      );
    }
    const webllm = await import('@mlc-ai/web-llm');
    // Worker init can hang on driver/shader issues — bound it and step
    // down the ladder instead of waiting forever.
    return withTimeout(
      webllm.CreateWebWorkerMLCEngine(sharedWorker, id, {
        initProgressCallback: (p) => {
          progressText.value = p.text;
          progressPct.value = Math.round((p.progress || 0) * 100);
          status.value = /fetch|cache|download/i.test(p.text)
            ? 'downloading'
            : 'loading';
        },
      }),
      240_000,
      'Model init',
    );
  }

  // A wedged engine can never be awaited or reused — kill the worker so
  // the next request starts fresh.
  function resetEngine() {
    try {
      sharedWorker?.terminate();
    } catch {
      /* already dead */
    }
    sharedWorker = null;
    engine.value = null;
    enginePromise = null;
  }

  async function ensureEngine() {
    if (engine.value) return;
    // Share one in-flight init: a warm-up running while a card requests
    // must not trigger a second worker reload.
    if (enginePromise) {
      status.value = 'loading';
      progressText.value = 'Warming up model…';
      return enginePromise;
    }
    enginePromise = doEnsureEngine();
    try {
      await enginePromise;
    } finally {
      enginePromise = null;
    }
  }

  async function doEnsureEngine() {
    status.value = 'checking';
    const candidate = await pickModel();
    if (!candidate) {
      status.value = 'unsupported';
      if (!error.value)
        error.value = 'This device/browser does not support WebGPU inference.';
      return;
    }
    const ladder = [candidate, MODEL_STD, MODEL_LOW];
    let lastErr: unknown = null;
    for (const id of new Set(ladder)) {
      try {
        const e = await createEngine(id);
        engine.value = e as import('@mlc-ai/web-llm').WebWorkerMLCEngine;
        modelId.value = id;
        status.value = 'ready';
        return;
      } catch (err) {
        lastErr = err;
        console.warn(`[insights] model ${id} failed to init`, err);
        // A failed or timed-out init leaves the worker in a bad state —
        // respawn it before the next ladder attempt.
        try {
          sharedWorker?.terminate();
        } catch {
          /* already dead */
        }
        sharedWorker = null;
      }
    }
    status.value = 'error';
    error.value = describeErr(lastErr) || 'Failed to load AI model.';
  }

  /**
   * llama.cpp WASM path — runs on CPU in every modern browser. Used when
   * WebGPU is absent, blocklisted, or every GPU model failed to init.
   */
  async function runCpuFallback(contextLabel: string, stats: unknown) {
    status.value = 'checking';
    try {
      const { Wllama } = await import('@wllama/wllama');
      const wasmUrl = (await import('@wllama/wllama/esm/wasm/wllama.wasm?url'))
        .default;
      if (!wasmEngine.value) {
        wasmEngine.value = new Wllama({ default: wasmUrl });
        status.value = 'downloading';
        progressText.value = 'Downloading on-device model (CPU mode)…';
        await withTimeout(
          wasmEngine.value.loadModelFromUrl(WASM_GGUF_URL, {
            progressCallback: (p: { loaded: number; total: number }) => {
              progressPct.value = p.total
                ? Math.round((p.loaded / p.total) * 100)
                : 0;
              progressText.value = `Downloading model… ${Math.round(p.loaded / 1048576)} MB`;
            },
          }),
          600_000,
          'Model download',
        );
        modelId.value = 'Qwen3-0.6B (CPU)';
        isCpuMode.value = true;
      }
      status.value = 'generating';
      const chunks = await wasmEngine.value.createChatCompletion({
        stream: true,
        temperature: 0.4,
        max_tokens: 220,
        chat_template_kwargs: { enable_thinking: false },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `/no_think\n${contextLabel} stats:\n${JSON.stringify(stats)}`,
          },
        ],
      });
      for await (const chunk of timedStream(chunks, 120_000)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        output.value += (chunk as any).choices?.[0]?.delta?.content || '';
      }
      output.value = stripThink(output.value);
      if (output.value)
        writeInsightCache(
          payloadHash(contextLabel, stats),
          contextLabel,
          output.value,
        );
      staleOutput.value = '';
      status.value = 'done';
    } catch (err) {
      console.error('[insights] CPU fallback failed', err);
      status.value = 'error';
      error.value = describeErr(err) || 'On-device AI unavailable.';
    }
  }

  /**
   * Generate a short narrative insight over a compact stats payload.
   * Weights are cached by the browser (Cache API/OPFS) after the first
   * download, so this works fully offline once loaded.
   */
  async function generateInsight(
    contextLabel: string,
    stats: unknown,
    force = false,
  ) {
    const hash = payloadHash(contextLabel, stats);
    if (!force) {
      const cache = readInsightCache();
      const hit = cache[hash];
      if (hit) {
        output.value = hit.text;
        status.value = 'done';
        return;
      }
      // Data changed: show the last insight for this context upfront
      // while the new one generates.
      const stale = latestForContext(cache, contextLabel);
      staleOutput.value = stale ? stale.text : '';
    } else {
      const prev = readInsightCache()[hash];
      staleOutput.value = prev ? prev.text : '';
    }
    // Shared engine: queue concurrent generations instead of interleaving.
    // Show a waiting state so the card never looks dead while parked.
    // Cap the wait: a wedged generation would otherwise block forever.
    if (engineBusy) {
      status.value = 'checking';
      progressText.value = 'Waiting for another insight…';
      const deadline = Date.now() + 120_000;
      while (engineBusy && Date.now() < deadline)
        await new Promise((r) => setTimeout(r, 400));
      if (engineBusy) {
        console.warn('[insights] generation mutex stuck — resetting engine');
        engineBusy = false;
        resetEngine();
      }
    }
    engineBusy = true;
    try {
      output.value = '';
      error.value = '';
      if (!engine.value && !wasmEngine.value) await ensureEngine();
      if (!engine.value) {
        // No GPU model: the CPU path generates via its own engine,
        // loading weights first only when not already in memory.
        await runCpuFallback(contextLabel, stats);
        return;
      }
      status.value = 'generating';
      try {
        const stream = await engine.value.chat.completions.create({
          stream: true,
          temperature: 0.4,
          max_tokens: 200,
          messages: [
            {
              role: 'system',
              content: SYSTEM_PROMPT,
            },
            {
              role: 'user',
              content: `/no_think\n${contextLabel} stats:\n${JSON.stringify(stats)}`,
            },
          ],
        });
        for await (const chunk of timedStream(stream, 90_000)) {
          output.value += chunk.choices[0]?.delta?.content || '';
        }
      } catch (gpuErr) {
        // GPU generation can fail after init (OOM, worker crash, stalled
        // stream) — the CPU path is slower but still delivers an insight.
        console.error('[insights] GPU generation failed, trying CPU', gpuErr);
        output.value = '';
        resetEngine();
        await runCpuFallback(contextLabel, stats);
        return;
      }
      output.value = stripThink(output.value);
      if (output.value) writeInsightCache(hash, contextLabel, output.value);
      staleOutput.value = '';
      status.value = 'done';
    } catch (err) {
      console.error('[insights] generation failed', err);
      status.value = 'error';
      error.value = describeErr(err) || 'Insight generation failed.';
    } finally {
      engineBusy = false;
    }
  }

  async function unload() {
    try {
      await engine.value?.unload();
    } catch {
      /* worker teardown */
    }
    engine.value = null;
    sharedWorker?.terminate();
    sharedWorker = null;
    status.value = 'idle';
    output.value = '';
  }

  return {
    status,
    progressText,
    progressPct,
    output,
    staleOutput,
    error,
    modelId,
    isCpuMode,
    generateInsight,
    ensureEngine,
    unload,
  };
}

/**
 * Pre-load the GPU model while the app is idle. Only runs for users who
 * have generated an insight before — their next session opens with the
 * engine already warm, so the card skips the ~10s model init.
 */
export function warmInsights() {
  if (warmStarted || sharedEngine.value || sharedWasmEngine.value) return;
  if (!LocalStorage.getItem(INSIGHT_USED_KEY)) return;
  warmStarted = true;
  // Hidden instance: its status/progress refs are never rendered.
  useInsights()
    .ensureEngine()
    .catch((err) => {
      console.warn('[insights] warm-up failed', err);
    });
}
