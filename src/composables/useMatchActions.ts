import {
  computed,
  type ComputedRef,
  type Ref,
  type WritableComputedRef,
} from 'vue';
import { useQuasar } from 'quasar';
import type { QNotifyCreateOptions } from 'quasar';
import { MatchmakingApp, type Player } from 'src/services/matchmaking';
import { useNotify } from 'src/composables/useNotify';

type NotifyFn = (opts: QNotifyCreateOptions) => void;

export interface MatchViewModel {
  id: string;
  teamA: Player[];
  teamB: Player[];
  players: Player[];
  expectedDifference: number;
  winProbability: number;
  status: string;
  court?: number;
  order: number;
  createdAt: Date;
  startedAt?: Date;
  queueSource?: string;
  generatedBy?: string;
  editedBy?: string;
  scoredBy?: string;
  cancelledBy?: string;
  matchmakingMode?: string;
  generationType?: string;
  isEdited?: boolean;
  teamAScore?: number;
  teamBScore?: number;
  completedAt?: string;
  updatedAt?: number;
}

export interface UseMatchActionsContext {
  matches: ComputedRef<MatchViewModel[]> | Ref<MatchViewModel[]>;
  queue: ComputedRef<Player[]> | Ref<Player[]>;
  filteredMatches: ComputedRef<MatchViewModel[]> | Ref<MatchViewModel[]>;
  matchType: ComputedRef<'singles' | 'doubles'> | Ref<'singles' | 'doubles'>;
  queuePriorityMode: ComputedRef<string> | Ref<string>;
  queueReturnMethod: WritableComputedRef<string> | Ref<string>;
  queueReturnOptions: { label: string; value: string }[];
  autoAdvanceMatches: ComputedRef<boolean> | Ref<boolean>;
  availableCourts: ComputedRef<number> | Ref<number>;
  currentClubUUID: ComputedRef<string> | Ref<string>;
  clubMembers:
    | ComputedRef<{ id: string; firstName?: string; username?: string }[]>
    | Ref<{ id: string; firstName?: string; username?: string }[]>;
  currentUserId: ComputedRef<string> | Ref<string>;
  selectedPlayers: Ref<Player[]>;
  manualTeam1: Ref<Player[]>;
  manualTeam2: Ref<Player[]>;
  manualSelectionStep: Ref<1 | 2>;
  selectedForSwap: Ref<Player | null>;
  selectedForSwapTeam: Ref<'team1' | 'team2' | null>;
  currentMatchIndex: Ref<number>;
  currentMatchIndexForActions: Ref<number>;
  teamAScore: Ref<number>;
  teamBScore: Ref<number>;
  showMatchResultDialog: Ref<boolean>;
  showMatchEditDialog: Ref<boolean>;
  showReplacePlayerDialog: Ref<boolean>;
  playerToReplaceInEdit: Ref<Player | null>;
}

