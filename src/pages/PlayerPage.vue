<template>
  <q-page class="flex flex-center player-page">
    <q-card class="player-card shadow-4 q-pa-xl relative-position" bordered>
      <q-inner-loading :showing="loading">
        <q-spinner-gears size="50px" color="primary" />
      </q-inner-loading>

      <template v-if="!loading">
        <q-card-section class="text-center q-pb-md">
          <q-avatar size="100px" class="shadow-3 q-mb-md relative-position">
            <img v-if="avatarUrl" :src="avatarUrl" alt="Player Avatar" />
            <q-icon v-else name="person" size="60px" color="grey-5" />
            <q-badge
              v-if="currentUserId"
              floating
              color="primary"
              class="cursor-pointer"
              @click="triggerAvatarUpload"
            >
              <q-icon name="photo_camera" size="14px" />
            </q-badge>
            <input
              ref="avatarInput"
              type="file"
              accept="image/*"
              style="display: none"
              @change="onAvatarSelected"
            />
          </q-avatar>

          <div
            class="text-h4 text-weight-bolder text-primary brand-title q-mb-xs"
          >
            {{ firstName }} {{ lastName }}
          </div>

          <div class="text-subtitle1 text-grey-7 q-mb-md">
            {{ username }}
          </div>

          <q-chip
            class="rating-chip text-weight-bold"
            text-color="white"
            icon="star"
            size="lg"
          >
            Rating: {{ playerRating === 1500 ? 'NR' : playerRating }}
          </q-chip>
        </q-card-section>

        <q-card-section class="q-px-lg q-mt-md">
          <div
            class="text-subtitle1 text-weight-medium q-mb-sm text-center text-grey-8"
          >
            Join a Club
          </div>
          <div class="row q-col-gutter-sm items-center justify-center">
            <div class="col-8">
              <q-input
                filled
                v-model="clubId"
                label="Enter Club ID"
                dense
                color="primary"
                @keyup.enter="joinClub"
              />
            </div>
            <div class="col-4">
              <q-btn
                color="primary"
                label="Join"
                @click="joinClub"
                :disable="!clubId"
                class="full-width join-btn"
                dense
              />
            </div>
          </div>
        </q-card-section>

        <q-card-actions align="center" class="q-mt-lg q-gutter-sm">
          <q-btn
            outline
            color="primary"
            label="Change Password"
            icon="lock_reset"
            rounded
            class="edit-btn"
            @click="showChangePasswordDialog = true"
          />
          <q-btn
            unelevated
            color="negative"
            label="Logout"
            icon="logout"
            rounded
            @click="onLogout"
          />
        </q-card-actions>

        <!-- Change Password Dialog -->
        <q-dialog v-model="showChangePasswordDialog" persistent>
          <q-card style="min-width: 320px; max-width: 90vw">
            <q-card-section class="row items-center q-pb-none">
              <div class="text-h6">Change Password</div>
              <q-space />
              <q-btn icon="close" flat round dense v-close-popup />
            </q-card-section>

            <q-card-section class="q-pt-md">
              <q-input
                v-model="currentPassword"
                filled
                type="password"
                label="Current Password"
                dense
                class="q-mb-sm"
              />
              <q-input
                v-model="newPassword"
                filled
                type="password"
                label="New Password"
                dense
                class="q-mb-sm"
                :rules="[
                  (val) =>
                    (val && val.length >= 8) ||
                    'Password must be at least 8 characters',
                ]"
              />
              <q-input
                v-model="confirmNewPassword"
                filled
                type="password"
                label="Confirm New Password"
                dense
                :rules="[
                  (val) => val === newPassword || 'Passwords do not match',
                ]"
              />
            </q-card-section>

            <q-card-actions align="right">
              <q-btn flat label="Cancel" color="primary" v-close-popup />
              <q-btn
                flat
                label="Update"
                color="primary"
                :loading="changePasswordLoading"
                :disable="
                  !currentPassword ||
                  !newPassword ||
                  newPassword.length < 8 ||
                  newPassword !== confirmNewPassword
                "
                @click="changePassword"
              />
            </q-card-actions>
          </q-card>
        </q-dialog>
      </template>
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar, LocalStorage } from 'quasar';
import { likhaClient } from 'src/boot/likha';
import {
  readItems,
  updateItem,
  uploadFiles,
  updateUser,
  updateMe,
} from '@likha-erp/likha-sdk';
import { PlayerProfile } from 'src/services/playerProfile';

const router = useRouter();
const $q = useQuasar();

const firstName = computed(() => PlayerProfile.state.firstName);
const lastName = computed(() => PlayerProfile.state.lastName);
const playerRating = computed(() => PlayerProfile.state.rating);
const username = computed(() => PlayerProfile.state.username);
const currentUserId = computed(() => PlayerProfile.state.id);

const avatarUrl = computed(() => {
  const avatar = PlayerProfile.state.avatar;
  if (avatar) {
    return `https://dink-it.zyberlab.com/assets/${avatar}`;
  }
  return '';
});

const LAST_CLUB_KEY = 'lastClubId';
const clubId = ref((LocalStorage.getItem(LAST_CLUB_KEY) as string) || '');
const loading = computed(() => PlayerProfile.loading.value);
const avatarInput = ref<HTMLInputElement | null>(null);

const showChangePasswordDialog = ref(false);
const currentPassword = ref('');
const newPassword = ref('');
const confirmNewPassword = ref('');
const changePasswordLoading = ref(false);

const triggerAvatarUpload = () => {
  avatarInput.value?.click();
};

