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
            <q-btn
              flat
              round
              color="white"
              icon="share"
              padding="sm"
              @click="$emit('show-qr')"
            >
              <q-tooltip
                anchor="center left"
                self="center right"
                :offset="[8, 0]"
                >Share Club</q-tooltip
              >
            </q-btn>
            <div style="position: relative">
              <q-fab
                v-model="fabOpen"
                class="fab-transparent"
                color="transparent"
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
              <transition name="shield-fade">
                <div
                  v-if="
                    (userRole === 'admin' || userRole === 'moderator') &&
                    !fabOpen
                  "
                  style="position: absolute; top: -2px; right: -2px; z-index: 1"
                >
                  <q-icon
                    name="shield"
                    size="16px"
                    :color="userRole === 'admin' ? 'amber-4' : 'green-4'"
                  >
                    <q-tooltip
                      anchor="center left"
                      self="center right"
                      :offset="[8, 0]"
                      >{{
                        userRole === 'admin' ? 'Admin' : 'Moderator'
                      }}</q-tooltip
                    >
                  </q-icon>
                </div>
              </transition>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import { useQuasar } from 'quasar';
import logoUrl from 'src/assets/queue master logo.png';

defineOptions({ name: 'ClubHeader' });

const $q = useQuasar();
const fabOpen = ref(false);

// Close FAB when clicking outside of it.
let fabEl: HTMLElement | null = null;

const handleOutsideClick = (e: MouseEvent) => {
  if (fabEl && !fabEl.contains(e.target as Node)) {
    fabOpen.value = false;
  }
};

watch(fabOpen, (open) => {
  if (open) {
    // Defer to next tick so the click that opened the FAB doesn't close it.
    setTimeout(() => {
      fabEl = document.querySelector('.fab-transparent');
      document.addEventListener('click', handleOutsideClick);
    }, 0);
  } else {
    document.removeEventListener('click', handleOutsideClick);
  }
});

onUnmounted(() => {
  document.removeEventListener('click', handleOutsideClick);
});

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
  'show-qr': [];
  'toggle-tts': [];
}>();
</script>

<style scoped>
.shield-fade-enter-active,
.shield-fade-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.shield-fade-enter-from,
.shield-fade-leave-to {
  opacity: 0;
  transform: scale(0.5);
}

/* FAB with always-visible translucent white background */
.fab-transparent :deep(.q-btn) {
  background: rgba(255, 255, 255, 0.15);
}
.fab-transparent :deep(.q-btn:hover) {
  background: rgba(255, 255, 255, 0.25);
}
</style>
