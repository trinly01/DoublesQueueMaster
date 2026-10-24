import { ref, shallowRef } from 'vue';

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

const SYSTEM_PROMPT =
  'You are a pickleball club analyst. Given JSON stats, write one short ' +
  'paragraph (3-4 sentences, plain text, no markdown) highlighting ' +
  'notable performances, streaks, and tight races. Use first names only. ' +
  'Never invent numbers.';

export function useInsights() {
  const status = ref<InsightStatus>('idle');
  const progressText = ref('');
  const progressPct = ref(0);
  const output = ref('');
  const error = ref('');
  const modelId = ref('');
  const engine = shallowRef<
    import('@mlc-ai/web-llm').WebWorkerMLCEngine | null
  >(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wasmEngine = shallowRef<any>(null);
  const isCpuMode = ref(false);
  let worker: Worker | null = null;

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
    if (!worker) {
      worker = new Worker(
        new URL('../workers/insights.worker.ts', import.meta.url),
        { type: 'module' },
      );
    }
    const webllm = await import('@mlc-ai/web-llm');
    return webllm.CreateWebWorkerMLCEngine(worker, id, {
      initProgressCallback: (p) => {
        progressText.value = p.text;
        progressPct.value = Math.round((p.progress || 0) * 100);
        status.value = /fetch|cache|download/i.test(p.text)
          ? 'downloading'
          : 'loading';
      },
    });
  }

  async function ensureEngine() {
    if (engine.value) return;
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
      }
    }
    status.value = 'error';
    error.value =
      lastErr instanceof Error ? lastErr.message : 'Failed to load AI model.';
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
        await wasmEngine.value.loadModelFromUrl(WASM_GGUF_URL, {
          progressCallback: (p: { loaded: number; total: number }) => {
            progressPct.value = p.total
              ? Math.round((p.loaded / p.total) * 100)
              : 0;
            progressText.value = `Downloading model… ${Math.round(p.loaded / 1048576)} MB`;
          },
        });
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
      for await (const chunk of chunks) {
        output.value += chunk.choices?.[0]?.delta?.content || '';
      }
      status.value = 'done';
    } catch (err) {
      status.value = 'unsupported';
      error.value =
        err instanceof Error ? err.message : 'On-device AI unavailable.';
    }
  }

  /**
   * Generate a short narrative insight over a compact stats payload.
   * Weights are cached by the browser (Cache API/OPFS) after the first
   * download, so this works fully offline once loaded.
   */
  async function generateInsight(contextLabel: string, stats: unknown) {
    output.value = '';
    error.value = '';
    if (!wasmEngine.value) await ensureEngine();
    if (!engine.value && !wasmEngine.value) {
      await runCpuFallback(contextLabel, stats);
      return;
    }
    if (!engine.value) return;
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
      for await (const chunk of stream) {
        output.value += chunk.choices[0]?.delta?.content || '';
      }
      status.value = 'done';
    } catch (err) {
      status.value = 'error';
      error.value =
        err instanceof Error ? err.message : 'Insight generation failed.';
    }
  }

  async function unload() {
    try {
      await engine.value?.unload();
    } catch {
      /* worker teardown */
    }
    engine.value = null;
    worker?.terminate();
    worker = null;
    status.value = 'idle';
    output.value = '';
  }

  return {
    status,
    progressText,
    progressPct,
    output,
    error,
    modelId,
    isCpuMode,
    generateInsight,
    unload,
  };
}
