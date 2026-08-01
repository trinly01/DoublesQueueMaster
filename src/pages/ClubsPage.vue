<template>
  <q-page class="clubs-page">
    <div class="container q-pa-md">
      <h1 class="page-title text-center q-mb-md">Clubs</h1>

      <q-btn-group spread class="full-width q-mb-md">
        <q-btn
          flat
          color="accent"
          :class="activeTab === 'mine' ? 'bg-accent text-white' : ''"
          icon="groups"
          label="My Clubs"
          dense
          size="sm"
          @click="activeTab = 'mine'"
        />
        <q-btn
          flat
          color="accent"
          :class="activeTab === 'browse' ? 'bg-accent text-white' : ''"
          icon="search"
          label="Browse Clubs"
          dense
          size="sm"
          @click="activeTab = 'browse'"
        />
      </q-btn-group>

      <q-tab-panels v-model="activeTab" animated>
        <!-- Browse Tab -->
        <q-tab-panel name="browse">
          <div class="search-bar q-mb-md">
            <q-input
              v-model="searchQuery"
              filled
              dense
              clearable
              clear-icon="close"
              debounce="300"
              label="Search by club name or ID"
              bg-color="white"
              @update:model-value="onSearch"
            >
              <template #prepend>
                <q-icon name="search" />
              </template>
            </q-input>
          </div>

          <div v-if="loading" class="flex flex-center q-py-xl">
            <q-spinner-gears size="60px" color="accent" />
          </div>

          <div
            v-else-if="searchQuery && searchResults.length === 0"
            class="q-py-xl"
          >
            <EmptyState
              icon="search_off"
              title="No clubs found"
              subtitle="Try a different name or club ID"
            />
          </div>

          <div v-else-if="searchResults.length > 0" class="row q-col-gutter-md">
            <div
              v-for="club in searchResults"
              :key="club.id"
              class="col-12 col-sm-6 col-md-4"
            >
              <q-card class="club-card" flat @click="openClub(club.clubId)">
                <q-card-section class="q-pa-md">
                  <div class="row items-center no-wrap">
                    <q-avatar
                      v-if="getLogoUrl(club)"
                      size="48px"
                      class="q-mr-md"
                    >
                      <img
                        :src="getLogoUrl(club)"
                        :alt="club.name || club.clubId"
                      />
                    </q-avatar>
                    <q-avatar
                      v-else
                      size="48px"
                      class="q-mr-md"
                      color="accent"
                      text-color="white"
                    >
                      <q-icon name="groups" size="28px" />
                    </q-avatar>
                    <div class="col">
                      <div class="text-subtitle1 text-weight-bold ellipsis">
                        {{ club.name || club.clubId }}
                      </div>
                      <div class="text-caption text-grey-6 ellipsis">
                        @{{ club.clubId }}
                      </div>
                    </div>
                  </div>
                </q-card-section>

                <q-card-actions class="q-px-md q-pb-md q-pt-none">
                  <q-chip
                    icon="people"
                    color="grey-3"
                    text-color="grey-9"
                    dense
                    size="sm"
                  >
                    {{ getMemberCount(club) }}
                  </q-chip>
                  <q-space />
                  <q-btn
                    v-if="!isMemberOf(club)"
                    label="Join"
                    color="accent"
                    rounded
                    unelevated
                    size="sm"
                    :loading="joiningClubId === club.clubId"
                    @click.stop="handleJoinClub(club)"
                  />
                  <q-btn
                    v-else
                    label="Open"
                    color="primary"
                    rounded
                    outline
                    size="sm"
                    @click.stop="openClub(club.clubId)"
                  />
                </q-card-actions>
              </q-card>
            </div>
          </div>

          <div v-else class="q-py-xl text-center">
            <EmptyState
              icon="search"
              title="Search for a club"
              subtitle="Type a club name or ID to find clubs to join"
            />
          </div>

          <div class="text-center q-mt-lg">
            <q-btn
              flat
              color="accent"
              icon="add_circle"
              label="Create New Club"
              @click="showCreateClubDialog = true"
            />
          </div>
        </q-tab-panel>

        <!-- My Clubs Tab -->
        <q-tab-panel name="mine">
          <div v-if="myClubsLoading" class="flex flex-center q-py-xl">
            <q-spinner-gears size="60px" color="accent" />
          </div>

          <div v-else-if="myClubs.length === 0" class="q-py-xl">
            <EmptyState
              icon="groups"
              title="You haven't joined any clubs yet"
              subtitle="Browse clubs to find one to join"
            />
          </div>

          <div v-else class="row q-col-gutter-md">
            <div
              v-for="club in myClubs"
              :key="club.id"
              class="col-12 col-sm-6 col-md-4"
            >
              <q-card class="club-card" flat @click="openClub(club.clubId)">
                <q-card-section class="q-pa-md">
                  <div class="row items-center no-wrap">
                    <q-avatar
                      v-if="getLogoUrl(club)"
                      size="48px"
                      class="q-mr-md"
                    >
                      <img
                        :src="getLogoUrl(club)"
                        :alt="club.name || club.clubId"
                      />
                    </q-avatar>
                    <q-avatar
                      v-else
                      size="48px"
                      class="q-mr-md"
                      color="accent"
                      text-color="white"
                    >
                      <q-icon name="groups" size="28px" />
                    </q-avatar>
                    <div class="col">
                      <div class="text-subtitle1 text-weight-bold ellipsis">
                        {{ club.name || club.clubId }}
                      </div>
                      <div class="text-caption text-grey-6 ellipsis">
                        @{{ club.clubId }}
                      </div>
                    </div>
                  </div>
                </q-card-section>

                <q-card-actions class="q-px-md q-pb-md q-pt-none">
                  <q-chip
                    icon="people"
                    color="grey-3"
                    text-color="grey-9"
                    dense
                    size="sm"
                  >
                    {{ getMemberCount(club) }}
                  </q-chip>
                  <q-space />
                  <q-btn
                    label="Leave"
                    color="grey-6"
                    rounded
                    outline
                    size="sm"
                    :loading="leavingClubId === club.id"
                    @click.stop="confirmLeaveClub(club)"
                  />
                  <q-btn
                    label="Open"
                    color="primary"
                    rounded
                    outline
                    size="sm"
                    @click.stop="openClub(club.clubId)"
                  />
                </q-card-actions>
              </q-card>
            </div>
          </div>
        </q-tab-panel>
      </q-tab-panels>
    </div>

    <!-- Create Club Dialog -->
    <q-dialog
      v-model="showCreateClubDialog"
      :maximized="$q.screen.lt.md"
      persistent
    >
      <q-card style="min-width: 320px; max-width: 90vw">
        <DialogHeader title="Create Club" icon="add_circle" />
        <q-card-section class="q-pt-md">
          <q-input
            v-model="newClubId"
            filled
            label="Club ID"
            dense
            class="q-mb-sm"
            :rules="[
              (val) => !!val?.trim() || 'Club ID is required',
              (val) =>
                /^[a-z0-9._-]+$/.test(val?.trim() || '') ||
                'Only lowercase letters, numbers, periods, hyphens, and underscores',
            ]"
            hint="e.g. san-fabian-dinkers"
            @blur="
              newClubId = newClubId
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9._-]/g, '')
            "
          />
          <q-input
            v-model="newClubName"
            filled
            label="Club Name"
            dense
            :rules="[(val) => !!val?.trim() || 'Club name is required']"
          />
          <q-input
            v-model="newReferralCode"
            filled
            label="Referral Code (optional)"
            dense
            class="q-mt-sm"
          />
        </q-card-section>
        <q-separator />
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey" v-close-popup />
          <q-btn
            flat
            label="Request"
            color="primary"
            :loading="createClubLoading"
            :disable="!newClubId?.trim() || !newClubName?.trim()"
            @click="createClub"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Leave Club Confirmation Dialog -->
    <q-dialog v-model="showLeaveConfirmDialog" persistent>
      <q-card style="min-width: 320px; max-width: 90vw">
        <q-card-section class="row items-center q-pb-none">
          <q-icon name="warning" color="negative" size="24px" class="q-mr-sm" />
          <div class="text-h6">Leave Club?</div>
        </q-card-section>
        <q-card-section>
          <p class="text-body2 text-grey-8">
            Are you sure you want to leave
            <strong>{{
              leaveClubTarget?.name || leaveClubTarget?.clubId
            }}</strong
            >? You'll need to rejoin to participate in this club again.
          </p>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey" v-close-popup />
          <q-btn
            flat
            label="Leave"
            color="negative"
            :loading="leavingClubId === leaveClubTarget?.id"
            @click="handleLeaveClub"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-page-sticky position="bottom-left" :offset="[18, 18]">
      <q-btn
        round
        icon="person"
        color="accent"
        @click="router.push('/profile')"
      >
        <q-tooltip anchor="top middle" self="bottom middle" :offset="[8, 8]"
          >Profile</q-tooltip
        >
      </q-btn>
    </q-page-sticky>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { readItems, createItem, updateItem } from '@likha-erp/likha-sdk';
