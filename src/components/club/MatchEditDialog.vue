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
      <DialogHeader title="Edit Match" icon="edit" />

      <!-- Content -->
      <q-card-section class="q-pa-md" style="flex: 1; overflow-y: auto">
        <!-- Step 1: Player Management -->
        <div v-if="manualSelectionStep === 1">
          <div class="text-h6 q-mb-sm">
            Step 1: Manage Players
            <q-chip
              :label="
                currentMatchType === 'singles'
                  ? 'Singles Match'
                  : 'Doubles Match'
              "
              :color="currentMatchType === 'singles' ? 'blue' : 'green'"
              text-color="white"
              size="sm"
              class="q-ml-sm"
            />
          </div>

          <!-- Current Players -->
          <div class="q-mb-lg">
            <div class="text-subtitle2 q-mb-sm">
              Current Players ({{ selectedPlayers.length }})
              <q-chip
                v-if="selectedPlayers.length < 2"
                color="orange"
                text-color="white"
                size="sm"
                class="q-ml-sm"
              >
                Need at least 2 players
              </q-chip>
            </div>
            <q-list bordered separator>
              <q-item
                v-for="player in selectedPlayers"
                :key="player.username"
                class="player-edit-item"
              >
                <q-item-section avatar>
                  <PlayerAvatar
                    :name="player.firstName"
                    :username="player.username"
                    :color="getRatingColor(player.rating)"
                    :user-id="player.userId"
                    :dupr-id="player.duprId"
                    :image-url="player.avatar"
                    size="md"
                  />
                </q-item-section>
                <q-item-section>
                  <q-item-label class="text-weight-medium">{{
                    player.firstName || player.username
                  }}</q-item-label>
                  <q-item-label
                    caption
                    class="text-grey-6"
                    v-if="player.username && player.firstName"
                  >
                    @{{ player.username }}
                  </q-item-label>
                  <q-item-label caption class="player-stats">
                    <span class="text-grey-7"
                      >G:{{ player.matchesPlayed }}</span
                    >
                    <span
                      class="q-ml-xs text-positive"
                      v-if="player.wins !== undefined"
                      >W:{{ player.wins || 0 }}</span
                    >
                    <span
                      class="q-ml-xs text-negative"
                      v-if="player.losses !== undefined"
                      >L:{{ player.losses || 0 }}</span
                    >
                    <q-chip
                      :label="player.rating"
                      :color="getRatingColor(player.rating ?? 1450)"
                      text-color="white"
                      size="xs"
                      dense
                      class="q-ml-xs"
                    />
                  </q-item-label>
                </q-item-section>
                <q-item-section side>
                  <div class="row items-center q-gutter-xs">
                    <q-btn
                      flat
                      round
                      color="negative"
                      icon="remove_circle"
                      size="sm"
                      @click="$emit('removePlayer', player)"
                      :disable="selectedPlayers.length <= 1"
                    >
                      <q-tooltip
                        anchor="top middle"
                        self="bottom middle"
                        :offset="[8, 8]"
                        >Remove</q-tooltip
                      >
                    </q-btn>
                    <q-btn
                      flat
                      round
                      color="accent"
                      icon="swap_horiz"
                      size="sm"
                      @click="$emit('replacePlayer', player)"
                      :disable="availableQueuePlayers.length === 0"
                    >
                      <q-tooltip
                        anchor="top middle"
                        self="bottom middle"
                        :offset="[8, 8]"
                        >Swap</q-tooltip
                      >
                    </q-btn>
                  </div>
                </q-item-section>
              </q-item>
            </q-list>
          </div>

          <!-- Add Players from Queue -->
          <div v-if="availableQueuePlayers.length > 0">
            <div class="text-subtitle2 q-mb-sm">
              Add Players from Queue
              <q-chip
                :label="`${availableQueuePlayers.length} available`"
                color="grey-5"
                text-color="white"
                size="sm"
                class="q-ml-sm"
              />
            </div>
            <q-list bordered separator>
              <q-item
                v-for="player in availableQueuePlayers"
                :key="player.username"
                clickable
                class="player-edit-item"
                @click="$emit('addPlayer', player)"
                :disable="selectedPlayers.length >= 4"
              >
                <q-item-section avatar>
                  <PlayerAvatar
                    :name="player.firstName"
                    :username="player.username"
                    :color="getRatingColor(player.rating)"
                    :user-id="player.userId"
                    :dupr-id="player.duprId"
                    :image-url="player.avatar"
                    size="md"
                  />
                </q-item-section>
                <q-item-section>
                  <q-item-label class="text-weight-medium">{{
                    player.firstName || player.username
                  }}</q-item-label>
                  <q-item-label
                    caption
                    class="text-grey-6"
                    v-if="player.username && player.firstName"
                  >
                    @{{ player.username }}
                  </q-item-label>
                  <q-item-label caption class="player-stats">
                    <span class="text-grey-7"
                      >G:{{ player.matchesPlayed }}</span
                    >
                    <span
                      class="q-ml-xs text-positive"
                      v-if="player.wins !== undefined"
                      >W:{{ player.wins || 0 }}</span
                    >
                    <span
                      class="q-ml-xs text-negative"
                      v-if="player.losses !== undefined"
                      >L:{{ player.losses || 0 }}</span
                    >
                    <q-chip
                      :label="player.rating"
                      :color="getRatingColor(player.rating ?? 1450)"
                      text-color="white"
                      size="xs"
                      dense
                      class="q-ml-xs"
                    />
                  </q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-btn
                    flat
                    round
                    color="accent"
                    icon="add_circle"
                    size="sm"
                    :disable="selectedPlayers.length >= 4"
                  >
                    <q-tooltip
                      anchor="top middle"
                      self="bottom middle"
                      :offset="[8, 8]"
                      >Add</q-tooltip
                    >
                  </q-btn>
                </q-item-section>
              </q-item>
            </q-list>
          </div>

          <!-- No Available Players Message -->
          <div v-else class="text-center text-grey-6 q-pa-md">
            <q-icon name="people_outline" size="48px" color="grey-4" />
            <p class="q-mt-sm">No players available in queue</p>
            <p class="text-caption">All players are already in matches</p>
          </div>
        </div>

        <!-- Step 2: Team Arrangement (for doubles) -->
        <div v-if="manualSelectionStep === 2 && currentMatchType === 'doubles'">
          <div class="text-h6 q-mb-sm">Step 2: Arrange Teams</div>

          <TeamArrangement
            v-model:team1="manualTeam1Model"
            v-model:team2="manualTeam2Model"
            :create-balanced-match="createBalancedMatch"
          />
        </div>
      </q-card-section>

      <!-- Footer Actions -->
      <q-separator />
      <q-card-actions align="right" class="q-pa-md">
        <!-- Step 1 Actions -->
        <template v-if="manualSelectionStep === 1">
          <!-- For doubles (4 players), show team arrangement button -->
          <q-btn
            v-if="selectedPlayers.length === 4"
            color="accent"
            label="Next: Arrange Teams"
            icon-right="arrow_forward"
            @click="$emit('proceedToTeamArrangement')"
          >
            <q-tooltip anchor="top middle" self="bottom middle" :offset="[8, 8]"
              >Next</q-tooltip
            >
          </q-btn>

          <!-- For singles and other matches, show save button -->
          <q-btn
            v-else
            color="accent"
            label="Save Changes"
            icon="save"
            @click="$emit('saveMatchEdit')"
            :disable="selectedPlayers.length < 2"
          >
            <q-tooltip
              anchor="top middle"
              self="bottom middle"
              :offset="[8, 8]"
              v-if="selectedPlayers.length < 2"
            >
              Need 2+ players
            </q-tooltip>
            <q-tooltip
              anchor="top middle"
              self="bottom middle"
              :offset="[8, 8]"
              v-else
              >Save</q-tooltip
            >
          </q-btn>
        </template>

        <!-- Step 2 Actions (Team Arrangement) -->
        <template v-else-if="manualSelectionStep === 2">
          <q-btn
            flat
            label="Back"
            icon="arrow_back"
            color="grey"
            @click="$emit('goBackToStep1')"
          />
          <q-btn
            flat
            label="Cancel"
            color="grey"
            @click="$emit('update:modelValue', false)"
          />
          <q-btn
            color="accent"
            label="Save Changes"
            icon="check"
            @click="$emit('saveMatchEdit')"
            :disable="selectedPlayers.length < 2 || selectedPlayers.length > 4"
          >
            <q-tooltip
              anchor="top middle"
              self="bottom middle"
              :offset="[8, 8]"
              v-if="selectedPlayers.length < 2"
            >
              Need 2+ players
            </q-tooltip>
            <q-tooltip
              anchor="top middle"
              self="bottom middle"
              :offset="[8, 8]"
              v-else-if="selectedPlayers.length > 4"
            >
              Max 4 players
            </q-tooltip>
            <q-tooltip
              anchor="top middle"
              self="bottom middle"
              :offset="[8, 8]"
              v-else
              >Save</q-tooltip
            >
          </q-btn>
        </template>
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useQuasar } from 'quasar';
import PlayerAvatar from '../PlayerAvatar.vue';
import DialogHeader from '../DialogHeader.vue';
import TeamArrangement from '../TeamArrangement.vue';
import { getRatingColor } from '../../utils/playerHelpers';
import type { Player } from '../../services/matchmaking';

defineOptions({ name: 'MatchEditDialog' });

const $q = useQuasar();

const props = defineProps<{
  modelValue: boolean;
  manualSelectionStep: 1 | 2;
  currentMatchType: 'singles' | 'doubles';
  selectedPlayers: Player[];
  availableQueuePlayers: Player[];
  manualTeam1: Player[];
  manualTeam2: Player[];
  createBalancedMatch: (players: Player[]) => Player[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'update:manualTeam1': [value: Player[]];
  'update:manualTeam2': [value: Player[]];
  removePlayer: [player: Player];
  replacePlayer: [player: Player];
  addPlayer: [player: Player];
  proceedToTeamArrangement: [];
  saveMatchEdit: [];
  goBackToStep1: [];
}>();

const manualTeam1Model = computed({
  get: () => props.manualTeam1,
  set: (val) => emit('update:manualTeam1', val),
});

const manualTeam2Model = computed({
  get: () => props.manualTeam2,
  set: (val) => emit('update:manualTeam2', val),
});
</script>
