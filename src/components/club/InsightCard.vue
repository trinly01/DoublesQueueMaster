<template>
  <q-card flat bordered class="insight-card">
    <q-card-section class="q-py-sm">
      <div class="row items-center no-wrap q-mb-xs">
        <q-icon
          name="auto_awesome"
          color="accent"
          size="16px"
          :class="{ 'insight-sparkle': busy }"
        />
        <span class="text-caption text-weight-bold q-ml-xs"
          >On-device AI insight</span
        >
        <q-space />
        <q-btn
          v-if="status === 'done'"
          icon="refresh"
          flat
          round
          dense
          size="xs"
          text-color="accent"
          @click="requestInsight(true)"
        >
          <q-tooltip>Regenerate</q-tooltip>
        </q-btn>
        <q-btn
          icon="close"
          flat
          round
          dense
          size="xs"
          @click="$emit('close')"
        />
      </div>
      <template
        v-if="
          status === 'downloading' ||
          status === 'loading' ||
          status === 'checking'
        "
      >
        <q-linear-progress
          :value="progressPct / 100"
          color="accent"
          class="q-mb-xs"
        />
        <div class="text-caption text-grey-7">
          {{ progressText || 'Preparing on-device model…' }}
        </div>
        <div v-if="status === 'downloading'" class="text-caption text-grey-5">
          One-time model download. Cached afterwards — works offline.
          <template v-if="isCpuMode"
            >CPU mode — slower but works on this device.</template
          >
        </div>
      </template>
      <div
        v-else-if="status === 'unsupported'"
        class="text-caption text-grey-7"
      >
        On-device AI needs a WebGPU-capable browser (Chrome on Android, Safari
        18+ on recent iPhones).
        <div v-if="error" class="text-grey-5 q-mt-xs">{{ error }}</div>
      </div>
      <div v-else-if="status === 'error'" class="text-caption">
        <span class="text-negative">{{ error }}</span>
        <q-btn
          label="Retry"
          flat
          dense
          size="sm"
          color="accent"
          class="q-ml-sm"
          @click="requestInsight(true)"
        />
      </div>
      <div v-if="displayText" class="insight-text q-mt-xs">
        <div
          v-if="staleShown"
          class="text-caption text-grey-5 row items-center q-mb-xs"
        >
          <q-spinner-dots size="14px" class="q-mr-xs" /> Updating…
        </div>
        <span v-html="formatted" :class="{ 'insight-stale': staleShown }"></span
        ><span v-if="status === 'generating' && isCpuMode" class="text-grey-5">
          (CPU mode — ~1 min)</span
        >
      </div>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { useInsights } from '../../composables/useInsights';

defineOptions({ name: 'InsightCard' });

const props = defineProps<{
  contextLabel: string;
  stats: unknown;
}>();

defineEmits<{ close: [] }>();

const {
  status,
  progressText,
  progressPct,
  output,
  staleOutput,
  error,
  isCpuMode,
  generateInsight,
} = useInsights();

const busy = computed(() =>
  ['checking', 'downloading', 'loading', 'generating'].includes(status.value),
);

// Small models leak markdown no matter what the prompt says. Escape HTML
// first, then render the common bits: **bold**, *em*, headings, bullets.
// Show the previous insight upfront while a fresh one generates —
// new tokens replace it as they stream in.
const staleShown = computed(
  () => !output.value && !!staleOutput.value && busy.value,
);

const displayText = computed(() => output.value || staleOutput.value);

const formatted = computed(() => {
  const esc = displayText.value
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?think>/gi, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return esc
    .replace(/^#{1,4}\s*(.+)$/gm, '<strong>$1</strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*•]\s+/gm, '• ')
    .replace(/\n{2,}/g, '<br><br>')
    .replace(/\n/g, '<br>');
});

function requestInsight(force = false) {
  generateInsight(props.contextLabel, props.stats, force);
}

onMounted(() => requestInsight());

// Different stats -> different hash -> regenerate automatically.
watch(
  () => JSON.stringify(props.stats),
  () => requestInsight(),
);
</script>

<style scoped>
.insight-card {
  border-radius: 10px;
  background: #fafaff;
  margin-bottom: 8px;
}
.insight-stale {
  opacity: 0.55;
}
.insight-text {
  font-size: 12.5px;
  line-height: 1.55;
  color: #444;
}
.insight-sparkle {
  animation: insight-sparkle 1.1s ease-in-out infinite;
}
@keyframes insight-sparkle {
  0%,
  100% {
    transform: scale(1) rotate(0deg);
    opacity: 1;
  }
  50% {
    transform: scale(1.3) rotate(18deg);
    opacity: 0.55;
  }
}
</style>
