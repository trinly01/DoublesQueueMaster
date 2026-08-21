<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :maximized="$q.screen.lt.md"
  >
    <q-card
      flat
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
      <DialogHeader title="Settings" icon="settings" />

      <div class="q-px-md q-pt-md">
        <q-btn-group spread class="full-width z-top">
          <q-btn
            flat
            color="accent"
            :class="settingsTab === 'matchmaking' ? 'bg-accent text-white' : ''"
            label="Matchmaking"
            dense
            size="sm"
            @click="settingsTab = 'matchmaking'"
          />
          <q-btn
            flat
            color="accent"
            :class="settingsTab === 'club' ? 'bg-accent text-white' : ''"
            label="Club"
            dense
            size="sm"
            @click="settingsTab = 'club'"
          />
          <q-btn
            flat
            color="accent"
            :class="settingsTab === 'feedback' ? 'bg-accent text-white' : ''"
            dense
            size="sm"
            @click="settingsTab = 'feedback'"
          >
            Feedback
            <q-badge
              v-if="unreadClubFeedbackCount > 0"
              color="negative"
              floating
              rounded
              style="top: -4px; right: -4px"
            >
              {{
                unreadClubFeedbackCount > 99 ? '99+' : unreadClubFeedbackCount
              }}
            </q-badge>
          </q-btn>
        </q-btn-group>
      </div>

      <div
        v-if="settingsTab === 'matchmaking'"
        class="q-pa-md"
        style="flex: 1; overflow-y: auto"
      >
        <div class="q-gutter-y-md">
          <div>
            <div class="text-subtitle2 q-mb-sm">Queue Management</div>
            <div class="row q-col-gutter-md">
              <div class="col-12 col-sm-6">
                <q-select
                  v-model="queueReturnMethod"
                  :options="queueReturnOptions"
                  label="Return Players to Queue"
                  outlined
                  dense
                  emit-value
                  map-options
                >
                  <template v-slot:option="scope">
                    <q-item v-bind="scope.itemProps">
                      <q-item-section>
                        <q-item-label>{{ scope.opt.label }}</q-item-label>
                        <q-item-label
                          v-if="scope.opt.description"
                          caption
                          class="text-grey-7"
                        >
                          {{ scope.opt.description }}
                        </q-item-label>
                      </q-item-section>
                    </q-item>
                  </template>
                </q-select>
              </div>

              <div class="col-12 col-sm-6">
                <q-toggle
                  v-model="autoSortQueue"
                  label="Automatically sort queue by fairness"
                  color="accent"
                />
              </div>

              <div class="col-12 col-sm-6">
                <q-select
                  v-model="queuePriorityMode"
                  :options="queuePriorityOptions"
                  label="Queue priority order"
                  outlined
                  dense
                  emit-value
                  map-options
                >
                  <template v-slot:option="scope">
                    <q-item v-bind="scope.itemProps">
                      <q-item-section>
                        <q-item-label>{{ scope.opt.label }}</q-item-label>
                        <q-item-label
                          v-if="scope.opt.description"
                          caption
                          class="text-grey-7"
                        >
                          {{ scope.opt.description }}
                        </q-item-label>
                      </q-item-section>
                    </q-item>
                  </template>
                </q-select>
              </div>

              <div class="col-12 col-sm-6">
                <q-select
                  v-model="matchmakingMode"
                  :options="matchmakingModeOptions"
                  label="Matchmaking mode"
                  outlined
                  dense
                  emit-value
                  map-options
                >
                  <template v-slot:option="scope">
                    <q-item
                      v-bind="scope.itemProps"
                      :disable="scope.opt.disable"
                      :class="scope.opt.disable ? 'text-grey-5' : ''"
                    >
                      <q-item-section>
                        <q-item-label>
                          {{ scope.opt.label }}
                          <q-badge
                            v-if="scope.opt.disable"
                            color="amber"
                            text-color="white"
                            label="Pro"
                            class="q-ml-xs"
                            dense
                          />
                        </q-item-label>
                        <q-item-label
                          v-if="scope.opt.description"
                          caption
                          class="text-grey-7"
                        >
                          {{ scope.opt.description }}
                        </q-item-label>
                      </q-item-section>
                    </q-item>
                  </template>
                </q-select>
              </div>
            </div>
          </div>

          <q-separator />

          <div>
            <div class="text-subtitle2 q-mb-sm">Court Settings</div>
            <div class="row q-col-gutter-md">
              <div class="col-12 col-sm-6">
                <q-input
                  v-model.number="availableCourts"
                  type="number"
                  label="Number of courts"
                  outlined
                  dense
                  min="1"
                  max="20"
                  :rules="[
                    (v) => v >= 1 || 'Minimum 1',
                    (v) => v <= 20 || 'Maximum 20',
                    (v) => Number.isInteger(v) || 'Whole numbers only',
                  ]"
                />
              </div>
              <div class="col-12 col-sm-6">
                <q-toggle
                  v-model="autoAdvanceMatches"
                  label="Automatically start next match when one completes"
                  color="accent"
                />
              </div>
              <div class="col-12 col-sm-6">
                <q-toggle
                  v-model="ttsEnabled"
                  label="Enable voice announcements (TTS)"
                  color="accent"
                />
              </div>
            </div>
          </div>

          <q-separator />

          <div>
            <div class="text-subtitle2 q-mb-sm">DUPR Export Settings</div>
            <q-select
              v-model="scoreType"
              :options="scoreTypeOptions"
              label="Score Type"
              outlined
              dense
              emit-value
              map-options
              class="q-mb-sm"
            >
              <template v-slot:option="scope">
                <q-item v-bind="scope.itemProps">
                  <q-item-section>
                    <q-item-label>{{ scope.opt.label }}</q-item-label>
                    <q-item-label
                      v-if="scope.opt.description"
                      caption
                      class="text-grey-7"
                    >
                      {{ scope.opt.description }}
                    </q-item-label>
                  </q-item-section>
                </q-item>
              </template>
            </q-select>
          </div>

          <q-separator />

          <div v-if="isCurrentUserAdmin" class="text-subtitle2 q-mb-sm">
            Data Management
          </div>

          <div v-if="isCurrentUserAdmin" class="row q-gutter-sm">
            <div class="col">
              <q-btn
                color="accent"
                @click="$emit('resetGamesPlayed')"
                icon="refresh"
                label="Reset Stats"
                class="full-width"
                stack
                style="min-height: 72px"
              />
            </div>
            <div class="col">
              <q-btn
                color="warning"
                @click="$emit('clearMatches')"
                icon="delete"
                label="Clear Matches"
                class="full-width"
                stack
                style="min-height: 72px"
              />
            </div>
            <div class="col">
              <q-btn
                color="warning"
                @click="$emit('clearQueue')"
                icon="delete_outline"
                label="Clear Queue"
                class="full-width"
                stack
                style="min-height: 72px"
              />
            </div>
          </div>

          <div v-if="isCurrentUserAdmin" class="q-mt-sm row q-gutter-sm">
            <div class="col">
              <q-btn
                color="negative"
                @click="$emit('resetSessionData')"
                icon="restart_alt"
                label="Reset Session"
                class="full-width"
                stack
                style="min-height: 72px"
              />
            </div>
            <div class="col">
              <q-btn
                color="positive"
                @click="$emit('exportDuprCsv')"
                icon="download"
                label="Export DUPR CSV"
                class="full-width"
                stack
                style="min-height: 72px"
                :disable="duprExportableMatches.length === 0"
              />
            </div>
            <div class="col">
              <q-btn
                color="negative"
                @click="$emit('resetAllData')"
                icon="delete_forever"
                label="Reset All"
                class="full-width"
                stack
                style="min-height: 72px"
              />
            </div>
          </div>
        </div>
      </div>

      <div
        v-else-if="settingsTab === 'club'"
        class="q-pa-md"
        style="flex: 1; overflow-y: auto"
      >
        <div class="q-gutter-y-md">
          <!-- Club Info Section (admin only) -->
          <div v-if="isCurrentUserAdmin">
            <div class="text-subtitle2 q-mb-sm">Club Info</div>
            <div class="row items-center q-mb-md">
              <q-avatar v-if="getClubLogoUrl" size="56px" class="q-mr-md">
                <img :src="getClubLogoUrl" :alt="clubName" />
              </q-avatar>
              <q-avatar
                v-else
                size="56px"
                class="q-mr-md"
                color="accent"
                text-color="white"
              >
                <q-icon name="groups" size="28px" />
              </q-avatar>
              <q-btn
                flat
                color="accent"
                icon="upload"
                label="Change Logo"
                size="sm"
                @click="clubLogoInput?.click()"
              />
              <input
                ref="clubLogoInput"
                type="file"
                accept="image/*"
                style="display: none"
                @change="$emit('onLogoSelected', $event)"
              />
            </div>
            <div class="row q-col-gutter-sm">
              <div class="col-12 col-sm-7">
                <q-input
                  v-model="editClubName"
                  filled
                  label="Club Name"
                  dense
                  :rules="[(val) => !!val?.trim() || 'Club name is required']"
                />
              </div>
              <div class="col-12 col-sm-5">
                <q-input
                  v-model="editClubId"
                  filled
                  label="Club ID"
                  dense
                  :rules="[
                    (val) => !!val?.trim() || 'Club ID is required',
                    (val) =>
                      /^[a-z0-9._-]+$/.test(val?.trim() || '') ||
                      'Only lowercase letters, numbers, periods, hyphens, and underscores',
                  ]"
                  @blur="
                    editClubId = editClubId
                      .trim()
                      .toLowerCase()
                      .replace(/[^a-z0-9._-]/g, '')
                  "
                />
              </div>
            </div>
            <div class="row justify-end q-mt-xs">
              <q-btn
                flat
                label="Save Club Info"
                color="primary"
                size="sm"
                :loading="editClubLoading"
                :disable="!editClubName?.trim() || !editClubId?.trim()"
                @click="$emit('saveClubDetails')"
              />
            </div>
            <q-separator class="q-my-md" />
          </div>

          <!-- Members Section -->
          <div class="row q-col-gutter-sm items-center">
            <div class="col-12 col-sm-7">
              <q-input
                v-model="clubSettingsSearch"
                label="Search members"
                outlined
                dense
                clearable
              >
                <template v-slot:prepend>
                  <q-icon name="search" />
                </template>
              </q-input>
            </div>
            <div class="col-12 col-sm-5">
              <q-select
                v-model="clubSettingsSort"
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

          <div>
            <div class="text-subtitle2 q-mb-sm">
              Admins ({{ adminMembers.length }})
            </div>
            <q-list separator dense class="rounded-borders">
              <q-item v-for="member in adminMembers" :key="member.id">
                <q-item-section avatar>
                  <q-avatar size="32px">
                    <img v-if="member.avatar" :src="member.avatar" />
                    <q-icon v-else name="person" color="grey-5" />
                  </q-avatar>
                </q-item-section>
                <q-item-section style="min-width: 0">
                  <div class="row items-center no-wrap">
                    <q-item-label class="ellipsis">{{
                      member.firstName || member.username || 'Unknown'
                    }}</q-item-label>
                    <q-chip
                      :label="member.rating ?? 1450"
                      :color="getRatingColor(member.rating ?? 1450)"
                      text-color="white"
                      size="xs"
                      dense
                      class="q-ml-xs"
                    />
                  </div>
                  <q-item-label caption v-if="member.username" class="ellipsis"
                    >@{{ member.username }}</q-item-label
                  >
                  <MemberMatchStats
                    :stats="
                      adminMatchStats[member.firstName || member.username || '']
                    "
                  />
                </q-item-section>
                <q-item-section side>
                  <q-btn
                    flat
                    dense
                    color="green-8"
                    size="sm"
                    icon="arrow_downward"
                    :disable="adminMembers.length <= 1"
                    @click="
                      $emit(
                        'confirmDemoteAdmin',
                        member.id,
                        member.adminJunctionId!,
                        member.firstName || member.username || 'this member',
                      )
                    "
                  >
                    <q-tooltip
                      anchor="top middle"
                      self="bottom middle"
                      :offset="[8, 8]"
                      v-if="adminMembers.length <= 1"
                    >
                      Club must have at least one admin
                    </q-tooltip>
                    <q-tooltip
                      anchor="top middle"
                      self="bottom middle"
                      :offset="[8, 8]"
                      v-else
                      >Demote to moderator</q-tooltip
                    >
                  </q-btn>
                </q-item-section>
              </q-item>
              <q-item v-if="adminMembers.length === 0">
                <q-item-section class="text-grey">
                  No admins found
                </q-item-section>
              </q-item>
            </q-list>
          </div>

          <q-separator />

          <div>
            <div class="text-subtitle2 q-mb-sm">
              Moderators ({{ moderatorMembers.length }})
            </div>
            <q-list separator dense class="rounded-borders">
              <q-item v-for="member in moderatorMembers" :key="member.id">
                <q-item-section avatar>
                  <q-avatar size="32px">
                    <img v-if="member.avatar" :src="member.avatar" />
                    <q-icon v-else name="person" color="grey-5" />
                  </q-avatar>
                </q-item-section>
                <q-item-section style="min-width: 0">
                  <div class="row items-center no-wrap">
                    <q-item-label class="ellipsis">{{
                      member.firstName || member.username || 'Unknown'
                    }}</q-item-label>
                    <q-chip
                      :label="member.rating ?? 1450"
                      :color="getRatingColor(member.rating ?? 1450)"
                      text-color="white"
                      size="xs"
                      dense
                      class="q-ml-xs"
                    />
                  </div>
                  <q-item-label caption v-if="member.username" class="ellipsis"
                    >@{{ member.username }}</q-item-label
                  >
                  <MemberMatchStats
                    :stats="
                      adminMatchStats[member.firstName || member.username || '']
                    "
                  />
                </q-item-section>
                <q-item-section side>
                  <div class="row q-gutter-xs">
                    <q-btn
                      flat
                      dense
                      color="amber-8"
                      size="sm"
                      icon="arrow_upward"
                      @click="
                        $emit(
                          'confirmPromoteModeratorToAdmin',
                          member.id,
                          member.moderatorJunctionId!,
                          member.firstName || member.username || 'this member',
                        )
                      "
                    >
                      <q-tooltip
                        anchor="top middle"
                        self="bottom middle"
                        :offset="[8, 8]"
                        >Promote to admin</q-tooltip
                      >
                    </q-btn>
                    <q-btn
                      flat
                      dense
                      color="warning"
                      size="sm"
                      icon="arrow_downward"
                      @click="
                        $emit(
                          'confirmDemoteModerator',
                          member.id,
                          member.moderatorJunctionId!,
                          member.firstName || member.username || 'this member',
                        )
                      "
                    >
                      <q-tooltip
                        anchor="top middle"
                        self="bottom middle"
                        :offset="[8, 8]"
                        >Demote to member</q-tooltip
                      >
                    </q-btn>
                  </div>
                </q-item-section>
              </q-item>
              <q-item v-if="moderatorMembers.length === 0">
                <q-item-section class="text-grey">
                  No moderators found
                </q-item-section>
              </q-item>
            </q-list>
          </div>

          <q-separator />

          <div>
            <div class="text-subtitle2 q-mb-sm">
              Members ({{
                regularMembers.length +
                adminMembers.length +
                moderatorMembers.length
              }})
            </div>
            <q-list separator dense class="rounded-borders">
              <q-item v-for="member in regularMembers" :key="member.id">
                <q-item-section avatar>
                  <q-avatar size="32px">
                    <img v-if="member.avatar" :src="member.avatar" />
                    <q-icon v-else name="person" color="grey-5" />
                  </q-avatar>
                </q-item-section>
                <q-item-section style="min-width: 0">
                  <div class="row items-center no-wrap">
                    <q-item-label class="ellipsis">{{
                      member.firstName || member.username || 'Unknown'
                    }}</q-item-label>
                    <q-chip
                      :label="member.rating ?? 1450"
                      :color="getRatingColor(member.rating ?? 1450)"
                      text-color="white"
                      size="xs"
                      dense
                      class="q-ml-xs"
                    />
                  </div>
                  <q-item-label caption v-if="member.username" class="ellipsis"
                    >@{{ member.username }}</q-item-label
                  >
                </q-item-section>
                <q-item-section side>
                  <div class="row q-gutter-xs">
                    <q-btn
                      flat
                      dense
                      color="green-8"
                      size="sm"
                      icon="arrow_upward"
                      @click="
                        $emit(
                          'confirmPromoteToModerator',
                          member.id,
                          member.firstName || member.username || 'this member',
                        )
                      "
                    >
                      <q-tooltip
                        anchor="top middle"
                        self="bottom middle"
                        :offset="[8, 8]"
                        >Make moderator</q-tooltip
                      >
                    </q-btn>
                    <q-btn
                      flat
                      dense
                      color="negative"
                      size="sm"
                      icon="remove_circle"
                      @click="
                        $emit(
                          'confirmRemoveMember',
                          member.id,
                          member.playerJunctionId!,
                          member.firstName || member.username || 'this member',
                          member.rating,
                        )
                      "
                    >
                      <q-tooltip
                        anchor="top middle"
                        self="bottom middle"
                        :offset="[8, 8]"
                        >Remove from club</q-tooltip
                      >
                    </q-btn>
                  </div>
                </q-item-section>
              </q-item>
              <q-item v-if="regularMembers.length === 0">
                <q-item-section class="text-grey">
                  No members found
                </q-item-section>
              </q-item>
            </q-list>
          </div>
        </div>
      </div>

      <div
        v-else-if="settingsTab === 'feedback'"
        class="q-pa-md q-pt-lg"
        style="flex: 1; overflow-y: auto"
      >
        <div v-if="clubFeedbackLoading" class="flex flex-center q-py-lg">
          <q-spinner color="primary" size="40px" />
        </div>

        <div
          v-else-if="clubFeedback.length === 0"
          class="text-center q-py-lg text-grey-6"
        >
          <q-icon name="inbox" size="48px" />
          <div class="text-h6 q-mt-sm">No feedback yet</div>
        </div>

        <q-list separator v-else>
          <q-item
            v-for="item in sortedFeedback"
            :key="item.id"
            :class="item.type === 'report' ? 'bg-red-1' : 'bg-green-1'"
          >
            <q-item-section avatar>
              <q-icon
                :name="item.type === 'report' ? 'report_problem' : 'thumb_up'"
                :color="item.type === 'report' ? 'negative' : 'positive'"
                size="28px"
              />
            </q-item-section>

            <q-item-section>
              <q-item-label class="text-weight-medium">
                {{ item.type === 'report' ? 'Report by' : 'Kudos by' }}
                <span class="text-weight-medium ellipsis">{{
                  item.reporterName || 'Unknown'
                }}</span>
                <span
                  v-if="item.reporterUsername"
                  class="text-caption text-grey-6 ellipsis"
                >
                  (@{{ item.reporterUsername }})
                </span>
              </q-item-label>
              <q-item-label class="text-weight-medium">
                <span class="text-grey-7">To: </span>
                <span class="ellipsis">{{ item.playerName || 'Unknown' }}</span>
                <span
                  v-if="item.playerUsername"
                  class="text-caption text-grey-6 ellipsis"
                >
                  (@{{ item.playerUsername }})
                </span>
              </q-item-label>
              <q-item-label class="q-gutter-xs q-mt-sm">
                <q-chip
                  v-for="reason in getClubFeedbackReasons(item)"
                  :key="reason.key"
                  dense
                  size="sm"
                  :icon="reason.icon"
                  :color="item.type === 'report' ? 'negative' : 'positive'"
                  text-color="white"
                >
                  {{ reason.label }}
                </q-chip>
              </q-item-label>
              <q-item-label
                v-if="item.comments"
                caption
                class="q-mt-sm text-grey-8"
              >
                {{ item.comments }}
              </q-item-label>
            </q-item-section>

            <q-item-section side>
              <span class="text-caption text-grey-6">
                {{ formatDateOnly(item.dateUpdated || item.dateCreated) }}
              </span>
            </q-item-section>
          </q-item>
        </q-list>
      </div>

      <!-- Footer Actions -->
      <q-separator />
      <q-card-actions align="right" class="q-pa-md">
        <q-btn
          flat
          label="Close"
          color="grey"
          @click="$emit('update:modelValue', false)"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useQuasar } from 'quasar';
