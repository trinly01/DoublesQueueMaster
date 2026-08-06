import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computed } from 'vue';
import { MatchmakingApp } from 'src/services/matchmaking';
import type { DeviceSettings } from 'src/composables/useDeviceSettings';

// Mock useNotify — it calls useQuasar() which needs a DOM
vi.mock('src/composables/useNotify', () => ({
  useNotify: () => ({
    notify: vi.fn(),
  }),
}));

// Mock clearSpeechQueue from announcer
vi.mock('src/services/announcer', () => ({
  clearSpeechQueue: vi.fn(),
}));

import { useMatchSettings } from './useMatchSettings';

function makeContext(
  overrides: Partial<Parameters<typeof useMatchSettings>[0]> = {},
) {
  const deviceSettings: DeviceSettings = {};
  const saveDeviceSettings = vi.fn();
  const isClubSubscriptionExpired = computed(() => false);
  const autoAdvanceMatchesRef = computed(() => true);
  const matches = computed(() => [] as { status: string }[]);
  const isCourtAvailable = vi.fn(() => true);
  const autoAdvanceNextMatchForCourt = vi.fn();

  return {
    context: {
      deviceSettings,
      saveDeviceSettings,
      isClubSubscriptionExpired,
      autoAdvanceMatchesRef,
      matches,
      isCourtAvailable,
      autoAdvanceNextMatchForCourt,
      ...overrides,
    },
    deviceSettings,
    saveDeviceSettings,
  };
}

beforeEach(() => {
  // Reset MatchmakingApp state before each test
  MatchmakingApp.state.availableCourts = undefined;
  MatchmakingApp.state.autoAdvanceMatches = undefined;
  MatchmakingApp.state.ttsEnabled = undefined;
  MatchmakingApp.state.matchType = undefined;
  MatchmakingApp.state.queueReturnMethod = undefined;
  MatchmakingApp.state.queuePriorityMode = undefined;
  MatchmakingApp.state.matchmakingMode = undefined;
  MatchmakingApp.state.autoSortQueue = undefined;
  MatchmakingApp.state.scoreType = undefined;
  MatchmakingApp.state.sortBy = undefined;
  MatchmakingApp.state.matchesFilterBy = undefined;
  vi.clearAllMocks();
});

describe('useMatchSettings — availableCourts', () => {
  it('defaults to 1 when state is undefined', () => {
    const { context } = makeContext();
    const { availableCourts } = useMatchSettings(context);
    expect(availableCourts.value).toBe(1);
  });

  it('reads from MatchmakingApp.state', () => {
    MatchmakingApp.state.availableCourts = 5;
    const { context } = makeContext();
    const { availableCourts } = useMatchSettings(context);
    expect(availableCourts.value).toBe(5);
  });

  it('clamps to 1–20 range on set', () => {
    const { context } = makeContext();
    const { availableCourts } = useMatchSettings(context);
    availableCourts.value = 0;
    expect(MatchmakingApp.state.availableCourts).toBe(1);
    availableCourts.value = 25;
    expect(MatchmakingApp.state.availableCourts).toBe(20);
  });

  it('stamps and persists on set', () => {
    const stampSpy = vi.spyOn(MatchmakingApp, 'stampSetting');
    const persistSpy = vi.spyOn(MatchmakingApp, 'persist');
    const { context } = makeContext();
    const { availableCourts } = useMatchSettings(context);
    availableCourts.value = 3;
    expect(stampSpy).toHaveBeenCalledWith('availableCourts');
    expect(persistSpy).toHaveBeenCalled();
    stampSpy.mockRestore();
    persistSpy.mockRestore();
  });

  it('calls enforceConcurrencyLimit when shrinking', () => {
    MatchmakingApp.state.availableCourts = 5;
    const enforceSpy = vi
      .spyOn(MatchmakingApp, 'enforceConcurrencyLimit')
      .mockReturnValue([]);
    const { context } = makeContext();
    const { availableCourts } = useMatchSettings(context);
    availableCourts.value = 3;
    expect(enforceSpy).toHaveBeenCalled();
    enforceSpy.mockRestore();
  });

  it('auto-advances matches when growing if autoAdvance is enabled', () => {
    MatchmakingApp.state.availableCourts = 2;
    const autoAdvanceNextMatchForCourt = vi.fn();
    const isCourtAvailable = vi.fn(() => true);
    const { context } = makeContext({
      autoAdvanceNextMatchForCourt,
      isCourtAvailable,
    });
    const { availableCourts } = useMatchSettings(context);
    availableCourts.value = 4;
    expect(autoAdvanceNextMatchForCourt).toHaveBeenCalledTimes(2);
    expect(autoAdvanceNextMatchForCourt).toHaveBeenCalledWith(3);
    expect(autoAdvanceNextMatchForCourt).toHaveBeenCalledWith(4);
  });

  it('does not auto-advance when autoAdvanceMatches is disabled', () => {
    MatchmakingApp.state.availableCourts = 2;
    const autoAdvanceNextMatchForCourt = vi.fn();
    const { context } = makeContext({
      autoAdvanceNextMatchForCourt,
      autoAdvanceMatchesRef: computed(() => false),
    });
    const { availableCourts } = useMatchSettings(context);
    availableCourts.value = 4;
    expect(autoAdvanceNextMatchForCourt).not.toHaveBeenCalled();
  });
});

