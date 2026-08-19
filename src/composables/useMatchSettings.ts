import { computed, watch, type ComputedRef } from 'vue';
import { MatchmakingApp } from 'src/services/matchmaking';
import { clearSpeechQueue } from 'src/services/announcer';
import { useNotify } from 'src/composables/useNotify';
import type { DeviceSettings } from 'src/composables/useDeviceSettings';
import type { QNotifyCreateOptions } from 'quasar';

type NotifyFn = (opts: QNotifyCreateOptions) => void;

export interface UseMatchSettingsContext {
  deviceSettings: DeviceSettings;
  saveDeviceSettings: () => void;
  isClubSubscriptionExpired: ComputedRef<boolean>;
  autoAdvanceMatchesRef: ComputedRef<boolean>;
  matches: ComputedRef<{ status: string }[]>;
  isCourtAvailable: (court: number) => boolean;
  autoAdvanceNextMatchForCourt: (court?: number) => void;
}

export const MATCHMAKING_MODE_INFO: {
  label: string;
  value: string;
  description: string;
}[] = [
  {
    label: 'Casual',
    value: 'fair_balance',
    description: 'Fair teams from the queue. Ratings stay unchanged.',
  },
  {
    label: 'Social',
    value: 'variety_first',
    description:
      'Fresh partners and opponents each round. Ratings stay unchanged.',
  },
  {
    label: 'Standard',
    value: 'balanced_variety',
    description:
      'Balanced teams with varied matchups. Ratings reflect results after each game.',
  },
  {
    label: 'Competitive',
    value: 'balance_first',
    description:
      'Closest matched games from the queue. Ratings reflect results after each game.',
  },
  {
    label: 'Pro Pick',
    value: 'strict_balance',
    description:
      'Picks from the whole pool for ranked games. Ratings reflect results after each game.',
  },
];

export const getMatchmakingModeLabel = (mode: string): string =>
  MATCHMAKING_MODE_INFO.find((o) => o.value === mode)?.label || mode;

export const getMatchmakingModeDescription = (
  mode: string,
): string | undefined =>
  MATCHMAKING_MODE_INFO.find((o) => o.value === mode)?.description;

