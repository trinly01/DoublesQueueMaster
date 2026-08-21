<template>
  <div
    v-if="meta && (meta.generationType || meta.generatedBy)"
    class="row justify-center q-gutter-xs q-mt-xs"
  >
    <q-chip
      v-if="meta.isEdited"
      color="amber-3"
      text-color="amber-10"
      size="xs"
      dense
      icon="edit"
    >
      Edited
      <q-tooltip
        v-if="meta.originalMatchup || meta.editedAt || meta.updatedAt"
        anchor="top middle"
        self="bottom middle"
        :offset="[0, 8]"
      >
        <div class="text-center">
          <div v-if="meta.originalMatchup">
            <div>{{ meta.originalTeamA }}</div>
            <div>VS</div>
            <div>{{ meta.originalTeamB }}</div>
          </div>
          <div v-if="editDateLabel" class="q-mt-xs">
            {{ editDateLabel }}
          </div>
        </div>
      </q-tooltip>
    </q-chip>
    <q-chip
      v-else-if="meta.generationType === 'auto'"
      color="green-2"
      text-color="green-9"
      size="xs"
      dense
      icon="auto_awesome"
    >
      Auto
    </q-chip>
    <q-chip
      v-else-if="meta.generationType === 'manual'"
      color="orange-2"
      text-color="orange-9"
      size="xs"
      dense
      icon="pan_tool"
    >
      Manual
    </q-chip>
    <q-chip
      v-if="
        meta.generationType === 'auto' && !meta.isEdited && meta.matchmakingMode
      "
      color="blue-grey-2"
      text-color="blue-grey-9"
      size="xs"
      dense
      icon="balance"
    >
      {{ modeLabel(meta.matchmakingMode) }}
      <q-tooltip
        v-if="modeDescription(meta.matchmakingMode)"
        anchor="top middle"
        self="bottom middle"
        :offset="[0, 8]"
      >
        {{ modeDescription(meta.matchmakingMode) }}
      </q-tooltip>
    </q-chip>
    <q-chip
      v-if="meta.generatedBy"
      color="grey-3"
      text-color="grey-9"
      size="xs"
      dense
      icon="person"
    >
      <q-tooltip anchor="top middle" self="bottom middle" :offset="[0, 8]"
        >Created by</q-tooltip
      >
      {{ meta.generatedBy }}
    </q-chip>
    <q-chip
      v-if="meta.editedBy"
      color="amber-3"
      text-color="amber-10"
      size="xs"
      dense
      icon="edit_note"
    >
      <q-tooltip anchor="top middle" self="bottom middle" :offset="[0, 8]"
        >Edited by</q-tooltip
      >
      {{ meta.editedBy }}
    </q-chip>
    <q-chip
      v-if="meta.scoredBy"
      color="green-2"
      text-color="green-9"
      size="xs"
      dense
      icon="check_circle"
    >
      <q-tooltip anchor="top middle" self="bottom middle" :offset="[0, 8]"
        >Scored by</q-tooltip
      >
      {{ meta.scoredBy }}
    </q-chip>
    <q-chip
      v-if="meta.cancelledBy"
      color="red-2"
      text-color="negative"
      size="xs"
      dense
      icon="cancel"
    >
      <q-tooltip anchor="top middle" self="bottom middle" :offset="[0, 8]"
        >Cancelled by</q-tooltip
      >
      {{ meta.cancelledBy }}
    </q-chip>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { MatchMeta } from '../types/matchMeta';
import {
  getMatchmakingModeLabel,
  getMatchmakingModeDescription,
} from '../composables/useMatchSettings';
import { formatDate } from '../utils/playerHelpers';

const props = defineProps<{
  meta?: MatchMeta;
}>();

const modeLabel = getMatchmakingModeLabel;
const modeDescription = getMatchmakingModeDescription;

const editDateLabel = computed(() => {
  if (!props.meta) return '';
  const editTime = props.meta.editedAt ?? props.meta.updatedAt;
  if (!editTime) return '';
  return formatDate(editTime);
});
</script>