import { likhaClient, LIKHA_URL } from 'src/services/likhaClient';
import { joinClub } from 'src/services/clubMembership';
import { PlayerProfile } from 'src/services/playerProfile';
import { useNotify } from 'src/composables/useNotify';
import { useAuth } from 'src/composables/useAuth';
import { useQuasar, LocalStorage } from 'quasar';
import EmptyState from 'src/components/EmptyState.vue';
import DialogHeader from 'src/components/DialogHeader.vue';

defineOptions({ name: 'ClubsPage' });

const $q = useQuasar();
const router = useRouter();
const { notify } = useNotify();
const { handleAuthError } = useAuth();

interface Club {
  id: string;
  clubId: string;
  name?: string;
  logo?: string;
  players?: Array<{ id?: string; directus_users_id?: { id: string } }>;
}

const activeTab = ref<'browse' | 'mine'>('mine');
const searchQuery = ref('');
const searchResults = ref<Club[]>([]);
const loading = ref(false);
const myClubs = ref<Club[]>([]);
const myClubsLoading = ref(false);
const joiningClubId = ref<string | null>(null);
const leavingClubId = ref<string | null>(null);
const leaveClubTarget = ref<Club | null>(null);
const showLeaveConfirmDialog = ref(false);

const showCreateClubDialog = ref(false);
const newClubId = ref('');
const newClubName = ref('');
const newReferralCode = ref('');
const createClubLoading = ref(false);

