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
      <DialogHeader title="Add New Player" icon="person_add" />

      <!-- Content -->
      <q-card-section class="q-pa-md" style="flex: 1; overflow-y: auto">
        <!-- Mode Toggle -->
        <div class="q-pb-md">
          <q-btn-group spread class="full-width">
            <q-btn
              flat
              color="accent"
              :class="addPlayerMode === 'single' ? 'bg-accent text-white' : ''"
              icon="person"
              label="Single Player"
              dense
              size="sm"
              @click="addPlayerMode = 'single'"
            />
            <q-btn
              flat
              color="accent"
              :class="addPlayerMode === 'bulk' ? 'bg-accent text-white' : ''"
              icon="group_add"
              label="Bulk Import"
              dense
              size="sm"
              @click="addPlayerMode = 'bulk'"
            />
            <q-btn
              v-if="isCurrentUserAdmin && clubMembers.length > 0"
              flat
              color="accent"
              :class="addPlayerMode === 'club' ? 'bg-accent text-white' : ''"
              icon="groups"
              label="Club Members"
              dense
              size="sm"
              @click="addPlayerMode = 'club'"
            />
            <q-btn
              v-if="isCurrentUserAdmin"
              flat
              color="accent"
              :class="addPlayerMode === 'qr' ? 'bg-accent text-white' : ''"
              icon="qr_code_scanner"
              label="Scan QR"
              dense
              size="sm"
              @click="addPlayerMode = 'qr'"
            />
          </q-btn-group>
        </div>

        <!-- Single Player Mode -->
        <div v-if="addPlayerMode === 'single'" class="q-gutter-y-md">
          <q-input
            v-model="newPlayerName"
            label="Player Name"
            type="text"
            @keyup.enter="addNewPlayer"
            :rules="[(val) => !!val?.trim() || 'Player name is required']"
            :error="isNewPlayerNameTaken"
            error-message="Player already exists"
            outlined
            dense
            autofocus
          >
            <template v-slot:prepend>
              <q-icon name="person" />
            </template>
          </q-input>

          <q-input
            v-model="newPlayerDuprId"
            label="DUPR ID (optional)"
            type="text"
            outlined
            dense
          >
            <template v-slot:prepend>
              <q-icon name="badge" />
            </template>
          </q-input>

          <q-select
            v-model="newPlayerLevel"
            :options="levelOptions"
            label="Player Level"
            :rules="[(val) => val !== null || 'Player level is required']"
            outlined
            dense
            emit-value
            map-options
          >
            <template v-slot:prepend>
              <q-icon name="star" />
            </template>
            <template v-slot:option="scope">
              <q-item v-bind="scope.itemProps">
                <q-item-section avatar>
                  <q-icon
                    :name="getLevelIcon(scope.opt.value)"
                    :color="getLevelColor(scope.opt.value)"
                  />
                </q-item-section>
                <q-item-section>
                  <q-item-label>{{ scope.opt.label }}</q-item-label>
                  <q-item-label caption>{{
                    scope.opt.description
                  }}</q-item-label>
                </q-item-section>
              </q-item>
            </template>
          </q-select>
        </div>

        <!-- Bulk Import Mode -->
        <div v-else-if="addPlayerMode === 'bulk'" class="q-gutter-y-md">
          <!-- Text Input -->
          <div>
            <q-input
              v-model="bulkPlayerText"
              label="Player Names (one per line, or separated by commas/semicolons)"
              type="textarea"
              outlined
              rows="6"
              @update:model-value="parseBulkPlayers"
              placeholder="Enter player names separated by newlines, commas, or semicolons&#10;&#10;Example:&#10;John Smith&#10;Jane Doe&#10;Bob Wilson&#10;&#10;Or: John Smith, Jane Doe, Bob Wilson"
            >
              <template v-slot:prepend>
                <q-icon name="group_add" />
              </template>
            </q-input>
          </div>

          <!-- Default Level Selection -->
          <div v-if="bulkPlayers.length > 0">
            <q-select
              v-model="bulkDefaultLevel"
              :options="levelOptions"
              label="Default Level for All Players"
              outlined
              dense
              emit-value
              map-options
              @update:model-value="updateAllBulkLevels"
            >
              <template v-slot:prepend>
                <q-icon name="star" />
              </template>
            </q-select>
          </div>

          <!-- Preview List -->
          <div v-if="bulkPlayers.length > 0">
            <div class="text-subtitle2 q-mb-sm">
              <q-icon name="preview" class="q-mr-xs" />
              Preview ({{ bulkPlayers.length }} players)
            </div>
            <q-list bordered separator>
              <q-item
                v-for="(player, index) in bulkPlayers"
                :key="index"
                class="q-pa-sm"
              >
                <q-item-section avatar>
                  <PlayerAvatar :name="player.username" size="sm" />
                </q-item-section>
                <q-item-section>
                  <q-item-label class="text-weight-medium">{{
                    player.username
                  }}</q-item-label>
                  <q-item-label caption>Level {{ player.level }}</q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-select
                    v-model="bulkPlayers[index].level"
                    :options="levelOptions"
                    dense
                    outlined
                    emit-value
                    map-options
                    style="min-width: 120px"
                  >
                    <template v-slot:prepend>
                      <q-icon
                        :name="getLevelIcon(player.level)"
                        :color="getLevelColor(player.level)"
                        size="xs"
                      />
                    </template>
                  </q-select>
                </q-item-section>
              </q-item>
            </q-list>
          </div>
        </div>

        <!-- Club Members Mode -->
        <div v-else-if="addPlayerMode === 'club'" class="q-gutter-y-md">
          <!-- Search & Sort -->
          <div class="row q-col-gutter-x-sm">
            <div class="col-12 col-sm-6">
              <q-input
                v-model="clubMemberSearch"
                label="Search club members"
                outlined
                dense
                clearable
              >
                <template v-slot:prepend>
                  <q-icon name="search" />
                </template>
              </q-input>
            </div>
            <div class="col-12 col-sm-6 club-sort-col">
              <q-select
                v-model="clubMemberSort"
                :options="[
                  { label: 'Name A-Z', value: 'nameAsc' },
                  { label: 'Name Z-A', value: 'nameDesc' },
                  { label: 'Rating High-Low', value: 'ratingDesc' },
                  { label: 'Rating Low-High', value: 'ratingAsc' },
                ]"
                label="Sort by"
                outlined
                dense
                emit-value
                map-options
              />
            </div>
          </div>

          <!-- Selected count -->
          <div class="text-caption text-grey-7 q-mt-md">
            {{ selectedClubMembers.length }} member(s) selected
          </div>

          <!-- Members list -->
          <div class="q-mt-md">
            <q-list separator class="rounded-borders">
              <q-item
                v-for="member in availableClubMembers"
                :key="member.id"
                :clickable="true"
                @click="toggleClubMember(member.id)"
                :class="{ 'bg-purple-1': isClubMemberSelected(member.id) }"
              >
                <q-item-section avatar>
                  <PlayerAvatar
                    :name="member.firstName"
                    :username="member.username"
                    :email="member.email"
                    :user-id="member.id"
                    :dupr-id="member.duprId"
                    :image-url="
                      !clubMemberAvatarErrors.has(member.id)
                        ? member.avatar
                        : undefined
                    "
                    size="md"
                    @image-error="clubMemberAvatarErrors.add(member.id)"
                  />
                </q-item-section>
                <q-item-section>
                  <div class="row items-center no-wrap">
                    <q-item-label class="text-weight-medium ellipsis">
                      {{
                        member.firstName ||
                        member.username ||
                        member.email?.split('@')[0] ||
                        'Unknown'
                      }}
                    </q-item-label>
                    <q-chip
                      :label="member.rating || 1450"
                      :color="getRatingColor(member.rating || 1450)"
                      text-color="white"
                      size="xs"
                      dense
                      class="q-ml-xs"
                    />
                  </div>
                  <q-item-label
                    caption
                    class="text-grey-6"
                    style="font-size: 10px"
                    v-if="member.username && member.firstName"
                  >
                    @{{ member.username }}
                  </q-item-label>
                </q-item-section>
                <q-item-section side>
                  <div class="row items-center q-gutter-sm">
                    <q-checkbox
                      :model-value="isClubMemberSelected(member.id)"
                      color="accent"
                      @click.stop="toggleClubMember(member.id)"
                    />
                  </div>
                </q-item-section>
              </q-item>
              <q-item v-if="availableClubMembers.length === 0">
                <q-item-section class="text-grey">
                  No club members available to add
                </q-item-section>
              </q-item>
            </q-list>
          </div>
        </div>

        <!-- QR Mode -->
        <div v-else-if="addPlayerMode === 'qr'" class="q-gutter-y-md">
          <div v-if="scanError" class="text-negative text-center q-pa-md">
            <q-icon name="error" size="48px" />
            <div class="text-h6 q-mt-sm">{{ scanError }}</div>
            <q-btn
              color="accent"
              label="Try Again"
              class="q-mt-md"
              @click="startScan('qr-reader-inline')"
            />
          </div>
          <div v-else style="position: relative; width: 100%">
            <div id="qr-reader-inline" style="width: 100%"></div>
            <div
              v-if="scanProcessing"
              class="absolute-full flex flex-center"
              style="background: rgba(255, 255, 255, 0.85); z-index: 1"
            >
              <div class="text-center">
                <q-spinner size="48px" color="accent" />
                <div class="text-subtitle2 q-mt-md text-grey-7">
                  Processing…
                </div>
              </div>
            </div>
          </div>
          <q-checkbox
            v-model="qrContinueScan"
            label="Stay on scanner after adding a player"
            color="accent"
            dense
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
        >
          <q-tooltip anchor="top middle" self="bottom middle" :offset="[8, 8]"
            >Cancel</q-tooltip
          >
        </q-btn>

        <!-- Single Player Mode Button -->
        <q-btn
          v-if="addPlayerMode === 'single'"
          color="accent"
          @click="addNewPlayer"
          label="Add Player"
          :disable="
            !newPlayerName?.trim() ||
            newPlayerLevel === null ||
            isNewPlayerNameTaken
          "
          icon="add"
        >
          <q-tooltip anchor="top middle" self="bottom middle" :offset="[8, 8]"
            >Add</q-tooltip
          >
        </q-btn>

        <!-- Bulk Import Mode Button -->
        <q-btn
          v-else-if="addPlayerMode === 'bulk'"
          color="accent"
          @click="addBulkPlayers"
          label="Import All Players"
          :disable="bulkPlayers.length === 0"
          icon="group_add"
        >
          <q-tooltip anchor="top middle" self="bottom middle" :offset="[8, 8]"
            >Import all</q-tooltip
          >
        </q-btn>

        <!-- Club Members Mode Button -->
        <q-btn
          v-else-if="addPlayerMode === 'club'"
          color="accent"
          @click="addClubMembers"
          label="Add Selected Members"
          :disable="selectedClubMembers.length === 0"
          icon="groups"
        >
          <q-tooltip anchor="top middle" self="bottom middle" :offset="[8, 8]"
            >Add members</q-tooltip
          >
        </q-btn>
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, toRef } from 'vue';
import { useQuasar, LocalStorage } from 'quasar';
import { useRouter } from 'vue-router';
import { useNotify } from 'src/composables/useNotify';
import { useAuth } from 'src/composables/useAuth';
import { MatchmakingApp } from 'src/services/matchmaking';
import type { Player } from 'src/services/matchmaking';
import { likhaClient } from 'src/services/likhaClient';
import { joinClub as joinClubService } from 'src/services/clubMembership';
import { readUsers } from '@likha-erp/likha-sdk';
import { Html5Qrcode } from 'html5-qrcode';
import PlayerAvatar from '../PlayerAvatar.vue';
import DialogHeader from '../DialogHeader.vue';
import {
  getLevelIcon,
  getLevelColor,
  getRatingColor,
} from '../../utils/playerHelpers';

