<template>
  <q-page class="flex flex-center player-page">
    <q-card class="player-card shadow-4 q-pa-xl relative-position" bordered>
      <q-inner-loading :showing="loading">
        <q-spinner-gears size="50px" color="primary" />
      </q-inner-loading>

      <template v-if="!loading">
        <q-card-section class="text-center q-pb-md">
          <q-avatar size="100px" class="shadow-3 q-mb-md">
            <img
              src="https://cdn.quasar.dev/img/avatar.png"
              alt="Player Avatar"
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

        <q-card-actions align="center" class="q-mt-lg">
          <!-- <q-btn outline color="primary" label="Edit Profile" icon="edit" rounded class="edit-btn" /> -->
          <q-btn
            unelevated
            color="negative"
            label="Logout"
            icon="logout"
            rounded
            @click="onLogout"
          />
        </q-card-actions>
      </template>
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar, LocalStorage } from 'quasar';
import { likhaClient } from 'src/boot/likha';
import { readMe, readItems, updateItem } from '@likha-erp/likha-sdk';

const router = useRouter();
const $q = useQuasar();

const firstName = ref('');
const lastName = ref('');
const email = ref('');
const playerRating = ref(1500);
const username = ref('');
const currentUserId = ref('');

const LAST_CLUB_KEY = 'lastClubId';
const clubId = ref((LocalStorage.getItem(LAST_CLUB_KEY) as string) || '');
const loading = ref(true);

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
    console.error('Failed to join club:', err);
    $q.notify({ color: 'negative', message: 'Failed to join club' });
  }
};

onMounted(async () => {
  try {
    const user = await likhaClient.request(readMe());
    if (user) {
      firstName.value = user.first_name || '';
      lastName.value = user.last_name || '';
      email.value = user.email || '';
      username.value = user.username || '';

      currentUserId.value =
        ((user as Record<string, unknown>).id as string) || '';

      // If there is a custom rating field or property returned from user
      const userObj = user as Record<string, unknown>;
      if (typeof userObj.rating === 'number') {
        playerRating.value = userObj.rating;
      } else if (
        typeof userObj.rating === 'string' &&
        !isNaN(Number(userObj.rating))
      ) {
        playerRating.value = Number(userObj.rating);
      }
    }
  } catch (error) {
    console.error('Failed to fetch player profile:', error);
    $q.notify({
      color: 'negative',
      message: 'Failed to fetch player profile',
    });
  } finally {
    loading.value = false;
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