export function useMatchActions(context: UseMatchActionsContext) {
  const {
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
  } = context;
  const $q = useQuasar();
  const { notify: ctxNotify } = useNotify();
  const notify = ctxNotify as NotifyFn;

  const getCourtCount = (): number => {
    return availableCourts.value || 1;
  };

  const currentAdminName = computed(() => {
    const member = clubMembers.value.find((m) => m.id === currentUserId.value);
    return member?.firstName || member?.username || undefined;
  });

  const isCourtAvailable = (courtNumber: number): boolean => {
    return !matches.value.some(
      (m) => m.court === courtNumber && m.status === 'in-progress',
    );
  };

  const assignCourt = (): number => {
    const courtCount = getCourtCount();

    // Enhanced load balancing: track both in-progress and waiting matches
    const courtLoads = new Map<
      number,
      { inProgress: number; waiting: number; total: number }
    >();
    for (let court = 1; court <= courtCount; court++) {
      courtLoads.set(court, { inProgress: 0, waiting: 0, total: 0 });
    }

    // Count existing matches per court with detailed breakdown
    matches.value.forEach((match) => {
      if (match.court) {
        const currentLoad = courtLoads.get(match.court)!;
        if (match.status === 'in-progress') {
          currentLoad.inProgress++;
        } else if (match.status === 'waiting') {
          currentLoad.waiting++;
        }
        currentLoad.total++;
      }
    });

    // Find the best court using enhanced criteria
    let bestCourt = 1;
    let bestScore = Infinity;

    for (let court = 1; court <= courtCount; court++) {
      const load = courtLoads.get(court)!;

      // Calculate court score (lower is better)
      // Priority 1: Empty courts (no in-progress matches) - highest priority
      // Priority 2: Courts with fewer total matches
      // Priority 3: Courts with fewer waiting matches
      let score = load.total * 1000; // Base score on total matches

      if (load.inProgress > 0) {
        score += 10000; // Heavy penalty for courts with in-progress matches
      }

      score += load.waiting * 100; // Slight penalty for waiting matches

      if (score < bestScore) {
        bestScore = score;
        bestCourt = court;
      }
    }

    return bestCourt;
  };

  // Helper function to generate all possible team combinations
  const generateTeamCombinations = (
    players: Player[],
  ): Array<{ team1: Player[]; team2: Player[] }> => {
    const combinations: Array<{ team1: Player[]; team2: Player[] }> = [];

    // Generate all possible ways to split 4 players into 2 teams of 2
    const indices = [0, 1, 2, 3];

    // Team 1 will have players at indices 0 and 1, Team 2 will have 2 and 3
    // But we need to try different combinations
    const team1Combinations = [
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 2],
      [1, 3],
      [2, 3],
    ];

    for (const team1Indices of team1Combinations) {
      const team2Indices = indices.filter((i) => !team1Indices.includes(i));
      const team1 = team1Indices.map((i) => players[i]);
      const team2 = team2Indices.map((i) => players[i]);

      combinations.push({ team1, team2 });
    }

    return combinations;
  };

  // Helper function to create balanced teams from 4 players with randomness
  const createBalancedMatch = (players: Player[]): Player[] => {
    // If not exactly 4 players, return as-is (cannot balance)
    if (players.length !== 4) {
      return players;
    }

    // Sort players by rating for better team balancing
    const sortedPlayers = [...players].sort(
      (a, b) => (a.rating || 1450) - (b.rating || 1450),
    );

    // Generate all possible team combinations
    const combinations = generateTeamCombinations(sortedPlayers);

    // Calculate skill differences for all combinations
    const combinationsWithScores = combinations.map((combination) => {
      const team1 = combination.team1;
      const team2 = combination.team2;

      const team1Skill = team1.reduce((sum, p) => sum + (p.rating || 1450), 0);
      const team2Skill = team2.reduce((sum, p) => sum + (p.rating || 1450), 0);
      const difference = Math.abs(team1Skill - team2Skill);

      return {
        ...combination,
        difference,
        team1Skill,
        team2Skill,
      };
    });

    // Sort by skill difference (most balanced first)
    combinationsWithScores.sort((a, b) => a.difference - b.difference);

    // Get the best combinations (within 1 skill point difference)
    const bestDifference = combinationsWithScores[0].difference;
    const acceptableCombinations = combinationsWithScores.filter(
      (combo) => combo.difference <= bestDifference + 1,
    );

    // Randomly select from acceptable combinations
    const randomIndex = Math.floor(
      Math.random() * acceptableCombinations.length,
    );
    const selectedCombination = acceptableCombinations[randomIndex];

    return [...selectedCombination.team1, ...selectedCombination.team2];
  };

  // Reusable helpers for match state transitions
  const startMatchOnCourt = (
    match: (typeof MatchmakingApp.state.activeMatches)[0],
    court: number,
  ) => {
    match.status = 'in-progress';
    match.court = court;
    match.startedAt = Date.now();
    match.updatedAt = Date.now();
  };

  // Auto-advance next match for a specific court (priority based on queue settings)
  const autoAdvanceNextMatchForCourt = (courtNumber?: number) => {
    // Only auto-advance if the setting is enabled
    if (!autoAdvanceMatches.value) return;

    // Find the highest-priority waiting match based on queuePriorityMode
    const waitingMatches = matches.value
      .filter(
        (match) =>
          match.status === 'waiting' &&
          (!match.court || match.court === courtNumber),
      )
      .sort((a, b) => {
        // Use queue priority order (same logic as filteredMatches)
        if (queuePriorityMode.value === 'gamesPlayed') {
          const aGames =
            (a as unknown as { minGamesPlayed?: number }).minGamesPlayed ?? 0;
          const bGames =
            (b as unknown as { minGamesPlayed?: number }).minGamesPlayed ?? 0;
          if (aGames !== bGames) return aGames - bGames;
        }
        const aTime =
          (a as unknown as { oldestQueueEntryAt?: number })
            .oldestQueueEntryAt ?? a.createdAt.getTime();
        const bTime =
          (b as unknown as { oldestQueueEntryAt?: number })
            .oldestQueueEntryAt ?? b.createdAt.getTime();
        return aTime - bTime;
      });

    const nextMatch = waitingMatches[0];

    if (nextMatch && courtNumber) {
      // Check if the court is actually available (no in-progress match on it)
      if (isCourtAvailable(courtNumber)) {
        // Court is available, assign and start the match
        const actualMatch = MatchmakingApp.state.activeMatches.find(
          (am) => am.matchId === nextMatch.id,
        );
        if (actualMatch) {
          startMatchOnCourt(actualMatch, courtNumber);
        }

        // Persist the auto-advance changes
        MatchmakingApp.persist();

        // Notify user about auto-advance
        notify({
          type: 'info',
          message: 'Next match auto-started',
          timeout: 3000,
        });
      } else {
        // Court is still occupied, don't auto-start the match
        // The match will remain in waiting status and can be started manually later
        console.log(
          `Court ${courtNumber} is occupied, cannot auto-advance waiting match`,
        );
      }
    }
  };

  const generateNewMatches = () => {
    MatchmakingApp.state.teamSize = matchType.value === 'singles' ? 1 : 2;
    MatchmakingApp.stampSetting('teamSize');
    MatchmakingApp.persist();
    MatchmakingApp.draftNextMatches(
      queuePriorityMode.value,
      currentAdminName.value,
    );

    if (autoAdvanceMatches.value) {
      const courtCount = getCourtCount();
      for (let c = 1; c <= courtCount; c++) {
        if (isCourtAvailable(c)) {
          autoAdvanceNextMatchForCourt(c);
        }
      }
    }

    notify({
      type: 'positive',
      message: 'Matches generated!',
    });
  };

  const openMatchResultDialog = (filteredIndex: number) => {
    // Find the actual match in the global matches array
    const filteredMatch = filteredMatches.value[filteredIndex];
    const globalIndex = matches.value.findIndex(
      (match) => match.id === filteredMatch.id,
    );

    currentMatchIndex.value = globalIndex;
    teamAScore.value = 0;
    teamBScore.value = 0;
    showMatchResultDialog.value = true;
  };

  const completeMatch = () => {
    if (currentMatchIndex.value === -1) {
      console.warn('[completeMatch] currentMatchIndex is -1, aborting');
      return;
    }
    const match = matches.value[currentMatchIndex.value];
    if (!match) {
      console.warn(
        '[completeMatch] match is undefined at index',
        currentMatchIndex.value,
      );
      return;
    }

    const scoreA = Number(teamAScore.value) || 0;
    const scoreB = Number(teamBScore.value) || 0;

    // Ensure the completed match is tagged with the current club UUID
    if (currentClubUUID.value && !MatchmakingApp.state.clubUUID) {
      MatchmakingApp.state.clubUUID = currentClubUUID.value;
    }

    if (scoreA === scoreB) {
      notify({
        type: 'warning',
        message: 'Ties are not allowed.',
      });
      return;
    }

    const freedCourt = match.court;
    console.log(
      '[completeMatch] Completing match',
      match.id,
      'court:',
      freedCourt,
      'returnMethod:',
      queueReturnMethod.value,
    );

    MatchmakingApp.reportMatchScore(
      match.id,
      scoreA,
      scoreB,
      queueReturnMethod.value,
      currentAdminName.value,
    );

    if (freedCourt && autoAdvanceMatches.value) {
      autoAdvanceNextMatchForCourt(freedCourt);
    } else if (autoAdvanceMatches.value) {
      const courtCount = getCourtCount();
      for (let c = 1; c <= courtCount; c++) {
        if (isCourtAvailable(c)) {
          autoAdvanceNextMatchForCourt(c);
        }
      }
    }

    showMatchResultDialog.value = false;
    currentMatchIndex.value = -1;
    teamAScore.value = 0;
    teamBScore.value = 0;

    notify({
      type: 'positive',
      message: 'Match completed! Stats updated.',
    });
  };

  const cancelMatch = (filteredIndex: number) => {
    // Find the actual match in the global matches array
    const filteredMatch = filteredMatches.value[filteredIndex];
    const globalIndex = matches.value.findIndex(
      (match) => match.id === filteredMatch.id,
    );

    const match = matches.value[globalIndex];
    const actualMatch = MatchmakingApp.state.activeMatches.find(
      (am) => am.matchId === match.id,
    );

    if (!actualMatch) {
      notify({
        type: 'negative',
        message: 'Match not found',
      });
      return;
    }

    $q.dialog({
      title: 'Cancel Match',
      message:
        'Are you sure you want to cancel this match? All players will return to the queue.',
      cancel: { label: 'Keep Match', color: 'grey', flat: true },
      ok: {
        label: 'Cancel Match',
        color: 'negative',
        icon: 'cancel',
      },
      persistent: true,
    }).onOk(() => {
      const players = match.players;

      // Show dialog to choose how to return players
      $q.dialog({
        title: 'Return Players to Queue',
        message: `How should ${players.length} player(s) be returned to the queue?`,
        options: {
          type: 'radio',
          model: queueReturnMethod.value,
          items: queueReturnOptions,
        },
        cancel: { label: 'Cancel', color: 'grey', flat: true },
        ok: { label: 'Return to Queue', color: 'accent', icon: 'queue' },
      }).onOk((returnMethod) => {
        // Update the global setting if user chooses a different method
        if (returnMethod && returnMethod !== queueReturnMethod.value) {
          queueReturnMethod.value = returnMethod;
        }

        // Calculate enteredAt based on return method
        const chosenMethod = returnMethod || queueReturnMethod.value;
        let enteredAt = Date.now();
        if (chosenMethod === 'fairness_first') {
          // Jump to Front
          enteredAt = 0; // Oldest possible time
        } else if (chosenMethod === 'smart_position') {
          // Priority Position
          enteredAt = Date.now();
        }

        // Return players to queue (prevent duplicates)
        const playerUsernames = [...actualMatch.teamA, ...actualMatch.teamB];
        for (const username of playerUsernames) {
          // Check if player is already in queue
          const alreadyInQueue = MatchmakingApp.state.queues.some(
            (q) => !q.deletedAt && q.username === username,
          );
          if (!alreadyInQueue) {
            MatchmakingApp.state.queues.push({
              username,
              queueType:
                actualMatch.originalQueueTypes?.[username] ||
                (actualMatch.queueSource === 'MANUAL'
                  ? 'GENERAL'
                  : actualMatch.queueSource) ||
                'GENERAL',
              enteredAt: enteredAt,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              queuedAt: Date.now(),
            });
          }
        }

        // Store court number before tombstoning match
        const courtNumber = actualMatch.court;

        // Tombstone match instead of removing (for cross-admin sync)
        actualMatch.deletedAt = Date.now();
        actualMatch.cancelledBy = currentAdminName.value;
        actualMatch.updatedAt = Date.now();

        // Auto-advance next match for this specific court
        if (courtNumber) {
          autoAdvanceNextMatchForCourt(courtNumber);
        }

        MatchmakingApp.persist();

        notify({
          type: 'positive',
          message: 'Match cancelled and players returned to queue',
        });
      });
    });
  };

  // Start a waiting match
  const startMatch = (filteredIndex: number) => {
    // Find the actual match in the global matches array
    const filteredMatch = filteredMatches.value[filteredIndex];
    const globalIndex = matches.value.findIndex(
      (match) => match.id === filteredMatch.id,
    );

    const match = matches.value[globalIndex];

    if (match.status !== 'waiting') {
      notify({
        type: 'negative',
        message: 'Cannot start this match',
      });
      return;
    }

    const actualMatch = MatchmakingApp.state.activeMatches.find(
      (am) => am.matchId === match.id,
    );
    if (!actualMatch) return;

    // Assign a slot if not already assigned
    if (!actualMatch.court) {
      actualMatch.court = assignCourt();
      actualMatch.updatedAt = Date.now();
    }

    // Check if slot is available
    if (!isCourtAvailable(actualMatch.court)) {
      notify({
        type: 'negative',
        message: 'All slots are currently in use',
      });
      return;
    }

    // Start the match
    startMatchOnCourt(actualMatch, actualMatch.court);

    // Save data
    MatchmakingApp.persist();

    notify({
      type: 'positive',
      message: 'Match started',
    });
  };

  const editMatch = (filteredIndex: number) => {
    // Find the actual match in the global matches array
    const filteredMatch = filteredMatches.value[filteredIndex];
    const globalIndex = matches.value.findIndex(
      (match) => match.id === filteredMatch.id,
    );

    currentMatchIndexForActions.value = globalIndex;
    showMatchEditDialog.value = true;
    manualSelectionStep.value = 1;

    // Pre-populate with current players
    selectedPlayers.value = [...matches.value[globalIndex].players];

    // Determine match type based on number of players
    const currentMatch = matches.value[globalIndex];
    const isDoublesMatch = currentMatch.players.length === 4;

    // For doubles matches, initialize teams
    if (isDoublesMatch) {
      manualTeam1.value = [currentMatch.players[0], currentMatch.players[1]];
      manualTeam2.value = [currentMatch.players[2], currentMatch.players[3]];
    } else {
      // For singles or if not 4 players, clear teams
      manualTeam1.value = [];
      manualTeam2.value = [];
    }
  };

  const currentMatchType = computed(() => {
    return selectedPlayers.value.length === 4 ? 'doubles' : 'singles';
  });

  const availableQueuePlayers = computed(() => {
    const matchPlayerNames = selectedPlayers.value.map((p) => p.username);
    const result = queue.value.filter(
      (p) => !matchPlayerNames.includes(p.username),
    );
    // Sort by queue priority mode (without queue type grouping), then by queue entry time
    return [...result].sort((a, b) => {
      if (queuePriorityMode.value === 'gamesPlayed') {
        if (a.matchesPlayed !== b.matchesPlayed) {
          return a.matchesPlayed - b.matchesPlayed;
        }
      }
      return (
        ((a as unknown as { enteredAt?: number }).enteredAt ?? 0) -
        ((b as unknown as { enteredAt?: number }).enteredAt ?? 0)
      );
    });
  });

  const saveMatchEdit = () => {
    // Store original match before updating
    const originalMatch = matches.value[currentMatchIndexForActions.value];
    const actualMatch = MatchmakingApp.state.activeMatches.find(
      (m) => m.matchId === originalMatch.id,
    );

    if (!actualMatch) {
      notify({
        type: 'negative',
        message: 'Match not found',
      });
      return;
    }

    // Create the updated match
    let updatedPlayers: Player[];
    let newTeamA: string[] = [];
    let newTeamB: string[] = [];

    if (
      currentMatchType.value === 'doubles' &&
      selectedPlayers.value.length === 4 &&
      manualTeam1.value.length === 2 &&
      manualTeam2.value.length === 2
    ) {
      // For doubles with proper teams, use the arranged teams
      updatedPlayers = [...manualTeam1.value, ...manualTeam2.value];
      newTeamA = manualTeam1.value.map((p) => p.username);
      newTeamB = manualTeam2.value.map((p) => p.username);
    } else if (selectedPlayers.value.length === 2) {
      // For singles
      updatedPlayers = [...selectedPlayers.value];
      newTeamA = [selectedPlayers.value[0].username];
      newTeamB = [selectedPlayers.value[1].username];
    } else {
      // Fallback: If not properly configured, just use selected players
      // Split them in half
      updatedPlayers = [...selectedPlayers.value];
      const half = Math.ceil(updatedPlayers.length / 2);
      newTeamA = updatedPlayers.slice(0, half).map((p) => p.username);
      newTeamB = updatedPlayers.slice(half).map((p) => p.username);
    }

    // Find players added and removed from the match
    const originalUsernames = originalMatch.players.map((p) => p.username);

    // Check for duplicate players in the selection
    const usernames = updatedPlayers.map((p) => p.username);
    const uniqueUsernames = new Set(usernames);
    if (usernames.length !== uniqueUsernames.size) {
      notify({
        type: 'negative',
        message: 'Cannot save match with duplicate players',
      });
      return;
    }

    // Check if any added players are already in other matches (excluding current match)
    const addedPlayers = updatedPlayers.filter(
      (p) => !originalUsernames.includes(p.username),
    );
    const playersInOtherMatches = addedPlayers.filter((p) =>
      MatchmakingApp.state.activeMatches.some(
        (m) =>
          !m.deletedAt &&
          m.matchId !== actualMatch.matchId &&
          (m.teamA.includes(p.username) || m.teamB.includes(p.username)),
      ),
    );

    if (playersInOtherMatches.length > 0) {
      const names = playersInOtherMatches.map((p) => p.username).join(', ');
      notify({
        type: 'negative',
        message: `Cannot save match: ${names} already in another match`,
      });
      return;
    }
    const updatedUsernames = updatedPlayers.map((p) => p.username);

    const removedFromMatch = originalMatch.players.filter(
      (p) => !updatedUsernames.includes(p.username),
    );
    const addedToMatch = updatedPlayers.filter(
      (p) => !originalUsernames.includes(p.username),
    );

    // Remove players added to the match from the queue
    addedToMatch.forEach((p) => {
      MatchmakingApp.removeFromQueue(p.username);
    });

    // Return players removed from the match back to the queue
    removedFromMatch.forEach((p) => {
      if (
        !MatchmakingApp.state.queues.some(
          (q) => !q.deletedAt && q.username === p.username,
        )
      ) {
        MatchmakingApp.state.queues.push({
          username: p.username,
          queueType: 'GENERAL',
          enteredAt: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          queuedAt: Date.now(),
        });
      }
    });

    // Capture original matchup before teams are overwritten
    const resolveName = (username: string): string => {
      const p = MatchmakingApp.state.players[username];
      return p?.firstName || username;
    };
    const originalTeamANames = actualMatch.teamA.map(resolveName);
    const originalTeamBNames = actualMatch.teamB.map(resolveName);
    const originalTeamA = originalTeamANames.join(' & ');
    const originalTeamB = originalTeamBNames.join(' & ');
    const originalMatchup = `${originalTeamA} -VS- ${originalTeamB}`;

    // Check if the new teams are actually different from the original.
    // Swapping sides (teamA ↔ teamB) is the same matchup, not an edit.
    const sortedA = JSON.stringify([...actualMatch.teamA].sort());
    const sortedB = JSON.stringify([...actualMatch.teamB].sort());
    const newSortedA = JSON.stringify([...newTeamA].sort());
    const newSortedB = JSON.stringify([...newTeamB].sort());
    const sameOrder = sortedA === newSortedA && sortedB === newSortedB;
    const swappedOrder = sortedA === newSortedB && sortedB === newSortedA;
    const teamsChanged = !sameOrder && !swappedOrder;

    // Update the match teams in MatchmakingApp state
    actualMatch.teamA = newTeamA;
    actualMatch.teamB = newTeamB;
    actualMatch.updatedAt = Date.now();

    // Normalize matchup by sorting names within each team so order doesn't matter.
    const normalizeMatchup = (teamAUns: string[], teamBUns: string[]) => {
      const a = teamAUns.map(resolveName).sort().join(' & ');
      const b = teamBUns.map(resolveName).sort().join(' & ');
      return `${a} -VS- ${b}`;
    };

    if (!teamsChanged) {
      // Teams are the same (or just swapped sides). If previously edited,
      // check if this matches the original and clear edit history.
      if (actualMatch.isEdited && actualMatch.originalMatchup) {
        const origNormalized = normalizeMatchup(
          actualMatch.originalTeamA?.split(' & ') || [],
          actualMatch.originalTeamB?.split(' & ') || [],
        );
        const newNormalized = normalizeMatchup(newTeamA, newTeamB);
        const newSwappedNormalized = normalizeMatchup(newTeamB, newTeamA);

        if (
          origNormalized === newNormalized ||
          origNormalized === newSwappedNormalized
        ) {
          actualMatch.isEdited = false;
          actualMatch.editedBy = undefined;
          actualMatch.originalMatchup = undefined;
          actualMatch.originalTeamA = undefined;
          actualMatch.originalTeamB = undefined;
        }
      }
    } else {
      // Teams actually changed.
      if (actualMatch.isEdited && actualMatch.originalMatchup) {
        const origNormalized = normalizeMatchup(
          actualMatch.originalTeamA?.split(' & ') || [],
          actualMatch.originalTeamB?.split(' & ') || [],
        );
        const newNormalized = normalizeMatchup(newTeamA, newTeamB);
        const newSwappedNormalized = normalizeMatchup(newTeamB, newTeamA);

        if (
          origNormalized === newNormalized ||
          origNormalized === newSwappedNormalized
        ) {
          // Reverted to original — clear edit history
          actualMatch.isEdited = false;
          actualMatch.editedBy = undefined;
          actualMatch.originalMatchup = undefined;
          actualMatch.originalTeamA = undefined;
          actualMatch.originalTeamB = undefined;
        } else {
          actualMatch.editedBy = currentAdminName.value;
          actualMatch.isEdited = true;
        }
      } else {
        actualMatch.editedBy = currentAdminName.value;
        actualMatch.isEdited = true;
        if (!actualMatch.originalMatchup) {
          actualMatch.originalMatchup = originalMatchup;
          actualMatch.originalTeamA = originalTeamA;
          actualMatch.originalTeamB = originalTeamB;
        }
      }
    }

    // Save data (direct state mutation requires explicit persist)
    MatchmakingApp.persist();

    // Close dialog and reset
    showMatchEditDialog.value = false;
    selectedPlayers.value = [];
    manualTeam1.value = [];
    manualTeam2.value = [];
    manualSelectionStep.value = 1;
    selectedForSwap.value = null;
    selectedForSwapTeam.value = null;

    // Show detailed notification about changes
    let message = 'Match updated successfully!';
    if (removedFromMatch.length > 0 || addedToMatch.length > 0) {
      const changes = [];
      if (removedFromMatch.length > 0) {
        changes.push(`${removedFromMatch.length} player(s) returned to queue`);
      }
      if (addedToMatch.length > 0) {
        changes.push(`${addedToMatch.length} player(s) removed from queue`);
      }
      message += ` (${changes.join(', ')})`;
    }

    notify({
      type: 'positive',
      message: message,
      timeout: 4000,
    });
  };

  // Match edit helper functions
  const removePlayerFromEdit = (player: Player) => {
    // Allow removing players freely - user can add more if needed
    const index = selectedPlayers.value.findIndex(
      (p) => p.username === player.username,
    );
    if (index >= 0) {
      selectedPlayers.value.splice(index, 1);

      notify({
        type: 'info',
        message: `Removed ${player.username} from match`,
        timeout: 2000,
      });
    }
  };

  const addPlayerToEdit = (player: Player) => {
    // Allow adding players up to 4 (maximum for doubles)
    const maxPlayers = 4;
    if (selectedPlayers.value.length < maxPlayers) {
      selectedPlayers.value.push(player);

      notify({
        type: 'positive',
        message: `Added ${player.username} to match`,
        timeout: 2000,
      });
    }
  };

  const replacePlayerInEdit = (playerToReplace: Player) => {
    if (availableQueuePlayers.value.length === 0) {
      notify({
        type: 'warning',
        message: 'No players available in queue to replace with',
      });
      return;
    }

    // Set the player to replace and show custom dialog
    playerToReplaceInEdit.value = playerToReplace;
    showReplacePlayerDialog.value = true;
  };

  const selectReplacementPlayer = (replacementPlayer: Player) => {
    if (!playerToReplaceInEdit.value) return;

    // Replace the player
    const index = selectedPlayers.value.findIndex(
      (p) => p.username === playerToReplaceInEdit.value!.username,
    );
    if (index >= 0) {
      selectedPlayers.value[index] = replacementPlayer;

      notify({
        type: 'positive',
        message: `Replaced ${playerToReplaceInEdit.value.username} with ${replacementPlayer.username}`,
      });
    }

    // Close dialog and reset
    showReplacePlayerDialog.value = false;
    playerToReplaceInEdit.value = null;
  };

  return {
    currentAdminName,
    isCourtAvailable,
    assignCourt,
    createBalancedMatch,
    generateTeamCombinations,
    generateNewMatches,
    openMatchResultDialog,
    completeMatch,
    autoAdvanceNextMatchForCourt,
    cancelMatch,
    startMatch,
    startMatchOnCourt,
    editMatch,
    saveMatchEdit,
    currentMatchType,
    availableQueuePlayers,
    removePlayerFromEdit,
    addPlayerToEdit,
    replacePlayerInEdit,
    selectReplacementPlayer,
  };
}