defineOptions({ name: 'AddPlayerDialog' });

interface ClubMember {
  id: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  rating?: number;
  level?: 1 | 2 | 3;
  isAdmin?: boolean;
  avatar?: string;
  duprId?: string;
  playerJunctionId?: string;
  adminJunctionId?: string;
}

const props = defineProps<{
  modelValue: boolean;
  clubMembers: ClubMember[];
  isCurrentUserAdmin: boolean;
  levelOptions: Array<{ label: string; value: number; description: string }>;
  players: Player[];
  currentClubId: string;
  likhaUrl: string;
  refreshClubMembers: () => Promise<void>;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const $q = useQuasar();
const router = useRouter();
const { notify: ctxNotify } = useNotify();
const notify = ctxNotify as (opts: {
  color?: string;
  type?: string;
  message: string;
  timeout?: number;
}) => void;
const { handleAuthError: ctxHandleAuthError } = useAuth();
const handleAuthError = ctxHandleAuthError as (
  err: unknown,
  router: ReturnType<typeof useRouter>,
) => Promise<boolean>;

const clubMembers = toRef(props, 'clubMembers');
const isCurrentUserAdmin = toRef(props, 'isCurrentUserAdmin');
const levelOptions = toRef(props, 'levelOptions');
const players = toRef(props, 'players');
const currentClubId = toRef(props, 'currentClubId');
const likhaUrl = toRef(props, 'likhaUrl');
const refreshClubMembers = toRef(props, 'refreshClubMembers');

const showAddPlayerDialog = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
});

