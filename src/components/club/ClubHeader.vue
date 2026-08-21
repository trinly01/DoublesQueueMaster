<template>
  <div class="header-section">
    <div class="container">
      <div class="row items-center justify-between">
        <div class="col">
          <div class="row items-center q-mb-none">
            <q-avatar
              v-if="clubLogoUrl"
              size="40px"
              class="q-mr-xs"
              style="top: 8px"
            >
              <img :src="clubLogoUrl" :alt="clubName" />
            </q-avatar>
            <q-avatar v-else size="40px" class="q-mr-xs" style="top: 8px">
              <img :src="logoUrl" alt="DinkMatch" />
            </q-avatar>
            <div class="col">
              <h1
                :class="$q.screen.lt.md ? 'text-h6' : 'text-h5'"
                class="text-weight-bold text-white q-ma-none ellipsis"
                style="line-height: 1.3"
              >
                {{ clubName }}
              </h1>
              <span
                class="text-caption text-weight-medium text-grey-1"
                style="
                  line-height: 1;
                  display: block;
                  padding-top: 2px;
                  padding-left: 4px;
                "
              >
                DinkMatch.club
              </span>
            </div>
          </div>
          <p
            class="text-caption q-ma-none"
            :style="{
              fontSize: $q.screen.lt.md ? '10px' : '12px',
              color: 'rgba(255, 255, 255, 0.6)',
              paddingLeft: '40px',
            }"
          >
            Smart queue matchmaking
          </p>
        </div>
        <div class="col-auto">
          <div class="row items-center q-gutter-xs">
            <q-icon
              v-if="userRole === 'admin'"
              name="shield"
              color="amber-4"
              size="20px"
            >
              <q-tooltip
                anchor="center right"
                self="center left"
                :offset="[4, 0]"
                >Admin</q-tooltip
              >
            </q-icon>
            <q-icon
              v-else-if="userRole === 'moderator'"
              name="shield"
              color="green-4"
              size="20px"
            >
              <q-tooltip
                anchor="center right"
                self="center left"
                :offset="[4, 0]"
                >Moderator</q-tooltip
              >
            </q-icon>
            <q-fab
              color="white"
              text-color="white"
              icon="menu"
              direction="down"
              flat
              padding="sm"
            >
              <q-fab-action
                color="white"
                text-color="primary"
                icon="emoji_events"
                @click="$emit('show-leaderboard')"
              >
                <q-tooltip
                  anchor="center left"
                  self="center right"
                  :offset="[8, 0]"
                  >Leaderboard</q-tooltip
                >
              </q-fab-action>
              <q-fab-action
                color="white"
                text-color="primary"
                icon="share"
                @click="$emit('copy-link')"
              >
                <q-tooltip
                  anchor="center left"
                  self="center right"
                  :offset="[8, 0]"
                  >Share</q-tooltip
                >
              </q-fab-action>
              <q-fab-action
                v-if="canManageSession"
                :color="ttsEnabled ? 'white' : 'amber-4'"
                :text-color="ttsEnabled ? 'primary' : 'white'"
                :icon="ttsEnabled ? 'volume_up' : 'volume_off'"
                :class="{ 'speaking-pulse': isSpeaking }"
                @click="$emit('toggle-tts')"
              >
                <q-tooltip
                  anchor="center left"
                  self="center right"
                  :offset="[8, 0]"
                  >{{ ttsEnabled ? 'Mute' : 'Unmute' }}</q-tooltip
                >
              </q-fab-action>
              <q-fab-action
                v-if="isCurrentUserAdmin"
                color="white"
                text-color="primary"
                icon="settings"
                @click="$emit('show-settings')"
              >
                <q-badge
                  v-if="unreadClubFeedbackCount > 0"
                  color="negative"
                  floating
                  rounded
                  style="top: -4px; right: -4px"
                >
                  {{
                    unreadClubFeedbackCount > 99
                      ? '99+'
                      : unreadClubFeedbackCount
                  }}
                </q-badge>
                <q-tooltip
                  anchor="center left"
                  self="center right"
                  :offset="[8, 0]"
                  >Settings</q-tooltip
                >
              </q-fab-action>
            </q-fab>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useQuasar } from 'quasar';
import logoUrl from 'src/assets/queue master logo.png';

defineOptions({ name: 'ClubHeader' });

const $q = useQuasar();

defineProps<{
  clubName: string;
  clubLogoUrl?: string | null;
  isCurrentUserAdmin: boolean;
  canManageSession: boolean;
  userRole: 'admin' | 'moderator' | null;
  ttsEnabled: boolean;
  isSpeaking: boolean;
  unreadClubFeedbackCount: number;
}>();

defineEmits<{
  'show-leaderboard': [];
  'show-settings': [];
  'copy-link': [];
  'toggle-tts': [];
}>();
</script>
