<template>
  <q-dialog v-model="modelValue" :maximized="$q.screen.lt.md">
    <q-card
      flat
      class="bg-white player-feedback-dialog shadow-0"
      style="
        min-width: 340px;
        max-width: 480px;
        width: 95vw;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
      "
    >
      <q-card-section class="q-pa-none">
        <q-toolbar class="q-pa-md">
          <q-toolbar-title>
            <q-icon name="notifications" class="q-mr-sm" />
            Feedback
          </q-toolbar-title>
          <q-btn icon="close" flat round dense color="grey" @click="close">
            <q-tooltip anchor="top middle" self="bottom middle" :offset="[8, 8]"
              >Close</q-tooltip
            >
          </q-btn>
        </q-toolbar>
      </q-card-section>

      <q-card-section class="q-pa-md q-pt-lg" style="flex: 1; overflow-y: auto">
        <div v-if="loading" class="flex flex-center q-py-lg">
          <q-spinner color="primary" size="40px" />
        </div>

        <div
          v-else-if="feedback.length === 0"
          class="text-center q-py-lg text-grey-6"
        >
          <q-icon name="inbox" size="48px" />
          <div class="text-h6 q-mt-sm">No feedback yet</div>
        </div>

        <q-list separator v-else>
          <q-item
            v-for="item in feedback"
            :key="item.id"
            :class="item.type === 'report' ? 'bg-red-1' : 'bg-green-1'"
          >
            <q-item-section avatar>
              <q-icon
                :name="item.type === 'report' ? 'report_problem' : 'thumb_up'"
                :color="item.type === 'report' ? 'negative' : 'positive'"
                size="28px"
              />
            </q-item-section>

            <q-item-section>
              <q-item-label class="text-weight-medium">
                {{ item.type === 'report' ? 'Report by' : 'Kudos by' }}
                <span v-if="item.type === 'report'" class="text-grey-7"
                  >Anonymous</span
                >
                <span v-else class="ellipsis">{{
                  item.reporterName || 'Unknown'
                }}</span>
                <span
                  v-if="item.type === 'commend' && item.reporterUsername"
                  class="text-caption text-grey-6"
                >
                  (@{{ item.reporterUsername }})
                </span>
              </q-item-label>
              <q-item-label class="q-gutter-xs q-mt-sm">
                <q-chip
                  v-for="reason in item.reasons"
                  :key="reason.key"
                  dense
                  size="sm"
                  :icon="reason.icon"
                  :color="item.type === 'report' ? 'negative' : 'positive'"
                  text-color="white"
                >
                  {{ reason.label }}
                </q-chip>
              </q-item-label>
              <q-item-label
                v-if="item.comments && item.type !== 'report'"
                caption
                class="q-mt-sm text-grey-8"
              >
                {{ item.comments }}
              </q-item-label>
            </q-item-section>

            <q-item-section side>
              <span class="text-caption text-grey-6">
                {{ formatDateOnly(item.dateUpdated || item.dateCreated) }}
              </span>
            </q-item-section>
          </q-item>
        </q-list>
      </q-card-section>

      <q-separator />
      <q-card-actions align="right" class="q-pa-md">
        <q-btn flat label="Close" color="grey" @click="close" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuasar, LocalStorage } from 'quasar';
import { formatDateOnly } from 'src/utils/playerHelpers';
import {
  COMMEND_ITEMS,
  REPORT_ITEMS,
  getPlayerFeedback,
  getUserInfo,
  type FeedbackEntry,
  type ReportItem,
} from 'src/services/playerReport';

interface FeedbackItem extends FeedbackEntry {
  reporterName?: string;
  reporterUsername?: string;
  reasons: ReportItem[];
}

const props = defineProps<{
  modelValue: boolean;
  playerId: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'read'): void;
}>();

const $q = useQuasar();

const loading = ref(false);
const feedback = ref<FeedbackItem[]>([]);

const modelValue = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
});

const readKey = computed(() => `feedback_read_${props.playerId}`);
const cacheKey = computed(() => `feedback_cache_${props.playerId}`);

function getReadIds(): string[] {
  const raw = LocalStorage.getItem(readKey.value);
  if (!raw) return [];
  try {
    return Array.isArray(raw) ? (raw as string[]) : [];
  } catch {
    return [];
  }
}

function saveReadIds(ids: string[]) {
  LocalStorage.set(readKey.value, ids);
}

function markAllAsRead() {
  const readIds = new Set(getReadIds());
  feedback.value.forEach((item) => readIds.add(item.id));
  saveReadIds([...readIds]);
  emit('read');
}

function loadCachedFeedback(): FeedbackItem[] | null {
  const raw = LocalStorage.getItem(cacheKey.value);
  if (!raw) return null;
  try {
    return Array.isArray(raw) ? (raw as FeedbackItem[]) : null;
  } catch {
    return null;
  }
}

function saveCachedFeedback(items: FeedbackItem[]) {
  LocalStorage.set(cacheKey.value, items);
}

async function loadFeedback() {
  const cached = loadCachedFeedback();
  if (cached) {
    feedback.value = cached;
    loading.value = false;
  } else {
    loading.value = true;
  }

  const entries = await getPlayerFeedback(props.playerId);

  const enriched = await Promise.all(
    entries.map(async (entry) => {
      const reporter =
        entry.type === 'commend'
          ? await getUserInfo(entry.reporter)
          : { name: null, username: null };
      const sourceItems =
        entry.type === 'report' ? REPORT_ITEMS : COMMEND_ITEMS;
      const reasons = entry.content.items
        .map((key) => sourceItems.find((i) => i.key === key))
        .filter((i): i is ReportItem => !!i);
      return {
        ...entry,
        reporterName: reporter.name || undefined,
        reporterUsername: reporter.username || undefined,
        reasons,
      };
    }),
  );

  feedback.value = enriched;
  saveCachedFeedback(enriched);
  loading.value = false;
}

function close() {
  emit('update:modelValue', false);
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      void loadFeedback();
    }
  },
);

watch(
  () => feedback.value.length,
  (len) => {
    if (len > 0 && props.modelValue) {
      markAllAsRead();
    }
  },
);
</script>

<style scoped>
.player-feedback-dialog {
  border-radius: 16px;
  overflow: hidden;
}

.player-feedback-dialog :deep(.q-item__section--main) {
  min-width: 0;
}

.player-feedback-dialog :deep(.q-item__label.text-weight-medium),
.player-feedback-dialog :deep(.q-item__label.text-grey-6) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