const currentUserId = PlayerProfile.state.id || '';

const getMemberCount = (club: Club) => club.players?.length || 0;

const getLogoUrl = (club: Club) => {
  if (!club.logo) return '';
  if (club.logo.startsWith('http://') || club.logo.startsWith('https://')) {
    return club.logo;
  }
  return `${LIKHA_URL}/assets/${club.logo}`;
};

const isMemberOf = (club: Club) => {
  if (!currentUserId) return false;
  return club.players?.some((p) => p.directus_users_id?.id === currentUserId);
};

const onSearch = async (val: string | number | null) => {
  const query = val ? String(val) : '';
  if (!query || query.length < 2) {
    searchResults.value = [];
    return;
  }
  loading.value = true;
  try {
    const clubs = await likhaClient.request(
      readItems('club', {
        filter: {
          _or: [
            { clubId: { _icontains: query } },
            { name: { _icontains: query } },
          ],
        },
        fields: [
          'id',
          'clubId',
          'name',
          'logo',
          'players.id',
          'players.directus_users_id.id',
        ],
        limit: 20,
      }),
    );
    searchResults.value = (clubs || []) as unknown as Club[];
  } catch (err) {
    console.error('Club search failed:', err);
    searchResults.value = [];
  } finally {
    loading.value = false;
  }
};

const loadMyClubs = async () => {
  if (!currentUserId) return;
  myClubsLoading.value = true;
  try {
    const clubs = await likhaClient.request(
      readItems('club', {
        filter: {
          players: {
            directus_users_id: {
              id: { _eq: currentUserId },
            },
          },
        },
        fields: [
          'id',
          'clubId',
          'name',
          'logo',
          'players.id',
          'players.directus_users_id.id',
        ],
      }),
    );
    const clubsData = (clubs || []) as unknown as Club[];
    myClubs.value = clubsData;
    if (myClubs.value.length === 0) {
      activeTab.value = 'browse';
    } else {
      // Sort by most recent match of the logged-in user
      try {
        const matches = await likhaClient.request(
          readItems('completed_match', {
            filter: {
              players: { directus_users_id: { _eq: currentUserId } },
            },
            fields: ['club', 'completed_at'],
            sort: ['-completed_at'],
            limit: 250,
          }),
        );
        const matchList = (matches || []) as unknown as {
          club: string;
          completed_at: string;
        }[];
        const recencyMap = new Map<string, number>();
        for (const m of matchList) {
          const clubId =
            typeof m.club === 'string'
              ? m.club
              : (m.club as { id?: string })?.id;
          if (clubId && !recencyMap.has(clubId)) {
            recencyMap.set(clubId, new Date(m.completed_at).getTime());
          }
        }
        myClubs.value.sort((a, b) => {
          const aTime = recencyMap.get(a.id) ?? 0;
          const bTime = recencyMap.get(b.id) ?? 0;
          return bTime - aTime;
        });
      } catch (err) {
        console.warn('Failed to load match recency for sorting:', err);
      }
    }
  } catch (err) {
    console.error('Failed to load my clubs:', err);
    myClubs.value = [];
  } finally {
    myClubsLoading.value = false;
  }
};