const newPlayerName = ref<string | null>(null);
const newPlayerLevel = ref<1 | 2 | 3 | null>(null);
const newPlayerDuprId = ref<string>('');
const addPlayerMode = ref<'single' | 'bulk' | 'club' | 'qr'>('single');
const selectedClubMembers = ref<string[]>([]);
const clubMemberSearch = ref('');
const clubMemberSort = ref<'nameAsc' | 'nameDesc' | 'ratingDesc' | 'ratingAsc'>(
  'nameAsc',
);
const clubMemberAvatarErrors = ref<Set<string>>(new Set());
const scanError = ref('');
const scanProcessing = ref(false);
let html5QrCode: Html5Qrcode | null = null;
const bulkPlayerText = ref<string>('');
const bulkPlayers = ref<
  Array<{ username: string; level: 1 | 2 | 3; original: string }>
>([]);
const bulkDefaultLevel = ref<1 | 2 | 3>(2);

const parseBulkPlayers = () => {
  if (!bulkPlayerText.value?.trim()) {
    bulkPlayers.value = [];
    return;
  }

  const text = bulkPlayerText.value;
  const names = text
    .split(/[\n,;]+/)
    .map((n) => n.trim())
    .filter((n) => n);

  const existingLevels = new Map(
    bulkPlayers.value.map((p) => [p.username, p.level]),
  );

  bulkPlayers.value = names.map((name) => ({
    username: name,
    level: existingLevels.get(name) || bulkDefaultLevel.value,
    original: name,
  }));
};

