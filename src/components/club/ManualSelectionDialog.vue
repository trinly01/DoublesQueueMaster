<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :maximized="$q.screen.lt.md"
    transition-show="slide-up"
    transition-hide="slide-down"
  >
    <q-card
      class="bg-white"
      style="
        max-width: 700px;
        width: 95vw;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
      "
    >
      <!-- Header -->
      <DialogHeader
        :title="`${matchType === 'singles' ? 'Singles' : 'Doubles'} Match Selection`"
        icon="touch_app"
      />

      <!-- Content -->
      <q-card-section class="q-pa-md" style="flex: 1; overflow-y: auto">
        <div class="manual-selection-container">
          <!-- Step 1: Select Players -->
          <div v-if="manualSelectionStep === 1" class="selection-step">
            <div class="text-h6 q-mb-sm">
              Step 1: Select
              {{ matchType === 'singles' ? '2' : '4' }} Players
            </div>
            <div class="text-caption text-grey-7 q-mb-sm">
              Click on players to select them for the match ({{
                selectedPlayers.length
              }}/{{ matchType === 'singles' ? 2 : 4 }} selected)
            </div>

            <q-list separator bordered class="rounded-borders">
              <PlayerCard
                v-for="player in queue"
                :key="player.username"
                :player="player"
                :isSelected="isPlayerSelected(player)"
                :showActions="true"
                :show-feedback-button="false"
                @click="$emit('toggle-player', player)"
                class="player-selection-item cursor-pointer"
              >
                <template #actions="{ player }">
                  <q-checkbox
                    :model-value="isPlayerSelected(player)"
                    color="accent"
                    @click.stop="$emit('toggle-player', player)"
                  />
                </template>
              </PlayerCard>
            </q-list>
          </div>

          <!-- Step 2: Arrange Teams -->
          <div v-if="manualSelectionStep === 2" class="arrangement-step">
            <div class="text-h6 q-mb-sm">Step 2: Arrange Teams</div>

            <TeamArrangement
              :team1="manualTeam1"
              :team2="manualTeam2"
              @update:team1="$emit('update:manualTeam1', $event)"
              @update:team2="$emit('update:manualTeam2', $event)"
              :create-balanced-match="createBalancedMatch"
            />
          </div>
        </div>
      </q-card-section>

      <!-- Footer Actions -->
      <q-separator />
      <q-card-actions align="right" class="q-pa-md">
        <!-- Step 1 Actions -->
        <template v-if="manualSelectionStep === 1">
          <q-btn
            flat
            label="Cancel"
            color="grey"
            @click="$emit('cancel')"
          />
          <q-btn
            v-if="matchType === 'doubles'"
            color="accent"
            label="Next: Arrange Teams"
            icon-right="arrow_forward"
            @click="$emit('proceed')"
            :disable="selectedPlayers.length !== 4"
          />
          <q-btn
            v-else
            color="accent"
            label="Create Match"
            icon="check"
            @click="$emit('create')"
            :disable="selectedPlayers.length !== 2"
          />
        </template>

        <!-- Step 2 Actions (Team Arrangement) -->
        <template v-else-if="manualSelectionStep === 2">
          <q-btn
            flat
            label="Back"
            icon="arrow_back"
            color="grey"
            @click="$emit('back')"
          />
          <q-btn
            flat
            label="Cancel"
            color="grey"
            @click="$emit('cancel')"
          />
          <q-btn
            color="accent"
            label="Create Match"
            icon="check"
            @click="$emit('create')"
            :disable="manualTeam1.length !== 2 || manualTeam2.length !== 2"
          />
        </template>
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { useQuasar } from 'quasar';
import DialogHeader from '../DialogHeader.vue';
import PlayerCard from '../PlayerCard.vue';
import TeamArrangement from '../TeamArrangement.vue';
import type { Player } from '../../services/matchmaking';

defineOptions({ name: 'ManualSelectionDialog' });

const $q = useQuasar();

defineProps<{
  modelValue: boolean;
  matchType: 'singles' | 'doubles';
  manualSelectionStep: 1 | 2;
  selectedPlayers: Player[];
  manualTeam1: Player[];
  manualTeam2: Player[];
  queue: Player[];
  isPlayerSelected: (player: Player) => boolean;
  createBalancedMatch: (players: Player[]) => Player[];
}>();

defineEmits<{
  'update:modelValue': [value: boolean];
  'update:manualTeam1': [value: Player[]];
  'update:manualTeam2': [value: Player[]];
  'toggle-player': [player: Player];
  'cancel': [];
  'proceed': [];
  'create': [];
  'back': [];
}>();
</script>