import DialogHeader from '../DialogHeader.vue';
import MemberMatchStats from './MemberMatchStats.vue';
import { getRatingColor, formatDateOnly } from '../../utils/playerHelpers';
import {
  COMMEND_ITEMS,
  REPORT_ITEMS,
  type ClubFeedbackEntry,
  type ReportItem,
} from '../../services/playerReport';

defineOptions({ name: 'SettingsDialog' });

const $q = useQuasar();

const props = defineProps<{
  modelValue: boolean;
  unreadClubFeedbackCount: number;
  isCurrentUserAdmin: boolean;
  queueReturnOptions: Array<{
    label: string;
    value: string;
    description?: string;
  }>;
  queuePriorityOptions: Array<{
    label: string;
    value: string;
    description?: string;
  }>;
  matchmakingModeOptions: Array<{
    label: string;
    value: string;
    description?: string;
    disable?: boolean;
  }>;
  scoreTypeOptions: Array<{
    label: string;
    value: string;
    description?: string;
  }>;
  duprExportableMatches: unknown[];
  getClubLogoUrl: string | undefined;
  clubName: string;
  editClubLoading: boolean;
  adminMembers: Array<{
    id: string;
    username?: string;
    firstName?: string;
    avatar?: string;
    rating?: number;
    adminJunctionId?: string;
  }>;
  moderatorMembers: Array<{
    id: string;
    username?: string;
    firstName?: string;
    avatar?: string;
    rating?: number;
    moderatorJunctionId?: string;
  }>;
  regularMembers: Array<{
    id: string;
    username?: string;
    firstName?: string;
    avatar?: string;
    rating?: number;
    playerJunctionId?: string;
  }>;
  adminMatchStats: Record<
    string,
    {
      total: number;
      auto: number;
      manual: number;
      edited: number;
      scored: number;
    }
  >;
  clubFeedbackLoading: boolean;
  clubFeedback: ClubFeedbackEntry[];
}>();