const updateAllBulkLevels = (val: 1 | 2 | 3) => {
  bulkPlayers.value.forEach((p) => (p.level = val));
};

const qrContinueScan = computed<boolean>({
  get: () => MatchmakingApp.state.qrContinueScan ?? true,
  set: (val) => {
    MatchmakingApp.state.qrContinueScan = val;
    MatchmakingApp.stampSetting('qrContinueScan');
    MatchmakingApp.persist();
  },
});

const isNewPlayerNameTaken = computed(() => {
  if (!newPlayerName.value?.trim()) return false;
  const trimmed = newPlayerName.value.trim().toLowerCase();
  return players.value.some(
    (p) => p.username.toLowerCase() === trimmed && !p.deletedAt,
  );
});

const availableClubMembers = computed(() => {
  const search = (clubMemberSearch.value || '').trim().toLowerCase();

  let list = clubMembers.value.filter(
    (m) =>
      m.id &&
      !Object.values(MatchmakingApp.state.players).some(
        (p) => p.userId === m.id && !p.deletedAt,
      ),
  );

  if (search) {
    list = list.filter((m) => {
      const searchString =
        `${m.firstName || ''} ${m.username || ''} ${m.email || ''}`.toLowerCase();
      return searchString.includes(search);
    });
  }

  list = [...list].sort((a, b) => {
    const aSelected = selectedClubMembers.value.includes(a.id) ? 1 : 0;
    const bSelected = selectedClubMembers.value.includes(b.id) ? 1 : 0;
    if (aSelected !== bSelected) return bSelected - aSelected;

    switch (clubMemberSort.value) {
      case 'nameAsc':
        return (a.firstName || a.username || '').localeCompare(
          b.firstName || b.username || '',
        );
      case 'nameDesc':
        return (b.firstName || b.username || '').localeCompare(
          a.firstName || a.username || '',
        );
      case 'ratingDesc':
        return (b.rating || 0) - (a.rating || 0);
      case 'ratingAsc':
        return (a.rating || 0) - (b.rating || 0);
      default:
        return 0;
    }
  });

  return list;
});

const toggleClubMember = (memberId: string) => {
  const idx = selectedClubMembers.value.indexOf(memberId);
  if (idx >= 0) {
    selectedClubMembers.value.splice(idx, 1);
  } else {
    selectedClubMembers.value.push(memberId);
  }
};

