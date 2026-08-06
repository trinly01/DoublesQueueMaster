<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :maximized="$q.screen.lt.md"
  >
    <q-card
      class="bg-white"
      style="
        max-width: 800px;
        width: 95vw;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
      "
    >
      <!-- Header -->
      <DialogHeader title="Match Result" icon="emoji_events" />

      <!-- Content -->
      <q-card-section
        class="q-pa-md"
        style="flex: 1; overflow-y: auto"
        v-if="matchData"
      >
        <div class="q-gutter-y-md">
          <div class="text-subtitle1 text-center q-mb-sm">
            Enter match scores
          </div>

          <MatchResult
            v-if="matchData"
            :teamA="matchData.teamA"
            :teamB="matchData.teamB"
            :court="matchData.court"
            :winProbability="matchData.winProbability"
            :status="matchData.status"
            :startedAt="
              matchData.startedAt
                ? matchData.startedAt.toISOString()
                : undefined
            "
            editable
            :teamAScore="teamAScore"
            :teamBScore="teamBScore"
            @update:teamAScore="$emit('update:teamAScore', $event)"
            @update:teamBScore="$emit('update:teamBScore', $event)"
          />
        </div>
      </q-card-section>

      <!-- Footer Actions -->
      <q-separator />
      <q-card-actions align="right" class="q-pa-md">
        <q-btn
          flat
          label="Cancel"
          color="grey"
          @click="$emit('update:modelValue', false)"
        />
        <q-btn
          color="accent"
          :disable="!canCompleteMatch"
          @click="$emit('complete')"
          label="Complete Match"
          icon="check"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useQuasar } from 'quasar';
import DialogHeader from '../DialogHeader.vue';
import MatchResult from '../MatchResult.vue';

defineOptions({ name: 'MatchResultDialog' });

const $q = useQuasar();

interface TeamPlayer {
  username: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  level?: number;
  rating?: number;
}

const props = defineProps<{
  modelValue: boolean;
  currentMatch: Record<string, unknown> | null;
  teamAScore: number;
  teamBScore: number;
  canCompleteMatch: boolean;
}>();

defineEmits<{
  'update:modelValue': [value: boolean];
  'update:teamAScore': [value: number];
  'update:teamBScore': [value: number];
  complete: [];
}>();

const matchData = computed(() => {
  const m = props.currentMatch;
  if (!m) return null;
  return {
    teamA: m.teamA as TeamPlayer[],
    teamB: m.teamB as TeamPlayer[],
    court: m.court as number,
    winProbability: m.winProbability as number,
    status: m.status as string,
    startedAt: m.startedAt as Date | undefined,
  };
});
</script>
