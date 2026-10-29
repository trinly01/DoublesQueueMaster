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

          <q-banner
            v-if="unlinkedNames.length > 0 && !isUnratedMode"
            dense
            rounded
            class="bg-orange-1 text-orange-9"
          >
            <template v-slot:avatar>
              <q-icon name="link_off" color="orange-9" />
            </template>
            <div class="text-weight-medium">
              Ratings won't update — {{ unlinkedNames.join(', ') }}
              {{ unlinkedNames.length === 1 ? 'has' : 'have' }} no linked
              account.
            </div>
            <div class="text-caption">
              Guests still get local rating movement for matchmaking.
            </div>
          </q-banner>
          <q-banner
            v-else-if="isUnratedMode"
            dense
            rounded
            class="bg-grey-2 text-grey-9"
          >
            <template v-slot:avatar>
              <q-icon name="block" color="grey-7" />
            </template>
            <div class="text-weight-medium">
              {{ modeLabel }} mode doesn't update ratings — this match is
              recorded for history only.
            </div>
          </q-banner>

          <MatchResult
            v-if="matchData"
            :teamA="matchData.teamA"
            :teamB="matchData.teamB"
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
import type { TeamPlayer } from '../../types/player';
import { getMatchmakingModeLabel } from '../../composables/useMatchSettings';
import DialogHeader from '../DialogHeader.vue';
import MatchResult from '../MatchResult.vue';

defineOptions({ name: 'MatchResultDialog' });

const $q = useQuasar();

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
    winProbability: m.winProbability as number,
    status: m.status as string,
    startedAt: m.startedAt as Date | undefined,
    matchmakingMode: m.matchmakingMode as string | undefined,
  };
});

// Modes that never write ratings (Casual / Social). Mirrors the
// save-completed-match flow's RATED_MODES allowlist.
const UNRATED_MODES = new Set(['fair_balance', 'variety_first']);

const isUnratedMode = computed(
  () =>
    !!matchData.value?.matchmakingMode &&
    UNRATED_MODES.has(matchData.value.matchmakingMode),
);

const modeLabel = computed(() =>
  getMatchmakingModeLabel(matchData.value?.matchmakingMode || ''),
);

const unlinkedNames = computed(() =>
  [...(matchData.value?.teamA || []), ...(matchData.value?.teamB || [])]
    .filter((p) => !p.userId)
    .map((p) => p.firstName || p.username),
);
</script>
