<template>
  <div v-if="!sticky" class="row justify-end relative-position">
    <q-btn
      fab-mini
      icon="notifications"
      color="accent"
      class="absolute-top-right q-ma-md z-top"
      @click="openDialog"
    >
      <q-badge
        v-if="unreadCount > 0"
        color="negative"
        floating
        rounded
        style="top: -4px; right: -4px"
      >
        {{ unreadCount > 99 ? '99+' : unreadCount }}
      </q-badge>
      <q-tooltip anchor="bottom middle" self="top middle" :offset="[8, 8]"
        >Feedback</q-tooltip
      >
    </q-btn>

    <PlayerFeedbackDialog
      v-model="showDialog"
      :player-id="playerId"
      @read="refreshCount"
    />
  </div>

  <div v-else class="relative-position">
    <q-page-sticky position="top-right" :offset="[18, 18]">
      <q-btn fab-mini icon="notifications" color="accent" @click="openDialog">
        <q-badge
          v-if="unreadCount > 0"
          color="negative"
          floating
          rounded
          style="top: -4px; right: -4px"
        >
          {{ unreadCount > 99 ? '99+' : unreadCount }}
        </q-badge>
        <q-tooltip anchor="bottom middle" self="top middle" :offset="[8, 8]"
          >Feedback</q-tooltip
        >
      </q-btn>
    </q-page-sticky>

    <PlayerFeedbackDialog
      v-model="showDialog"
      :player-id="playerId"
      @read="refreshCount"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { getPlayerFeedback } from 'src/services/playerReport';
import PlayerFeedbackDialog from './PlayerFeedbackDialog.vue';

const props = defineProps<{
  playerId: string;
  sticky?: boolean;
}>();

const showDialog = ref(false);
const unreadCount = ref(0);

const readKey = computed(() => `feedback_read_${props.playerId}`);

function getReadIds(): string[] {
  const raw = localStorage.getItem(readKey.value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function refreshCount() {
  const readIds = new Set(getReadIds());
  const feedback = await getPlayerFeedback(props.playerId);
  unreadCount.value = feedback.filter((item) => !readIds.has(item.id)).length;
}

function openDialog() {
  showDialog.value = true;
}

onMounted(() => {
  void refreshCount();
});
</script>