describe('useMatchSettings — autoAdvanceMatches', () => {
  it('defaults to true', () => {
    const { context } = makeContext();
    const { autoAdvanceMatches } = useMatchSettings(context);
    expect(autoAdvanceMatches.value).toBe(true);
  });

  it('reads and writes to MatchmakingApp.state', () => {
    const { context } = makeContext();
    const { autoAdvanceMatches } = useMatchSettings(context);
    autoAdvanceMatches.value = false;
    expect(MatchmakingApp.state.autoAdvanceMatches).toBe(false);
    expect(autoAdvanceMatches.value).toBe(false);
  });
});

describe('useMatchSettings — ttsEnabled', () => {
  it('defaults to true when deviceSettings has no value', () => {
    const { context } = makeContext();
    const { ttsEnabled } = useMatchSettings(context);
    expect(ttsEnabled.value).toBe(true);
  });

  it('reads from deviceSettings', () => {
    const { context } = makeContext();
    context.deviceSettings.ttsEnabled = false;
    const { ttsEnabled } = useMatchSettings(context);
    expect(ttsEnabled.value).toBe(false);
  });

  it('writes to deviceSettings + syncs to MatchmakingApp.state', () => {
    const { context, saveDeviceSettings } = makeContext();
    const { ttsEnabled } = useMatchSettings(context);
    ttsEnabled.value = false;
    expect(context.deviceSettings.ttsEnabled).toBe(false);
    expect(saveDeviceSettings).toHaveBeenCalled();
    expect(MatchmakingApp.state.ttsEnabled).toBe(false);
  });

  it('calls persistSilently (not persist) to avoid cloud push', () => {
    const persistSpy = vi.spyOn(MatchmakingApp, 'persist');
    const persistSilentlySpy = vi.spyOn(MatchmakingApp, 'persistSilently');
    const { context } = makeContext();
    const { ttsEnabled } = useMatchSettings(context);
    ttsEnabled.value = true;
    expect(persistSilentlySpy).toHaveBeenCalled();
    expect(persistSpy).not.toHaveBeenCalled();
    persistSpy.mockRestore();
    persistSilentlySpy.mockRestore();
  });
});

describe('useMatchSettings — matchType', () => {
  it('defaults to doubles', () => {
    const { context } = makeContext();
    const { matchType } = useMatchSettings(context);
    expect(matchType.value).toBe('doubles');
  });

  it('reads and writes', () => {
    const { context } = makeContext();
    const { matchType } = useMatchSettings(context);
    matchType.value = 'singles';
    expect(MatchmakingApp.state.matchType).toBe('singles');
    expect(matchType.value).toBe('singles');
  });
});