defineEmits<{
  'update:modelValue': [value: boolean];
  'update:settingsTab': [value: 'matchmaking' | 'club' | 'feedback'];
  'update:queueReturnMethod': [value: string];
  'update:autoSortQueue': [value: boolean];
  'update:queuePriorityMode': [value: string];
  'update:matchmakingMode': [value: string];
  'update:availableCourts': [value: number];
  'update:autoAdvanceMatches': [value: boolean];
  'update:ttsEnabled': [value: boolean];
  'update:scoreType': [value: string];
  'update:editClubName': [value: string];
  'update:editClubId': [value: string];
  'update:clubSettingsSearch': [value: string];
  'update:clubSettingsSort': [
    value: 'nameAsc' | 'nameDesc' | 'ratingDesc' | 'ratingAsc',
  ];
  resetGamesPlayed: [];
  clearMatches: [];
  clearQueue: [];
  resetSessionData: [];
  exportDuprCsv: [];
  resetAllData: [];
  onLogoSelected: [event: Event];
  saveClubDetails: [];
  confirmDemoteAdmin: [memberId: string, adminJunctionId: string, name: string];
  confirmPromoteToAdmin: [memberId: string, name: string];
  confirmDemoteModerator: [
    memberId: string,
    moderatorJunctionId: string,
    name: string,
  ];
  confirmPromoteToModerator: [memberId: string, name: string];
  confirmPromoteModeratorToAdmin: [
    memberId: string,
    moderatorJunctionId: string,
    name: string,
  ];
  confirmRemoveMember: [
    memberId: string,
    playerJunctionId: string,
    name: string,
    rating?: number,
  ];
}>();

