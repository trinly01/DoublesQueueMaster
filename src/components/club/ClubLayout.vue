<template>
  <div class="container q-pa-md">
    <q-banner
      v-if="!isOnline"
      :class="
        $q.dark.isActive ? 'bg-grey-8 text-white' : 'bg-grey-2 text-grey-9'
      "
      class="q-mb-sm rounded-borders"
    >
      <template v-slot:avatar>
        <q-icon name="signal_wifi_off" color="primary" />
      </template>
      You have lost connection to the internet. This app is offline. Any changes
      made will be saved locally and synced automatically when you reconnect.
    </q-banner>

    <q-banner
      v-if="clubLoadingState === 'error'"
      class="bg-red-1 text-red-9 q-mb-sm rounded-borders"
      inline-actions
    >
      <template v-slot:avatar>
        <q-icon name="error_outline" color="red" />
      </template>
      {{ clubErrorMessage }}
      <template v-slot:action>
        <q-btn
          flat
          color="red"
          label="Dismiss"
          @click="$emit('dismiss-error')"
        />
      </template>
    </q-banner>

    <q-banner
      v-if="
        clubLoadingState === 'loaded' && !isCurrentUserMember && !isOpenPlay
      "
      :class="
        $q.dark.isActive ? 'bg-blue-8 text-white' : 'bg-blue-1 text-blue-9'
      "
      class="q-mb-sm rounded-borders"
      inline-actions
    >
      <template v-slot:avatar>
        <q-icon name="groups" color="blue" />
      </template>
      You are not a member of this club yet.
      <template v-slot:action>
        <q-btn
          flat
          color="blue"
          label="Join Club"
          @click="$emit('join-club')"
        />
      </template>
    </q-banner>

    <!-- Desktop/Large Tablet Layout: 3 Columns -->
    <div class="row q-col-gutter-lg gt-sm">
      <!-- Left Column: Players List -->
      <div class="col-12 col-md-4">
        <slot name="players-desktop" />
      </div>

      <!-- Center Column: Queue -->
      <div class="col-12 col-md-4">
        <slot name="queue-desktop" />
      </div>

      <!-- Right Column: Matches -->
      <div class="col-12 col-md-4">
        <slot name="matches-desktop" />
      </div>
    </div>

    <!-- Mobile Layout: qTabs -->
    <div class="lt-md">
      <q-tabs
        :model-value="modelValue"
        @update:model-value="$emit('update:modelValue', String($event))"
        class="text-grey-7"
        active-color="primary"
        indicator-color="primary"
        align="justify"
        narrow-indicator
        scrollable="false"
      >
        <q-tab
          name="players"
          icon="people"
          :label="`Players (${playersCount})`"
          :class="{ shake: tabShakeStates.players }"
        />
        <q-tab
          name="queue"
          icon="queue"
          :label="`Queue (${queueCount})`"
          :class="{ shake: tabShakeStates.queue }"
        />
        <q-tab
          name="matches"
          icon="sports_tennis"
          :label="`Matches (${matchesCount})`"
          :class="{ shake: tabShakeStates.matches }"
        />
      </q-tabs>

      <q-separator />

      <q-tab-panels
        :model-value="modelValue"
        @update:model-value="$emit('update:modelValue', String($event))"
        animated
      >
        <!-- Players Tab -->
        <q-tab-panel name="players">
          <slot name="players-mobile" />
        </q-tab-panel>

        <!-- Queue Tab -->
        <q-tab-panel name="queue">
          <slot name="queue-mobile" />
        </q-tab-panel>

        <!-- Matches Tab -->
        <q-tab-panel name="matches">
          <slot name="matches-mobile" />
        </q-tab-panel>
      </q-tab-panels>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useQuasar } from 'quasar';

defineOptions({ name: 'ClubLayout' });

const $q = useQuasar();

defineProps<{
  modelValue: string;
  playersCount: number;
  queueCount: number;
  matchesCount: number;
  tabShakeStates: { players: boolean; queue: boolean; matches: boolean };
  isOnline: boolean;
  clubLoadingState: string;
  clubErrorMessage: string;
  isCurrentUserMember: boolean;
  isOpenPlay: boolean;
}>();

defineEmits<{
  'update:modelValue': [value: string];
  'dismiss-error': [];
  'join-club': [];
}>();
</script>