const isClubMemberSelected = (memberId: string): boolean => {
  return selectedClubMembers.value.includes(memberId);
};

const startScan = async (elementId = 'qr-reader-inline') => {
  scanError.value = '';
  scanProcessing.value = false;
  try {
    await stopScan();
    const el = document.getElementById(elementId);
    if (el) el.innerHTML = '';
    html5QrCode = new Html5Qrcode(elementId);
    await html5QrCode.start(
      { facingMode: 'environment' },
      { fps: 5, qrbox: { width: 250, height: 250 }, disableFlip: true },
      onScanSuccess,
      () => {
        /* ignore scan errors */
      },
    );
  } catch (err) {
    scanError.value =
      'Camera access denied or not available. Please allow camera permission.';
    console.error('[QR Scan] Start failed:', err);
  }
};

const stopScan = async () => {
  try {
    if (html5QrCode) {
      if (html5QrCode.isScanning) {
        await html5QrCode.stop();
      }
      html5QrCode.clear();
      html5QrCode = null;
    }
  } catch {
    html5QrCode = null;
  }
};

const onScanSuccess = async (decodedText: string) => {
  if (scanProcessing.value) return;
  scanProcessing.value = true;

  await new Promise((resolve) => setTimeout(resolve, 500));

  const scannedUsername = decodedText.trim();
  if (!scannedUsername) {
    notify({ type: 'warning', message: 'Invalid QR code' });
    scanProcessing.value = false;
    return;
  }

  const alreadyInQueue = Object.values(MatchmakingApp.state.players).some(
    (p) =>
      p.username?.toLowerCase() === scannedUsername.toLowerCase() &&
      !p.deletedAt,
  );
  if (alreadyInQueue) {
    notify({
      type: 'info',
      message: `"${scannedUsername}" is already in the queue`,
    });
    if (qrContinueScan.value) {
      scanProcessing.value = false;
    } else {
      scanProcessing.value = false;
      showAddPlayerDialog.value = false;
    }
    return;
  }

  const member = clubMembers.value.find(
    (m) => m.username?.toLowerCase() === scannedUsername.toLowerCase(),
  );

  if (member) {
    const memberLevel = member.level ?? 2;
    const memberRating =
      member.rating ??
      (memberLevel === 1 ? 1450 : memberLevel === 2 ? 1500 : 1550);
    const result = MatchmakingApp.checkInPlayer(
      member.username || scannedUsername,
      memberLevel as 1 | 2 | 3,
      {
        firstName: member.firstName,
        avatar: member.avatar,
        userId: member.id,
        duprId: member.duprId,
        rating: memberRating,
      },
    );
    if (result === 'added') {
      notify({
        type: 'positive',
        message: `Added "${member.firstName || member.username}" to queue`,
      });
    }
    if (qrContinueScan.value) {
      scanProcessing.value = false;
    } else {
      scanProcessing.value = false;
      showAddPlayerDialog.value = false;
    }
    return;
  }

  try {
    const users = await likhaClient.request(
      readUsers({
        filter: { username: { _eq: scannedUsername } },
        fields: ['id', 'first_name', 'username', 'rating', 'avatar', 'dupr_id'],
        limit: 1,
      }),
    );

    if (!users || users.length === 0) {
      notify({
        type: 'warning',
        message: `No registered user found with username "${scannedUsername}"`,
      });
      if (qrContinueScan.value) {
        scanProcessing.value = false;
      } else {
        scanProcessing.value = false;
      }
      return;
    }

    const user = users[0] as Record<string, unknown>;
    const userId = user.id as string;
    const firstName = user.first_name as string | undefined;
    const userRating = user.rating as number | undefined;
    const userAvatar = user.avatar as string | undefined;
    const userDuprId = user.dupr_id as string | undefined;

    const joinResult = await joinClubService(currentClubId.value, userId);
    if (!joinResult.success) {
      notify({
        color: 'negative',
        message: `Failed to join "${scannedUsername}": ${joinResult.error}`,
      });
      if (qrContinueScan.value) {
        scanProcessing.value = false;
      } else {
        scanProcessing.value = false;
      }
      return;
    }

    await refreshClubMembers.value();

    const avatarUrl = userAvatar
      ? `${likhaUrl.value}/assets/${userAvatar}`
      : undefined;
    const memberLevel = 2;
    const memberRating = userRating ?? 1500;
    const checkInResult = MatchmakingApp.checkInPlayer(
      scannedUsername,
      memberLevel,
      {
        firstName,
        avatar: avatarUrl,
        userId,
        duprId: userDuprId,
        rating: memberRating,
      },
    );

    if (checkInResult === 'added') {
      notify({
        type: 'positive',
        message: `Joined & added "${firstName || scannedUsername}" to queue`,
      });
    } else if (checkInResult === 'already_in_queue') {
      notify({
        type: 'info',
        message: `"${firstName || scannedUsername}" is already in the queue`,
      });
    }
    if (qrContinueScan.value) {
      scanProcessing.value = false;
    } else {
      scanProcessing.value = false;
      showAddPlayerDialog.value = false;
    }
  } catch (err) {
    if (await handleAuthError(err, router)) return;
    const rawErr = err as { errors?: { message?: string }[]; message?: string };
    const errMsg =
      rawErr?.errors?.[0]?.message || rawErr?.message || 'Unknown error';
    notify({
      color: 'negative',
      message: `Failed to add "${scannedUsername}": ${errMsg}`,
    });
    if (qrContinueScan.value) {
      scanProcessing.value = false;
    } else {
      scanProcessing.value = false;
    }
  }
};