const settingsTab = defineModel<'matchmaking' | 'club' | 'feedback'>(
  'settingsTab',
  { required: true },
);
const queueReturnMethod = defineModel<string>('queueReturnMethod', {
  required: true,
});
const autoSortQueue = defineModel<boolean>('autoSortQueue', { required: true });
const queuePriorityMode = defineModel<string>('queuePriorityMode', {
  required: true,
});
const matchmakingMode = defineModel<string>('matchmakingMode', {
  required: true,
});
const availableCourts = defineModel<number>('availableCourts', {
  required: true,
});
const autoAdvanceMatches = defineModel<boolean>('autoAdvanceMatches', {
  required: true,
});
const ttsEnabled = defineModel<boolean>('ttsEnabled', { required: true });
const scoreType = defineModel<string>('scoreType', { required: true });
const editClubName = defineModel<string>('editClubName', { required: true });
const editClubId = defineModel<string>('editClubId', { required: true });
const clubSettingsSearch = defineModel<string>('clubSettingsSearch', {
  required: true,
});
const clubSettingsSort = defineModel<
  'nameAsc' | 'nameDesc' | 'ratingDesc' | 'ratingAsc'
>('clubSettingsSort', { required: true });

const clubLogoInput = ref<HTMLInputElement | null>(null);

const sortedFeedback = computed(() =>
  [...props.clubFeedback].sort((a, b) => {
    const dateA = new Date(a.dateCreated || a.date_created || 0).getTime();
    const dateB = new Date(b.dateCreated || b.date_created || 0).getTime();
    return dateB - dateA;
  }),
);

function getClubFeedbackReasons(item: ClubFeedbackEntry): ReportItem[] {
  const source = item.type === 'report' ? REPORT_ITEMS : COMMEND_ITEMS;
  return item.content.items
    .map((key) => source.find((i) => i.key === key))
    .filter((i): i is ReportItem => !!i);
}
</script>

<style scoped>
.ellipsis {
  display: inline-block;
  max-width: 120px;
  vertical-align: bottom;
}
</style>
