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
      <DialogHeader title="Replace Player" icon="swap_horiz" />

      <!-- Content -->
      <q-card-section class="q-pa-md" style="flex: 1; overflow-y: auto">
        <div class="text-subtitle2 q-mb-sm">
          Choose a player to replace
          <strong>{{
            playerToReplaceInEdit?.firstName ||
            playerToReplaceInEdit?.username
          }}</strong>
          with:
        </div>

        <q-list bordered separator>
          <q-item
            v-for="player in availableQueuePlayers"
            :key="player.username"
            clickable
            class="player-edit-item"
            @click="$emit('select', player)"
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
              <q-btn flat round color="accent" icon="swap_horiz" size="sm">
                <q-tooltip
                  anchor="top middle"
                  self="bottom middle"
                  :offset="[8, 8]"
                  >Swap</q-tooltip
                >
              </q-btn>
            </q-item-section>
          </q-item>
        </q-list>
      </q-card-section>

      <!-- Footer Actions -->
      <q-separator />
      <q-card-actions align="right" class="q-pa-md">
        <q-btn
          flat
          label="Cancel"
          color="grey"
          @click="$emit('update:modelValue', false)"
        >
          <q-tooltip
            anchor="top middle"
            self="bottom middle"
            :offset="[8, 8]"
            >Cancel</q-tooltip
          >
        </q-btn>
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { useQuasar } from 'quasar';
import DialogHeader from '../DialogHeader.vue';
import PlayerAvatar from '../PlayerAvatar.vue';
import { getRatingColor } from '../../utils/playerHelpers';
import type { Player } from '../../services/matchmaking';

defineOptions({ name: 'ReplacePlayerDialog' });

const $q = useQuasar();

defineProps<{
  modelValue: boolean;
  playerToReplaceInEdit: Player | null;
  availableQueuePlayers: Player[];
}>();

defineEmits<{
  'update:modelValue': [value: boolean];
  select: [player: Player];
}>();
</script>