let scannerRestartTimer: ReturnType<typeof setTimeout> | null = null;
const restartScannerIfActive = () => {
  if (!showAddPlayerDialog.value || addPlayerMode.value !== 'qr') return;
  if (scannerRestartTimer) clearTimeout(scannerRestartTimer);
  scannerRestartTimer = setTimeout(() => {
    scannerRestartTimer = null;
    void startScan('qr-reader-inline');
  }, 500);
};

watch(showAddPlayerDialog, (open) => {
  if (open) {
    const savedMode = LocalStorage.getItem('addPlayerMode') as
      | 'single'
      | 'bulk'
      | 'club'
      | 'qr'
      | null;
    const wasQr = addPlayerMode.value === 'qr';
    addPlayerMode.value = savedMode || 'single';
    selectedClubMembers.value = [];
    clubMemberSearch.value = '';
    newPlayerName.value = null;
    newPlayerLevel.value = null;
    newPlayerDuprId.value = '';
    bulkPlayerText.value = '';
    bulkPlayers.value = [];
    bulkDefaultLevel.value = 2;
    if (addPlayerMode.value === 'qr' && wasQr) {
      scanError.value = '';
      setTimeout(() => startScan('qr-reader-inline'), 300);
    }
  } else {
    void stopScan();
  }
});

watch(addPlayerMode, (mode, oldMode) => {
  LocalStorage.set('addPlayerMode', mode);
  if (mode === 'club') {
    void refreshClubMembers.value();
  }
  if (mode === 'qr') {
    scanError.value = '';
    setTimeout(() => startScan('qr-reader-inline'), 300);
  } else if (oldMode === 'qr') {
    void stopScan();
  }
});

const addClubMembers = () => {
  if (selectedClubMembers.value.length === 0) return;

  const added: string[] = [];
  const alreadyInQueue: string[] = [];
  const alreadyInMatch: string[] = [];

  selectedClubMembers.value.forEach((memberId) => {
    const member = clubMembers.value.find((m) => m.id === memberId);
    if (!member) return;

    const username =
      member.username || member.email?.split('@')[0] || 'Unknown';

    const memberLevel = member.level ?? 2;
    const memberRating =
      member.rating ??
      (memberLevel === 1 ? 1450 : memberLevel === 2 ? 1500 : 1550);
    const result = MatchmakingApp.checkInPlayer(username, memberLevel, {
      firstName: member.firstName,
      avatar: member.avatar,
      userId: member.id,
      duprId: member.duprId,
      rating: memberRating,
    });

    if (result === 'added') {
      added.push(username);
    } else if (result === 'already_in_queue') {
      alreadyInQueue.push(username);
    } else if (result === 'already_in_match') {
      alreadyInMatch.push(username);
    }
  });

  if (added.length > 0) {
    notify({
      type: 'positive',
      message: `Added ${added.length} member(s) to queue: ${added.join(', ')}`,
      timeout: 3000,
    });
  }
  if (alreadyInQueue.length > 0) {
    notify({
      type: 'warning',
      message: `Skipped ${alreadyInQueue.length} already in queue: ${alreadyInQueue.join(', ')}`,
      timeout: 3000,
    });
  }
  if (alreadyInMatch.length > 0) {
    notify({
      type: 'warning',
      message: `Skipped ${alreadyInMatch.length} already in match: ${alreadyInMatch.join(', ')}`,
      timeout: 3000,
    });
  }

  addPlayerMode.value = 'single';
  selectedClubMembers.value = [];
  clubMemberSearch.value = '';
  showAddPlayerDialog.value = false;
};

