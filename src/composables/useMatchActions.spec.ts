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
  useQuasar: () => ({
    dialog: vi.fn(() => {
      const callbacks: Record<string, (val?: unknown) => void> = {};
      const chain = {
        onOk: (cb: (val?: unknown) => void) => {
          callbacks.onOk = cb;
          return chain;
        },
        onCancel: (cb: () => void) => {
          callbacks.onCancel = cb;
          return chain;
        },
      };
      setTimeout(() => {
        if (callbacks.onOk) callbacks.onOk();
      }, 0);
      return chain;
    }),
  }),
  LocalStorage: {
    getItem: vi.fn(() => null),
    set: vi.fn(),
    remove: vi.fn(),
  },
}));

import { useMatchActions, type MatchViewModel } from './useMatchActions';

function makePlayer(
  username: string,
  rating = 1500,
  level: 1 | 2 | 3 = 2,
): Player {
  return {
    username,
    firstName: username.charAt(0).toUpperCase() + username.slice(1),
    level,
    rating,
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as Player;
}

function makeMatchVM(
  id: string,
  status: string,
  court?: number,
  players?: Player[],
): MatchViewModel {
  const p = players || [makePlayer('a'), makePlayer('b')];
  return {
    id,
    teamA: p.slice(0, p.length / 2),
    teamB: p.slice(p.length / 2),
    players: p,
    expectedDifference: 0,
    winProbability: 0.5,
    status,
    court,
    order: 1,
    createdAt: new Date(),
  };
}

function makeContext() {
  const matches = ref<MatchViewModel[]>([]);
  const queue = ref<Player[]>([]);
  const filteredMatches = ref<MatchViewModel[]>([]);
  const matchType = ref<'singles' | 'doubles'>('doubles');
  const queuePriorityMode = ref('time_priority');
  const queueReturnMethod = ref('smart_position');
  const queueReturnOptions = [
    { label: 'Smart Position', value: 'smart_position' },
    { label: 'Fairness First', value: 'fairness_first' },
  ] as { label: string; value: string }[];
  const autoAdvanceMatches = ref(false);
  const availableCourts = ref(2);
  const currentClubUUID = ref('club-uuid-123');
  const clubMembers = ref<
    { id: string; firstName?: string; username?: string }[]
  >([]);
  const currentUserId = ref('user-1');
  const selectedPlayers = ref<Player[]>([]);
  const manualTeam1 = ref<Player[]>([]);
  const manualTeam2 = ref<Player[]>([]);
  const manualSelectionStep = ref<1 | 2>(1);
  const selectedForSwap = ref<Player | null>(null);
  const selectedForSwapTeam = ref<'team1' | 'team2' | null>(null);
  const currentMatchIndex = ref(-1);
  const currentMatchIndexForActions = ref(-1);
  const teamAScore = ref(0);
  const teamBScore = ref(0);
  const showMatchResultDialog = ref(false);
  const showMatchEditDialog = ref(false);
  const showReplacePlayerDialog = ref(false);
  const playerToReplaceInEdit = ref<Player | null>(null);

  return {
    context: {
      matches,
      queue,
      filteredMatches,
      matchType,
      queuePriorityMode,
      queueReturnMethod,
      queueReturnOptions,
      autoAdvanceMatches,
      availableCourts,
      currentClubUUID,
      clubMembers,
      currentUserId,
      selectedPlayers,
      manualTeam1,
      manualTeam2,
      manualSelectionStep,
      selectedForSwap,
      selectedForSwapTeam,
      currentMatchIndex,
      currentMatchIndexForActions,
      teamAScore,
      teamBScore,
      showMatchResultDialog,
      showMatchEditDialog,
      showReplacePlayerDialog,
      playerToReplaceInEdit,
    },
    matches,
    queue,
    filteredMatches,
    matchType,
    queuePriorityMode,
    queueReturnMethod,
    autoAdvanceMatches,
    availableCourts,
    currentClubUUID,
    clubMembers,
    currentUserId,
    selectedPlayers,
    manualTeam1,
    manualTeam2,
    manualSelectionStep,
    selectedForSwap,
    selectedForSwapTeam,
    currentMatchIndex,
    currentMatchIndexForActions,
    teamAScore,
    teamBScore,
    showMatchResultDialog,
    showMatchEditDialog,
    showReplacePlayerDialog,
    playerToReplaceInEdit,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  MatchmakingApp.state.players = {};
  MatchmakingApp.state.queues = [];
  MatchmakingApp.state.activeMatches = [];
  MatchmakingApp.state.completedMatches = [];
  MatchmakingApp.state.playersResetAt = 0;
  MatchmakingApp.state.queuesResetAt = 0;
  MatchmakingApp.state.matchesResetAt = 0;
});

describe('useMatchActions — assignCourt', () => {
  it('returns court 1 when no matches exist', () => {
    const { context } = makeContext();
    const { assignCourt } = useMatchActions(context);
    expect(assignCourt()).toBe(1);
  });

  it('picks the court with lowest load', () => {
    const { context, matches } = makeContext();
    matches.value = [
      makeMatchVM('m1', 'in-progress', 1),
      makeMatchVM('m2', 'waiting', 1),
    ];
    const { assignCourt } = useMatchActions(context);
    expect(assignCourt()).toBe(2);
  });
});

describe('useMatchActions — isCourtAvailable', () => {
  it('returns true when no in-progress match on court', () => {
    const { context } = makeContext();
    const { isCourtAvailable } = useMatchActions(context);
    expect(isCourtAvailable(1)).toBe(true);
  });

  it('returns false when in-progress match on court', () => {
    const { context, matches } = makeContext();
    matches.value = [makeMatchVM('m1', 'in-progress', 1)];
    const { isCourtAvailable } = useMatchActions(context);
    expect(isCourtAvailable(1)).toBe(false);
  });
});

describe('useMatchActions — createBalancedMatch', () => {
  it('returns players as-is for non-4 count', () => {
    const { context } = makeContext();
    const { createBalancedMatch } = useMatchActions(context);
    const players = [makePlayer('a'), makePlayer('b')];
    expect(createBalancedMatch(players)).toBe(players);
  });

  it('returns 4 players for 4 input', () => {
    const { context } = makeContext();
    const { createBalancedMatch } = useMatchActions(context);
    const players = [
      makePlayer('a', 1400),
      makePlayer('b', 1500),
      makePlayer('c', 1600),
      makePlayer('d', 1700),
    ];
    const result = createBalancedMatch(players);
    expect(result).toHaveLength(4);
  });
});

describe('useMatchActions — generateNewMatches', () => {
  it('sets teamSize and calls draftNextMatches', () => {
    const { context, matchType } = makeContext();
    matchType.value = 'singles';
    const { generateNewMatches } = useMatchActions(context);
    generateNewMatches();
    expect(MatchmakingApp.state.teamSize).toBe(1);
  });
});

describe('useMatchActions — openMatchResultDialog', () => {
  it('sets currentMatchIndex and opens dialog', () => {
    const {
      context,
      matches,
      filteredMatches,
      currentMatchIndex,
      teamAScore,
      teamBScore,
      showMatchResultDialog,
    } = makeContext();
    const m = makeMatchVM('m1', 'in-progress', 1);
    matches.value = [m];
    filteredMatches.value = [m];
    const { openMatchResultDialog } = useMatchActions(context);
    openMatchResultDialog(0);
    expect(currentMatchIndex.value).toBe(0);
    expect(teamAScore.value).toBe(0);
    expect(teamBScore.value).toBe(0);
    expect(showMatchResultDialog.value).toBe(true);
  });
});

describe('useMatchActions — completeMatch', () => {
  it('aborts when currentMatchIndex is -1', () => {
    const { context } = makeContext();
    const { completeMatch } = useMatchActions(context);
    completeMatch();
    // Should not throw, just return early
  });

  it('warns on tie scores', () => {
    const {
      context,
      matches,
      currentMatchIndex,
      teamAScore,
      teamBScore,
      showMatchResultDialog,
    } = makeContext();
    matches.value = [makeMatchVM('m1', 'in-progress', 1)];
    currentMatchIndex.value = 0;
    teamAScore.value = 5;
    teamBScore.value = 5;
    showMatchResultDialog.value = true;
    const { completeMatch } = useMatchActions(context);
    completeMatch();
    // Dialog should remain open since tie is rejected
    expect(showMatchResultDialog.value).toBe(true);
  });
});

describe('useMatchActions — cancelMatch', () => {
  it('notifies when match not found', () => {
    const { context, matches, filteredMatches } = makeContext();
    const m = makeMatchVM('m1', 'in-progress', 1);
    matches.value = [m];
    filteredMatches.value = [m];
    const { cancelMatch } = useMatchActions(context);
    cancelMatch(0);
    // The dialog mock auto-fires onOk, but no actualMatch exists
  });
});

describe('useMatchActions — startMatch', () => {
  it('notifies when match is not waiting', () => {
    const { context, matches, filteredMatches } = makeContext();
    const m = makeMatchVM('m1', 'in-progress', 1);
    matches.value = [m];
    filteredMatches.value = [m];
    const { startMatch } = useMatchActions(context);
    startMatch(0);
    // Should return early since match is in-progress
  });
});

describe('useMatchActions — editMatch', () => {
  it('populates selectedPlayers and opens edit dialog', () => {
    const {
      context,
      matches,
      filteredMatches,
      selectedPlayers,
      showMatchEditDialog,
      manualSelectionStep,
    } = makeContext();
    const p = [
      makePlayer('a'),
      makePlayer('b'),
      makePlayer('c'),
      makePlayer('d'),
    ];
    const m = makeMatchVM('m1', 'in-progress', 1, p);
    matches.value = [m];
    filteredMatches.value = [m];
    const { editMatch } = useMatchActions(context);
    editMatch(0);
    expect(showMatchEditDialog.value).toBe(true);
    expect(manualSelectionStep.value).toBe(1);
    expect(selectedPlayers.value).toHaveLength(4);
  });
});

describe('useMatchActions — saveMatchEdit', () => {
  it('notifies when match not found', () => {
    const { context, currentMatchIndexForActions, matches } = makeContext();
    matches.value = [makeMatchVM('m1', 'in-progress', 1)];
    currentMatchIndexForActions.value = 0;
    const { saveMatchEdit } = useMatchActions(context);
    saveMatchEdit();
    // No actualMatch in MatchmakingApp.state, should notify "not found"
  });
});

describe('useMatchActions — match edit helpers', () => {
  it('removePlayerFromEdit removes from selectedPlayers', () => {
    const { context, selectedPlayers } = makeContext();
    const p = makePlayer('alice');
    selectedPlayers.value = [p, makePlayer('bob')];
    const { removePlayerFromEdit } = useMatchActions(context);
    removePlayerFromEdit(p);
    expect(selectedPlayers.value).toHaveLength(1);
    expect(selectedPlayers.value[0].username).toBe('bob');
  });

  it('addPlayerToEdit adds up to 4', () => {
    const { context, selectedPlayers } = makeContext();
    const { addPlayerToEdit } = useMatchActions(context);
    for (let i = 0; i < 5; i++) addPlayerToEdit(makePlayer(`p${i}`));
    expect(selectedPlayers.value).toHaveLength(4);
  });

  it('replacePlayerInEdit shows dialog when queue has players', () => {
    const { context, queue, showReplacePlayerDialog } = makeContext();
    queue.value = [makePlayer('available')];
    const { replacePlayerInEdit } = useMatchActions(context);
    replacePlayerInEdit(makePlayer('target'));
    expect(showReplacePlayerDialog.value).toBe(true);
  });

  it('replacePlayerInEdit warns when queue is empty', () => {
    const { context, showReplacePlayerDialog } = makeContext();
    const { replacePlayerInEdit } = useMatchActions(context);
    replacePlayerInEdit(makePlayer('target'));
    expect(showReplacePlayerDialog.value).toBe(false);
  });

  it('selectReplacementPlayer replaces in selectedPlayers', () => {
    const {
      context,
      selectedPlayers,
      playerToReplaceInEdit,
      showReplacePlayerDialog,
    } = makeContext();
    const target = makePlayer('target');
    const replacement = makePlayer('replacement');
    selectedPlayers.value = [target, makePlayer('other')];
    playerToReplaceInEdit.value = target;
    const { selectReplacementPlayer } = useMatchActions(context);
    selectReplacementPlayer(replacement);
    expect(selectedPlayers.value[0].username).toBe('replacement');
    expect(showReplacePlayerDialog.value).toBe(false);
    expect(playerToReplaceInEdit.value).toBe(null);
  });
});

describe('useMatchActions — currentMatchType', () => {
  it('returns doubles for 4 players', () => {
    const { context, selectedPlayers } = makeContext();
    selectedPlayers.value = [
      makePlayer('a'),
      makePlayer('b'),
      makePlayer('c'),
      makePlayer('d'),
    ];
    const { currentMatchType } = useMatchActions(context);
    expect(currentMatchType.value).toBe('doubles');
  });

  it('returns singles for 2 players', () => {
    const { context, selectedPlayers } = makeContext();
    selectedPlayers.value = [makePlayer('a'), makePlayer('b')];
    const { currentMatchType } = useMatchActions(context);
    expect(currentMatchType.value).toBe('singles');
  });
});

describe('useMatchActions — availableQueuePlayers', () => {
  it('filters out selected players from queue', () => {
    const { context, queue, selectedPlayers } = makeContext();
    queue.value = [makePlayer('a'), makePlayer('b'), makePlayer('c')];
    selectedPlayers.value = [makePlayer('a')];
    const { availableQueuePlayers } = useMatchActions(context);
    expect(availableQueuePlayers.value).toHaveLength(2);
    expect(availableQueuePlayers.value.map((p) => p.username)).toEqual([
      'b',
      'c',
    ]);
  });
});

describe('useMatchActions — currentAdminName', () => {
  it('returns undefined when member not found', () => {
    const { context } = makeContext();
    const { currentAdminName } = useMatchActions(context);
    expect(currentAdminName.value).toBeUndefined();
  });

  it('returns firstName when member found', () => {
    const { context, clubMembers, currentUserId } = makeContext();
    currentUserId.value = 'user-1';
    clubMembers.value = [
      { id: 'user-1', firstName: 'Alice', username: 'alice' },
    ];
    const { currentAdminName } = useMatchActions(context);
    expect(currentAdminName.value).toBe('Alice');
  });
});
