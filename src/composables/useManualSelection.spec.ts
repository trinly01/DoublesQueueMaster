import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import { MatchmakingApp, type Player } from 'src/services/matchmaking';

// Mock useNotify
vi.mock('src/composables/useNotify', () => ({
  useNotify: () => ({
    notify: vi.fn(),
  }),
}));

// Mock quasar
vi.mock('quasar', () => ({
  LocalStorage: {
    getItem: vi.fn(() => null),
    set: vi.fn(),
    remove: vi.fn(),
  },
}));

import { useManualSelection } from './useManualSelection';

function makePlayer(username: string, level: 1 | 2 | 3 = 2): Player {
  return {
    username,
    firstName: username.charAt(0).toUpperCase() + username.slice(1),
    level,
    rating: 1500,
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as Player;
}

function makeContext() {
  const matchType = ref<'singles' | 'doubles'>('doubles');
  const matches = ref<{ id: string; court?: number; status: string }[]>([]);
  const currentAdminName = ref<string | undefined>('admin');
  const createBalancedMatch = vi.fn((players: Player[]) => players);
  const assignCourt = vi.fn(() => 1);
  const showManualSelectionDialog = ref(false);
  const manualSelectionStep = ref<1 | 2>(1);
  const selectedPlayers = ref<Player[]>([]);
  const manualTeam1 = ref<Player[]>([]);
  const manualTeam2 = ref<Player[]>([]);
  const selectedForSwap = ref<Player | null>(null);
  const selectedForSwapTeam = ref<'team1' | 'team2' | null>(null);
  return {
    context: {
      matchType,
      matches,
      currentAdminName,
      createBalancedMatch,
      assignCourt,
      showManualSelectionDialog,
      manualSelectionStep,
      selectedPlayers,
      manualTeam1,
      manualTeam2,
      selectedForSwap,
      selectedForSwapTeam,
    },
    matchType,
    matches,
    currentAdminName,
    createBalancedMatch,
    assignCourt,
    showManualSelectionDialog,
    manualSelectionStep,
    selectedPlayers,
    manualTeam1,
    manualTeam2,
    selectedForSwap,
    selectedForSwapTeam,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  MatchmakingApp.state.players = {};
  MatchmakingApp.state.queues = [];
  MatchmakingApp.state.activeMatches = [];
  MatchmakingApp.state.playersResetAt = 0;
  MatchmakingApp.state.queuesResetAt = 0;
  MatchmakingApp.state.matchesResetAt = 0;
});

describe('useManualSelection — initial state', () => {
  it('starts with dialog closed and step 1', () => {
    const { context, showManualSelectionDialog, manualSelectionStep } =
      makeContext();
    useManualSelection(context);
    expect(showManualSelectionDialog.value).toBe(false);
    expect(manualSelectionStep.value).toBe(1);
  });
});

describe('useManualSelection — startManualSelection', () => {
  it('opens dialog and resets state', () => {
    const {
      context,
      showManualSelectionDialog,
      manualSelectionStep,
      selectedPlayers,
    } = makeContext();
    const { startManualSelection } = useManualSelection(context);
    startManualSelection();
    expect(showManualSelectionDialog.value).toBe(true);
    expect(manualSelectionStep.value).toBe(1);
    expect(selectedPlayers.value).toEqual([]);
  });
});

describe('useManualSelection — cancelManualSelection', () => {
  it('closes dialog and resets state', () => {
    const { context, showManualSelectionDialog, manualSelectionStep } =
      makeContext();
    const { startManualSelection, cancelManualSelection } =
      useManualSelection(context);
    startManualSelection();
    cancelManualSelection();
    expect(showManualSelectionDialog.value).toBe(false);
    expect(manualSelectionStep.value).toBe(1);
  });
});

describe('useManualSelection — togglePlayerSelection', () => {
  it('adds player when under max', () => {
    const { context, selectedPlayers } = makeContext();
    const { togglePlayerSelection } = useManualSelection(context);
    const p = makePlayer('alice');
    togglePlayerSelection(p);
    expect(selectedPlayers.value).toHaveLength(1);
    expect(selectedPlayers.value[0].username).toBe('alice');
  });

  it('removes player when already selected', () => {
    const { context, selectedPlayers } = makeContext();
    const { togglePlayerSelection } = useManualSelection(context);
    const p = makePlayer('alice');
    togglePlayerSelection(p);
    togglePlayerSelection(p);
    expect(selectedPlayers.value).toHaveLength(0);
  });

  it('limits to 4 players for doubles', () => {
    const { context, selectedPlayers } = makeContext();
    const { togglePlayerSelection } = useManualSelection(context);
    for (let i = 0; i < 5; i++) {
      togglePlayerSelection(makePlayer(`p${i}`));
    }
    expect(selectedPlayers.value).toHaveLength(4);
  });

  it('limits to 2 players for singles', () => {
    const { context, matchType, selectedPlayers } = makeContext();
    matchType.value = 'singles';
    const { togglePlayerSelection } = useManualSelection(context);
    for (let i = 0; i < 3; i++) {
      togglePlayerSelection(makePlayer(`p${i}`));
    }
    expect(selectedPlayers.value).toHaveLength(2);
  });
});

describe('useManualSelection — isPlayerSelected', () => {
  it('returns true for selected player', () => {
    const { context } = makeContext();
    const { togglePlayerSelection, isPlayerSelected } =
      useManualSelection(context);
    const p = makePlayer('alice');
    togglePlayerSelection(p);
    expect(isPlayerSelected(p)).toBe(true);
  });

  it('returns false for unselected player', () => {
    const { context } = makeContext();
    const { isPlayerSelected } = useManualSelection(context);
    expect(isPlayerSelected(makePlayer('bob'))).toBe(false);
  });
});

describe('useManualSelection — proceedToTeamArrangement', () => {
  it('warns when less than 2 players', () => {
    const { context, manualSelectionStep } = makeContext();
    const { proceedToTeamArrangement } = useManualSelection(context);
    proceedToTeamArrangement();
    expect(manualSelectionStep.value).toBe(1);
  });

  it('proceeds to step 2 with 4 players for doubles', () => {
    const { context, manualSelectionStep, manualTeam1, manualTeam2 } =
      makeContext();
    const { togglePlayerSelection, proceedToTeamArrangement } =
      useManualSelection(context);
    for (let i = 0; i < 4; i++) togglePlayerSelection(makePlayer(`p${i}`));
    proceedToTeamArrangement();
    expect(manualSelectionStep.value).toBe(2);
    expect(manualTeam1.value).toHaveLength(2);
    expect(manualTeam2.value).toHaveLength(2);
  });

  it('proceeds to step 2 with 2 players for singles', () => {
    const { context, matchType, manualSelectionStep, manualTeam1 } =
      makeContext();
    matchType.value = 'singles';
    const { togglePlayerSelection, proceedToTeamArrangement } =
      useManualSelection(context);
    for (let i = 0; i < 2; i++) togglePlayerSelection(makePlayer(`p${i}`));
    proceedToTeamArrangement();
    expect(manualSelectionStep.value).toBe(2);
    expect(manualTeam1.value).toHaveLength(0);
  });
});

describe('useManualSelection — createManualMatchWithCourt', () => {
  it('creates match and closes dialog for doubles', async () => {
    const {
      context,
      createBalancedMatch,
      showManualSelectionDialog,
      manualSelectionStep,
    } = makeContext();
    createBalancedMatch.mockImplementation((players: Player[]) => players);
    const {
      togglePlayerSelection,
      proceedToTeamArrangement,
      createManualMatchWithCourt,
    } = useManualSelection(context);
    for (let i = 0; i < 4; i++) togglePlayerSelection(makePlayer(`p${i}`));
    proceedToTeamArrangement();
    createManualMatchWithCourt();
    await new Promise((r) => setTimeout(r, 10));
    expect(showManualSelectionDialog.value).toBe(false);
    expect(manualSelectionStep.value).toBe(1);
    expect(MatchmakingApp.state.activeMatches).toHaveLength(1);
  });

  it('rejects duplicate players', () => {
    const { context, showManualSelectionDialog, manualTeam1, manualTeam2 } =
      makeContext();
    const { createManualMatchWithCourt } = useManualSelection(context);
    manualTeam1.value = [makePlayer('alice'), makePlayer('alice')];
    manualTeam2.value = [makePlayer('bob'), makePlayer('bob')];
    createManualMatchWithCourt();
    expect(showManualSelectionDialog.value).toBe(false);
    expect(MatchmakingApp.state.activeMatches).toHaveLength(0);
  });
});