const handleJoinClub = async (club: Club) => {
  if (!currentUserId) return;
  joiningClubId.value = club.clubId;
  try {
    const result = await joinClub(club.clubId, currentUserId);
    if (result.success) {
      if (!result.alreadyMember) {
        notify({
          color: 'positive',
          textColor: 'white',
          icon: 'check_circle',
          message: `Joined ${club.name || club.clubId}!`,
        });
      }
      LocalStorage.set('lastClubId', club.clubId);
      router.push(`/club/${club.clubId}`);
    } else {
      notify({ color: 'negative', message: result.error });
    }
  } catch (err) {
    if (await handleAuthError(err, router)) return;
    console.error('Join club failed:', err);
    notify({ color: 'negative', message: 'Failed to join club' });
  } finally {
    joiningClubId.value = null;
  }
};

const openClub = (clubId: string) => {
  LocalStorage.set('lastClubId', clubId);
  router.push(`/club/${clubId}`);
};

const confirmLeaveClub = (club: Club) => {
  leaveClubTarget.value = club;
  showLeaveConfirmDialog.value = true;
};

const handleLeaveClub = async () => {
  const club = leaveClubTarget.value;
  if (!club || !currentUserId) return;
  leavingClubId.value = club.id;
  try {
    const playerEntry = club.players?.find(
      (p) => p.directus_users_id?.id === currentUserId,
    );
    if (!playerEntry?.id) {
      notify({ color: 'negative', message: 'Could not find your membership' });
      return;
    }
    await likhaClient.request(
      updateItem('club', club.id, {
        players: { delete: [playerEntry.id] },
      }),
    );
    myClubs.value = myClubs.value.filter((c) => c.id !== club.id);
    showLeaveConfirmDialog.value = false;
    leaveClubTarget.value = null;
    notify({
      color: 'positive',
      textColor: 'white',
      icon: 'check_circle',
      message: `Left ${club.name || club.clubId}`,
    });
  } catch (err) {
    if (await handleAuthError(err, router)) return;
    console.error('Leave club failed:', err);
    notify({ color: 'negative', message: 'Failed to leave club' });
  } finally {
    leavingClubId.value = null;
  }
};

const createClub = async () => {
  if (!newClubId.value.trim() || !newClubName.value.trim() || !currentUserId)
    return;
  createClubLoading.value = true;
  try {
    const payload: Record<string, unknown> = {
      clubId: newClubId.value.trim(),
      name: newClubName.value.trim(),
      admins: { create: [{ directus_users_id: currentUserId }] },
      players: { create: [{ directus_users_id: currentUserId }] },
    };
    const referral = newReferralCode.value.replace(/\s/g, '');
    if (referral) payload.referral_code = referral;
    await likhaClient.request(createItem('club', payload));

    const createdId = newClubId.value;
    showCreateClubDialog.value = false;
    newClubId.value = '';
    newClubName.value = '';
    newReferralCode.value = '';

    notify({
      color: 'positive',
      textColor: 'white',
      icon: 'check_circle',
      message: 'Club created successfully!',
    });
    router.push(`/club/${createdId}`);
  } catch (err) {
    console.error('Create club failed:', err);
    const error = err as { errors?: { message?: string }[] };
    const msg = error?.errors?.[0]?.message || 'Failed to create club';
    notify({ color: 'negative', message: msg });
  } finally {
    createClubLoading.value = false;
  }
};

onMounted(() => {
  loadMyClubs();
});
</script>

<style lang="scss" scoped>
.clubs-page {
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  min-height: 100vh;
  padding-bottom: 2rem;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1rem;
}

.page-title {
  font-size: 1.75rem;
  font-weight: 800;
  color: #2d2d3a;
  margin: 0;
}

.search-bar {
  max-width: 600px;
  margin: 0 auto;
}

.club-card {
  border-radius: 16px;
  background: linear-gradient(
    135deg,
    rgba(118, 75, 162, 0.03) 0%,
    rgba(102, 126, 234, 0.03) 100%
  );
  overflow: hidden;
  cursor: pointer;
  border: 1px solid rgba(118, 75, 162, 0.12);
  box-shadow:
    0 10px 20px -8px rgba(0, 0, 0, 0.08),
    0 4px 6px -4px rgba(0, 0, 0, 0.04);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;

  &:hover {
    transform: translateY(-4px);
    box-shadow:
      0 20px 25px -5px rgba(118, 75, 162, 0.15),
      0 10px 10px -5px rgba(0, 0, 0, 0.04);
  }
}
</style>
