<template>
  <q-dialog v-model="modelValue" persistent :maximized="$q.screen.lt.md">
    <q-card
      class="bg-white player-report-dialog"
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
            <q-icon name="feedback" class="q-mr-sm" />
            Player Feedback
          </q-toolbar-title>
          <q-btn icon="close" flat round dense color="grey" @click="close">
            <q-tooltip anchor="top middle" self="bottom middle" :offset="[8, 8]"
              >Close</q-tooltip
            >
          </q-btn>
        </q-toolbar>
      </q-card-section>

      <q-card-section class="q-pa-md" style="flex: 1; overflow-y: auto">
        <div class="q-gutter-y-md">
          <div class="row items-center">
            <PlayerAvatar
              :name="targetPlayer?.firstName"
              :username="targetPlayer?.username"
              :user-id="targetPlayer?.userId"
              :dupr-id="targetPlayer?.duprId"
              :image-url="targetPlayer?.avatar"
              size="md"
            />
            <div class="q-ml-sm col">
              <div class="text-weight-medium">
                {{ targetPlayer?.firstName || targetPlayer?.username }}
              </div>
              <div class="text-caption text-grey-6">
                @{{ targetPlayer?.username }}
              </div>
            </div>
          </div>

          <q-btn-toggle
            v-model="activeType"
            spread
            class="full-width"
            color="grey-5"
            toggle-color="accent"
            :options="[
              { label: 'Report', value: 'report' },
              { label: 'Commend', value: 'commend' },
            ]"
          />

          <div class="text-subtitle2 text-grey-8">
            <q-icon
              :name="activeType === 'report' ? 'report_problem' : 'thumb_up'"
              class="q-mr-xs"
            />
            {{ activeType === 'report' ? 'Report reason' : 'Commend reason' }}
          </div>

          <q-list dense class="rounded-borders">
            <q-item
              v-for="item in activeItems"
              :key="item.key"
              tag="label"
              class="q-py-xs"
            >
              <q-item-section avatar>
                <q-checkbox v-model="selectedItems" :val="item.key" dense />
              </q-item-section>
              <q-item-section avatar>
                <q-icon
                  :name="item.icon"
                  :color="activeType === 'report' ? 'negative' : 'positive'"
                />
              </q-item-section>
              <q-item-section>
                <q-item-label class="text-weight-medium">{{
                  item.label
                }}</q-item-label>
                <q-item-label caption>{{ item.description }}</q-item-label>
              </q-item-section>
            </q-item>
          </q-list>

          <q-input
            v-model="comments"
            label="Additional comments (optional)"
            type="textarea"
            outlined
            autogrow
            :input-style="{ minHeight: '60px' }"
          >
            <template v-slot:prepend>
              <q-icon name="comment" />
            </template>
          </q-input>

          <q-banner
            v-if="isSelf"
            class="bg-negative-1 text-negative rounded-borders"
            dense
          >
            <template v-slot:avatar>
              <q-icon name="block" color="negative" />
            </template>
            You cannot report or commend yourself.
          </q-banner>
        </div>
      </q-card-section>

      <q-separator />
      <q-card-actions align="right" class="q-pa-md">
        <q-btn flat label="Cancel" color="grey" @click="close">
          <q-tooltip anchor="top middle" self="bottom middle" :offset="[8, 8]"
            >Cancel</q-tooltip
          >
        </q-btn>
        <q-btn
          label="Submit"
          color="accent"
          :loading="submitting"
          :disable="isSelf || selectedItems.length === 0"
          :icon="activeType === 'report' ? 'report' : 'send'"
          @click="submit"
        >
          <q-tooltip anchor="top middle" self="bottom middle" :offset="[8, 8]"
            >Submit</q-tooltip
          >
        </q-btn>
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useNotify } from 'src/composables/useNotify';
import PlayerAvatar from './PlayerAvatar.vue';
import {
  COMMEND_ITEMS,
  REPORT_ITEMS,
  submitPlayerReport,
  type ReportType,
} from 'src/services/playerReport';

interface Player {
  username: string;
  firstName?: string;
  userId?: string;
  duprId?: string;
  avatar?: string;
}

const props = defineProps<{
  modelValue: boolean;
  targetPlayer?: Player | null;
  currentUserId: string;
  clubId: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'submitted'): void;
}>();

const $q = useQuasar();
const { notify } = useNotify();

const activeType = ref<ReportType>('commend');
const selectedItems = ref<string[]>([]);
const comments = ref('');
const submitting = ref(false);

const modelValue = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
});

const activeItems = computed(() =>
  activeType.value === 'report' ? REPORT_ITEMS : COMMEND_ITEMS,
);

const isSelf = computed(
  () =>
    !!props.targetPlayer?.userId &&
    props.targetPlayer.userId === props.currentUserId,
);

function reset() {
  activeType.value = 'commend';
  selectedItems.value = [];
  comments.value = '';
}

function close() {
  emit('update:modelValue', false);
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      reset();
    }
  },
);

watch(activeType, () => {
  selectedItems.value = [];
});

async function submit() {
  if (!props.targetPlayer?.userId || !props.currentUserId || !props.clubId) {
    notify({ color: 'negative', message: 'Missing required information' });
    return;
  }

  if (selectedItems.value.length === 0) {
    notify({ color: 'warning', message: 'Select at least one reason' });
    return;
  }

  submitting.value = true;
  const result = await submitPlayerReport({
    player: props.targetPlayer.userId,
    reporter: props.currentUserId,
    type: activeType.value,
    content: { items: [...selectedItems.value] },
    comments: comments.value.trim() || undefined,
    club: props.clubId,
  });
  submitting.value = false;

  if (result.success) {
    notify({
      color: 'positive',
      message:
        activeType.value === 'report'
          ? 'Report submitted'
          : 'Commendation submitted',
    });
    emit('submitted');
    close();
  } else {
    notify({ color: 'negative', message: result.error });
  }
}
</script>

<style scoped>
.player-report-dialog {
  border-radius: 16px;
  overflow: hidden;
}
</style>