const onAvatarSelected = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !currentUserId.value) return;

  try {
    const formData = new FormData();
    formData.append('file', file);
    const uploadResult = await likhaClient.request(uploadFiles(formData));
    const uploaded = Array.isArray(uploadResult)
      ? uploadResult[0]
      : uploadResult;
    const avatarId = uploaded?.id;

    if (avatarId) {
      await likhaClient.request(
        updateUser(currentUserId.value, { avatar: avatarId }),
      );
      PlayerProfile.state.avatar = avatarId;
      PlayerProfile.saveState();
      $q.notify({ color: 'positive', message: 'Avatar updated!' });
    }
  } catch (err) {
    console.error('Avatar upload failed:', err);
    $q.notify({ color: 'negative', message: 'Failed to upload avatar' });
  } finally {
    input.value = '';
  }
};

const changePassword = async () => {
  if (!currentUserId.value || !newPassword.value) return;
  changePasswordLoading.value = true;
  try {
    // 1. Verify current password by attempting login
    await likhaClient.login({
      email: PlayerProfile.state.email,
      password: currentPassword.value,
    });

    // 2. Update to new password
    await likhaClient.request(updateMe({ password: newPassword.value }));

    $q.notify({ color: 'positive', message: 'Password updated successfully!' });
    showChangePasswordDialog.value = false;
    currentPassword.value = '';
    newPassword.value = '';
    confirmNewPassword.value = '';
  } catch (err) {
    const error = err as { errors?: { message?: string }[] };
    const msg = error?.errors?.[0]?.message?.toLowerCase() || '';
    if (
      msg.includes('credentials') ||
      msg.includes('password') ||
      msg.includes('invalid')
    ) {
      $q.notify({
        color: 'negative',
        message: 'Current password is incorrect',
      });
    } else {
      $q.notify({ color: 'negative', message: 'Failed to update password' });
    }
    console.error('Password change failed:', err);
  } finally {
    changePasswordLoading.value = false;
  }
};

const joinClub = async () => {
  if (!clubId.value) return;

  try {
    // Fetch club to check membership
    const clubs = await likhaClient.request(
      readItems('club', {
        filter: { clubId: { _eq: clubId.value } },
        fields: ['id', 'players.directus_users_id.id'],
      }),
    );

    if (!clubs || clubs.length === 0) {
      $q.notify({ color: 'negative', message: 'Club not found' });
      return;
    }

    const club = clubs[0] as unknown as {
      id: string;
      players?: Array<{ directus_users_id?: { id: string } }>;
    };

    const isMember = club.players?.some(
      (p) => p.directus_users_id?.id === currentUserId.value,
    );

    if (!isMember) {
      await likhaClient.request(
        updateItem('club', club.id, {
          players: { create: [{ directus_users_id: currentUserId.value }] },
        }),
      );
      $q.notify({ color: 'positive', message: 'Joined club successfully!' });
    }

    LocalStorage.set(LAST_CLUB_KEY, clubId.value);
    router.push(`/club/${clubId.value}`);
  } catch (err) {
    console.warn('Join club failed (offline?), using cached data:', err);

    // Offline fallback: proceed if cached matchmaking data exists
    const cached = LocalStorage.getItem('quasar_matchmaking_state') as Record<
      string,
      unknown
    > | null;
    if (cached && Object.keys(cached).length > 0) {
      LocalStorage.set(LAST_CLUB_KEY, clubId.value);
      $q.notify({
        color: 'warning',
        message: 'Offline — using cached club data',
      });
      router.push(`/club/${clubId.value}`);
    } else {
      $q.notify({ color: 'negative', message: 'Failed to join club' });
    }
  }
};

onMounted(async () => {
  // Load from cache instantly (for offline / fast startup)
  if (!PlayerProfile.hasCachedProfile()) {
    PlayerProfile.loading.value = true;
  }

  // Attempt server fetch; silently falls back to cache when offline
  const fetched = await PlayerProfile.fetchProfile();

  if (!fetched && !PlayerProfile.hasCachedProfile()) {
    $q.notify({
      color: 'negative',
      message: 'No cached profile available',
    });
  } else if (!fetched && PlayerProfile.error.value) {
    $q.notify({
      color: 'warning',
      message: PlayerProfile.error.value,
    });
  }
});

const onLogout = () => {
  $q.dialog({
    title: 'Logout',
    message: 'Are you sure you want to log out?',
    cancel: { label: 'Cancel', flat: true, color: 'primary' },
    ok: { label: 'Logout', unelevated: true, color: 'negative', rounded: true },
    persistent: true,
  }).onOk(async () => {
    try {
      await likhaClient.logout();
    } catch (error) {
      console.error('Logout API call error:', error);
    } finally {
      LocalStorage.remove('likha-data');
      PlayerProfile.clearProfile();
      $q.notify({
        color: 'info',
        message: 'Logged out successfully',
      });
      router.push('/login');
    }
  });
};
</script>

<style scoped>
.player-page {
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  min-height: 100vh;
}
.brand-title {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.player-card {
  width: 100%;
  max-width: 450px;
  border-radius: 16px;
  background-color: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow:
    0 10px 25px -5px rgba(0, 0, 0, 0.1),
    0 8px 10px -6px rgba(0, 0, 0, 0.05);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}
.player-card:hover {
  transform: translateY(-2px);
  box-shadow:
    0 20px 35px -5px rgba(0, 0, 0, 0.15),
    0 12px 15px -8px rgba(0, 0, 0, 0.08);
}
.rating-chip {
  background: linear-gradient(135deg, #764ba2 0%, #9f7aea 100%) !important;
}
.join-btn {
  background: linear-gradient(135deg, #667eea 0%, #5a67d8 100%) !important;
  color: white;
  font-weight: bold;
}
.edit-btn {
  color: #5a67d8 !important;
  border-color: #5a67d8 !important;
}
</style>