describe('useMatchSettings — queueReturnMethod', () => {
  it('defaults to fairness_first', () => {
    const { context } = makeContext();
    const { queueReturnMethod } = useMatchSettings(context);
    expect(queueReturnMethod.value).toBe('fairness_first');
  });

  it('reads and writes', () => {
    const { context } = makeContext();
    const { queueReturnMethod } = useMatchSettings(context);
    queueReturnMethod.value = 'end_of_queue';
    expect(MatchmakingApp.state.queueReturnMethod).toBe('end_of_queue');
  });
});

describe('useMatchSettings — queuePriorityMode', () => {
  it('defaults to gamesPlayed', () => {
    const { context } = makeContext();
    const { queuePriorityMode } = useMatchSettings(context);
    expect(queuePriorityMode.value).toBe('gamesPlayed');
  });

  it('reads and writes', () => {
    const { context } = makeContext();
    const { queuePriorityMode } = useMatchSettings(context);
    queuePriorityMode.value = 'timestamp';
    expect(MatchmakingApp.state.queuePriorityMode).toBe('timestamp');
  });
});

describe('useMatchSettings — matchmakingMode', () => {
  it('defaults to strict_balance', () => {
    const { context } = makeContext();
    const { matchmakingMode } = useMatchSettings(context);
    expect(matchmakingMode.value).toBe('strict_balance');
  });

  it('reads and writes', () => {
    const { context } = makeContext();
    const { matchmakingMode } = useMatchSettings(context);
    matchmakingMode.value = 'variety_first';
    expect(MatchmakingApp.state.matchmakingMode).toBe('variety_first');
  });
});

describe('useMatchSettings — autoSortQueue', () => {
  it('defaults to true', () => {
    const { context } = makeContext();
    const { autoSortQueue } = useMatchSettings(context);
    expect(autoSortQueue.value).toBe(true);
  });

  it('reads and writes', () => {
    const { context } = makeContext();
    const { autoSortQueue } = useMatchSettings(context);
    autoSortQueue.value = false;
    expect(MatchmakingApp.state.autoSortQueue).toBe(false);
  });
});

describe('useMatchSettings — scoreType', () => {
  it('defaults to SIDEOUT', () => {
    const { context } = makeContext();
    const { scoreType } = useMatchSettings(context);
    expect(scoreType.value).toBe('SIDEOUT');
  });

  it('reads and writes', () => {
    const { context } = makeContext();
    const { scoreType } = useMatchSettings(context);
    scoreType.value = 'RALLY';
    expect(MatchmakingApp.state.scoreType).toBe('RALLY');
  });
});

describe('useMatchSettings — sortBy (device setting)', () => {
  it('defaults to matchesPlayed', () => {
    const { context } = makeContext();
    const { sortBy } = useMatchSettings(context);
    expect(sortBy.value).toBe('matchesPlayed');
  });

  it('reads from deviceSettings', () => {
    const { context } = makeContext();
    context.deviceSettings.sortBy = 'rating';
    const { sortBy } = useMatchSettings(context);
    expect(sortBy.value).toBe('rating');
  });

  it('writes to deviceSettings + syncs to state via persistSilently', () => {
    const persistSilentlySpy = vi.spyOn(MatchmakingApp, 'persistSilently');
    const { context, saveDeviceSettings } = makeContext();
    const { sortBy } = useMatchSettings(context);
    sortBy.value = 'wins';
    expect(context.deviceSettings.sortBy).toBe('wins');
    expect(saveDeviceSettings).toHaveBeenCalled();
    expect(MatchmakingApp.state.sortBy).toBe('wins');
    expect(persistSilentlySpy).toHaveBeenCalled();
    persistSilentlySpy.mockRestore();
  });
});