export function useMatchSettings(context: UseMatchSettingsContext) {
  const {
    deviceSettings,
    saveDeviceSettings,
    isClubSubscriptionExpired,
    autoAdvanceMatchesRef,
    matches,
    isCourtAvailable,
    autoAdvanceNextMatchForCourt,
  } = context;
  const { notify: ctxNotify } = useNotify();
  const notify = ctxNotify as NotifyFn;

  // Court Management Settings
  const availableCourts = computed<number>({
    get: () => MatchmakingApp.state.availableCourts ?? 1,
    set: (val) => {
      const newCap = Math.max(1, Math.min(20, Math.floor(Number(val) || 1)));
      const oldCap = MatchmakingApp.state.availableCourts ?? 1;

      MatchmakingApp.state.availableCourts = newCap;
      MatchmakingApp.stampSetting('availableCourts');
      MatchmakingApp.persist();

      if (newCap < oldCap) {
        const demotedIds = MatchmakingApp.enforceConcurrencyLimit();
        if (demotedIds.length > 0) {
          notify({
            type: 'warning',
            message: `Reduced to ${newCap} court${newCap > 1 ? 's' : ''}. ${demotedIds.length} match${demotedIds.length > 1 ? 'es' : ''} moved to waiting.`,
            timeout: 4000,
          });
        } else {
          notify({
            type: 'info',
            message: `Number of courts set to ${newCap}.`,
            timeout: 2000,
          });
        }
      } else if (newCap > oldCap) {
        // Auto-advance waiting matches into newly available slots
        if (autoAdvanceMatchesRef.value) {
          for (let c = oldCap + 1; c <= newCap; c++) {
            if (isCourtAvailable(c)) {
              autoAdvanceNextMatchForCourt(c);
            }
          }
          MatchmakingApp.persist();
        }

        const waitingCount = matches.value.filter(
          (m) => m.status === 'waiting',
        ).length;
        if (waitingCount > 0) {
          notify({
            type: 'positive',
            message: `Increased to ${newCap} court${newCap > 1 ? 's' : ''}. ${waitingCount} waiting match${waitingCount > 1 ? 'es' : ''} can start.`,
            timeout: 4000,
          });
        } else {
          notify({
            type: 'info',
            message: `Increased to ${newCap} court${newCap > 1 ? 's' : ''}. No waiting matches to start.`,
            timeout: 3000,
          });
        }
      }
    },
  });

  const autoAdvanceMatches = computed<boolean>({
    get: () => MatchmakingApp.state.autoAdvanceMatches ?? true,
    set: (val) => {
      MatchmakingApp.state.autoAdvanceMatches = val;
      MatchmakingApp.stampSetting('autoAdvanceMatches');
      MatchmakingApp.persist();
    },
  });

  const ttsEnabled = computed<boolean>({
    get: () => deviceSettings.ttsEnabled ?? true,
    set: (val) => {
      deviceSettings.ttsEnabled = val;
      saveDeviceSettings();
      // Keep MatchmakingApp.state in sync for announcer.ts runtime checks,
      // but use persistSilently() — no cloud push for per-device settings.
      MatchmakingApp.state.ttsEnabled = val;
      MatchmakingApp.persistSilently();
    },
  });
  watch(ttsEnabled, (newVal, oldVal) => {
    if (oldVal === true && newVal === false) {
      clearSpeechQueue();
    }
  });

  const matchType = computed<'singles' | 'doubles'>({
    get: () => MatchmakingApp.state.matchType || 'doubles',
    set: (val) => {
      MatchmakingApp.state.matchType = val;
      MatchmakingApp.stampSetting('matchType');
      MatchmakingApp.persist();
    },
  });

  const queueReturnMethod = computed<
    'fairness_first' | 'end_of_queue' | 'smart_position'
  >({
    get: () => MatchmakingApp.state.queueReturnMethod || 'fairness_first',
    set: (val) => {
      MatchmakingApp.state.queueReturnMethod = val;
      MatchmakingApp.stampSetting('queueReturnMethod');
      MatchmakingApp.persist();
    },
  });

  const queuePriorityMode = computed<'timestamp' | 'gamesPlayed'>({
    get: () => MatchmakingApp.state.queuePriorityMode || 'gamesPlayed',
    set: (val) => {
      MatchmakingApp.state.queuePriorityMode = val;
      MatchmakingApp.stampSetting('queuePriorityMode');
      MatchmakingApp.persist();
    },
  });

  const matchmakingMode = computed<
    | 'variety_first'
    | 'balance_first'
    | 'balanced_variety'
    | 'strict_balance'
    | 'fair_balance'
  >({
    get: () => MatchmakingApp.state.matchmakingMode || 'strict_balance',
    set: (val) => {
      MatchmakingApp.state.matchmakingMode = val;
      MatchmakingApp.stampSetting('matchmakingMode');
      MatchmakingApp.persist();
    },
  });

  const allStarSortDirection = computed<'desc' | 'asc'>({
    get: () => MatchmakingApp.state.allStarSortDirection ?? 'desc',
    set: (val) => {
      MatchmakingApp.state.allStarSortDirection = val;
      MatchmakingApp.stampSetting('allStarSortDirection');
      MatchmakingApp.persist();
    },
  });

  watch(isClubSubscriptionExpired, (expired) => {
    if (
      expired &&
      (matchmakingMode.value === 'balance_first' ||
        matchmakingMode.value === 'strict_balance')
    ) {
      matchmakingMode.value = 'fair_balance';
    }
  });

  const autoSortQueue = computed<boolean>({
    get: () => MatchmakingApp.state.autoSortQueue ?? true,
    set: (val) => {
      MatchmakingApp.state.autoSortQueue = val;
      MatchmakingApp.stampSetting('autoSortQueue');
      MatchmakingApp.persist();
    },
  });

  const scoreType = computed<'RALLY' | 'SIDEOUT'>({
    get: () => MatchmakingApp.state.scoreType || 'SIDEOUT',
    set: (val) => {
      MatchmakingApp.state.scoreType = val;
      MatchmakingApp.stampSetting('scoreType');
      MatchmakingApp.persist();
    },
  });

  const sortBy = computed<
    'matchesPlayed' | 'rating' | 'winRate' | 'wins' | 'losses' | 'name'
  >({
    get: () =>
      (deviceSettings.sortBy || 'matchesPlayed') as
        | 'matchesPlayed'
        | 'rating'
        | 'winRate'
        | 'wins'
        | 'losses'
        | 'name',
    set: (val) => {
      deviceSettings.sortBy = val;
      saveDeviceSettings();
      // Keep MatchmakingApp.state in sync for backward compat, but don't push to cloud.
      MatchmakingApp.state.sortBy = val;
      MatchmakingApp.persistSilently();
    },
  });

  const matchesFilterBy = computed<
    'all' | 'in-progress' | 'waiting' | 'cancelled' | 'completed' | 'edited'
  >({
    get: () => {
      const raw = deviceSettings.matchesFilterBy ?? 'all';
      // Coerce legacy numeric values to 'all'
      if (typeof raw === 'number') return 'all';
      return raw as
        | 'all'
        | 'in-progress'
        | 'waiting'
        | 'cancelled'
        | 'completed'
        | 'edited';
    },
    set: (val) => {
      deviceSettings.matchesFilterBy = val;
      saveDeviceSettings();
      // Keep MatchmakingApp.state in sync for backward compat, but don't push to cloud.
      MatchmakingApp.state.matchesFilterBy = val;
      MatchmakingApp.persistSilently();
    },
  });

  // Static option arrays
  const levelOptions = [
    { label: 'Beginner', value: 1, description: 'New to the game' },
    { label: 'Intermediate', value: 2, description: 'Some experience' },
    { label: 'Advanced', value: 3, description: 'Experienced player' },
  ];

  const matchTypeOptions = [
    { label: 'Singles (1v1)', value: 'singles' },
    { label: 'Doubles (2v2)', value: 'doubles' },
  ];

  const scoreTypeOptions = [
    {
      label: 'Rally',
      value: 'RALLY',
      description: 'Point on every serve (modern)',
    },
    {
      label: 'Sideout',
      value: 'SIDEOUT',
      description: 'Point only on own serve (traditional)',
    },
  ];

  const sortOptions = [
    { label: 'Rating', value: 'rating' },
    { label: 'Win Rate', value: 'winRate' },
    { label: 'Wins', value: 'wins' },
    { label: 'Games Played', value: 'matchesPlayed' },
    { label: 'Losses', value: 'losses' },
    { label: 'Name (A-Z)', value: 'name' },
  ];

  const matchesFilterOptions = [
    { label: 'All', value: 'all' },
    { label: 'In Progress', value: 'in-progress' },
    { label: 'Waiting', value: 'waiting' },
    { label: 'Cancelled', value: 'cancelled' },
    { label: 'Completed', value: 'completed' },
    { label: 'Edited', value: 'edited' },
  ];

  const queueReturnOptions = [
    {
      label: 'Jump to Front',
      value: 'fairness_first',
      description: 'Returning players go to the front of the queue',
    },
    {
      label: 'Go to Back',
      value: 'end_of_queue',
      description: 'Returning players go to the end of the queue',
    },
    {
      label: 'Priority Position',
      value: 'smart_position',
      description: 'Smart position based on games played',
    },
  ];

  const queuePriorityOptions = [
    {
      label: 'First in Line',
      value: 'timestamp',
      description: 'Players are served in the order they joined',
    },
    {
      label: 'Less Played First',
      value: 'gamesPlayed',
      description: 'Players with fewer games get priority',
    },
  ];

  const matchmakingModeOptions = computed(() =>
    MATCHMAKING_MODE_INFO.map((o) => ({
      ...o,
      disable:
        (o.value === 'balance_first' || o.value === 'strict_balance') &&
        isClubSubscriptionExpired.value,
    })),
  );

  return {
    availableCourts,
    autoAdvanceMatches,
    ttsEnabled,
    matchType,
    queueReturnMethod,
    queuePriorityMode,
    matchmakingMode,
    allStarSortDirection,
    autoSortQueue,
    scoreType,
    sortBy,
    matchesFilterBy,
    levelOptions,
    matchTypeOptions,
    scoreTypeOptions,
    sortOptions,
    matchesFilterOptions,
    queueReturnOptions,
    queuePriorityOptions,
    matchmakingModeOptions,
  };
}