const addNewPlayer = () => {
  if (!newPlayerName.value?.trim() || newPlayerLevel.value === null) return;
  const trimmedName = newPlayerName.value.trim();
  const initialRating =
    newPlayerLevel.value === 1
      ? 1450
      : newPlayerLevel.value === 2
        ? 1500
        : 1550;
  const result = MatchmakingApp.checkInPlayer(
    trimmedName,
    newPlayerLevel.value,
    { rating: initialRating, duprId: newPlayerDuprId.value || undefined },
  );

  if (result === 'already_in_match') {
    notify({
      type: 'warning',
      message: `Player "${trimmedName}" is already in a match`,
    });
    return;
  }

  if (result === 'already_in_queue') {
    notify({
      type: 'warning',
      message: `Player "${trimmedName}" is already in the queue`,
    });
    return;
  }

  newPlayerName.value = null;
  newPlayerLevel.value = null;
  newPlayerDuprId.value = '';
  showAddPlayerDialog.value = false;
  notify({
    type: 'positive',
    message: `Player "${trimmedName}" added successfully`,
  });
};

const addBulkPlayers = () => {
  const newPlayers: Player[] = [];
  const duplicateNames: string[] = [];
  const invalidNames: string[] = [];
  const alreadyInQueue: string[] = [];
  const alreadyInMatch: string[] = [];

  for (const bulkPlayer of bulkPlayers.value) {
    const trimmedName = bulkPlayer.username.trim();

    if (!trimmedName) {
      invalidNames.push(bulkPlayer.original);
      continue;
    }

    if (
      players.value.some(
        (player) => player.username.toLowerCase() === trimmedName.toLowerCase(),
      )
    ) {
      duplicateNames.push(trimmedName);
      continue;
    }

    const initialRating =
      bulkPlayer.level === 1 ? 1450 : bulkPlayer.level === 2 ? 1500 : 1550;

    const result = MatchmakingApp.checkInPlayer(
      trimmedName,
      bulkPlayer.level as 1 | 2 | 3,
      { rating: initialRating },
    );
    if (result === 'already_in_queue') {
      alreadyInQueue.push(trimmedName);
    } else if (result === 'already_in_match') {
      alreadyInMatch.push(trimmedName);
    }
  }

  if (bulkPlayers.value.length > 0) {
    notify({
      type: 'positive',
      message: `Successfully imported ${newPlayers.length} player${newPlayers.length > 1 ? 's' : ''}`,
    });
  }

  if (duplicateNames.length > 0) {
    notify({
      type: 'warning',
      message: `Skipped ${duplicateNames.length} duplicate player${duplicateNames.length > 1 ? 's' : ''}: ${duplicateNames.join(', ')}`,
      timeout: 5000,
    });
  }

  if (invalidNames.length > 0) {
    notify({
      type: 'warning',
      message: `Skipped ${invalidNames.length} invalid name${invalidNames.length > 1 ? 's' : ''}: ${invalidNames.join(', ')}`,
      timeout: 5000,
    });
  }

  if (alreadyInQueue.length > 0) {
    notify({
      type: 'warning',
      message: `Skipped ${alreadyInQueue.length} player${alreadyInQueue.length > 1 ? 's' : ''} already in queue: ${alreadyInQueue.join(', ')}`,
      timeout: 5000,
    });
  }

  if (alreadyInMatch.length > 0) {
    notify({
      type: 'warning',
      message: `Skipped ${alreadyInMatch.length} player${alreadyInMatch.length > 1 ? 's' : ''} already in match: ${alreadyInMatch.join(', ')}`,
      timeout: 5000,
    });
  }

  addPlayerMode.value = 'single';
  selectedClubMembers.value = [];
  bulkPlayerText.value = '';
  bulkPlayers.value = [];
  bulkDefaultLevel.value = 2;
  showAddPlayerDialog.value = false;
};

defineExpose({
  restartScannerIfActive,
});
</script>