describe('useMatchSettings — matchesFilterBy (device setting)', () => {
  it('defaults to all', () => {
    const { context } = makeContext();
    const { matchesFilterBy } = useMatchSettings(context);
    expect(matchesFilterBy.value).toBe('all');
  });

  it('coerces legacy numeric values to all', () => {
    const { context } = makeContext();
    context.deviceSettings.matchesFilterBy = 1 as unknown as 'all';
    const { matchesFilterBy } = useMatchSettings(context);
    expect(matchesFilterBy.value).toBe('all');
  });

  it('writes to deviceSettings + syncs to state via persistSilently', () => {
    const persistSilentlySpy = vi.spyOn(MatchmakingApp, 'persistSilently');
    const { context, saveDeviceSettings } = makeContext();
    const { matchesFilterBy } = useMatchSettings(context);
    matchesFilterBy.value = 'waiting';
    expect(context.deviceSettings.matchesFilterBy).toBe('waiting');
    expect(saveDeviceSettings).toHaveBeenCalled();
    expect(MatchmakingApp.state.matchesFilterBy).toBe('waiting');
    expect(persistSilentlySpy).toHaveBeenCalled();
    persistSilentlySpy.mockRestore();
  });
});

describe('useMatchSettings — matchmakingModeOptions', () => {
  it('includes all 5 modes', () => {
    const { context } = makeContext();
    const { matchmakingModeOptions } = useMatchSettings(context);
    expect(matchmakingModeOptions.value).toHaveLength(5);
    expect(matchmakingModeOptions.value.map((o) => o.value)).toEqual([
      'fair_balance',
      'variety_first',
      'balanced_variety',
      'balance_first',
      'strict_balance',
    ]);
  });

  it('disables Competitive and All-Star when subscription expired', () => {
    const { context } = makeContext({
      isClubSubscriptionExpired: computed(() => true),
    });
    const { matchmakingModeOptions } = useMatchSettings(context);
    const competitive = matchmakingModeOptions.value.find(
      (o) => o.value === 'balance_first',
    );
    const allStar = matchmakingModeOptions.value.find(
      (o) => o.value === 'strict_balance',
    );
    expect(competitive?.disable).toBe(true);
    expect(allStar?.disable).toBe(true);
  });

  it('enables all modes when subscription active', () => {
    const { context } = makeContext({
      isClubSubscriptionExpired: computed(() => false),
    });
    const { matchmakingModeOptions } = useMatchSettings(context);
    const competitive = matchmakingModeOptions.value.find(
      (o) => o.value === 'balance_first',
    );
    expect(competitive?.disable).toBeFalsy();
  });
});

describe('useMatchSettings — static option arrays', () => {
  it('levelOptions has 3 levels', () => {
    const { context } = makeContext();
    const { levelOptions } = useMatchSettings(context);
    expect(levelOptions).toHaveLength(3);
    expect(levelOptions.map((o) => o.value)).toEqual([1, 2, 3]);
  });

  it('matchTypeOptions has singles and doubles', () => {
    const { context } = makeContext();
    const { matchTypeOptions } = useMatchSettings(context);
    expect(matchTypeOptions.map((o) => o.value)).toEqual([
      'singles',
      'doubles',
    ]);
  });

  it('scoreTypeOptions has RALLY and SIDEOUT', () => {
    const { context } = makeContext();
    const { scoreTypeOptions } = useMatchSettings(context);
    expect(scoreTypeOptions.map((o) => o.value)).toEqual(['RALLY', 'SIDEOUT']);
  });

  it('sortOptions has 6 options', () => {
    const { context } = makeContext();
    const { sortOptions } = useMatchSettings(context);
    expect(sortOptions).toHaveLength(6);
  });

  it('matchesFilterOptions has all, in-progress, waiting', () => {
    const { context } = makeContext();
    const { matchesFilterOptions } = useMatchSettings(context);
    expect(matchesFilterOptions.map((o) => o.value)).toEqual([
      'all',
      'in-progress',
      'waiting',
    ]);
  });

  it('queueReturnOptions has 3 options', () => {
    const { context } = makeContext();
    const { queueReturnOptions } = useMatchSettings(context);
    expect(queueReturnOptions).toHaveLength(3);
  });

  it('queuePriorityOptions has 2 options', () => {
    const { context } = makeContext();
    const { queuePriorityOptions } = useMatchSettings(context);
    expect(queuePriorityOptions).toHaveLength(2);
  });
});
