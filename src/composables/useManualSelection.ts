import { type ComputedRef, type Ref } from 'vue';
import type { QNotifyCreateOptions } from 'quasar';
import { MatchmakingApp, type Player } from 'src/services/matchmaking';
import { useNotify } from 'src/composables/useNotify';

type NotifyFn = (opts: QNotifyCreateOptions) => void;

export interface UseManualSelectionContext {
  matchType: ComputedRef<'singles' | 'doubles'> | Ref<'singles' | 'doubles'>;
  matches:
    | ComputedRef<{ id: string; court?: number; status: string }[]>
    | Ref<{ id: string; court?: number; status: string }[]>;
  currentAdminName: ComputedRef<string | undefined> | Ref<string | undefined>;
  createBalancedMatch: (players: Player[]) => Player[];
  assignCourt: () => number | null;
  // Injected refs (shared with match editing)
  showManualSelectionDialog: Ref<boolean>;
  manualSelectionStep: Ref<1 | 2>;
  selectedPlayers: Ref<Player[]>;
  manualTeam1: Ref<Player[]>;
  manualTeam2: Ref<Player[]>;
  selectedForSwap: Ref<Player | null>;
  selectedForSwapTeam: Ref<'team1' | 'team2' | null>;
}

export function useManualSelection(context: UseManualSelectionContext) {
  const {
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
  } = context;
  const { notify: ctxNotify } = useNotify();
  const notify = ctxNotify as NotifyFn;

  const startManualSelection = () => {
    selectedPlayers.value = [];
    manualTeam1.value = [];
    manualTeam2.value = [];
    manualSelectionStep.value = 1;
    showManualSelectionDialog.value = true;
  };

  const cancelManualSelection = () => {
    selectedPlayers.value = [];
    manualTeam1.value = [];
    manualTeam2.value = [];
    manualSelectionStep.value = 1;
    selectedForSwap.value = null;
    selectedForSwapTeam.value = null;
    showManualSelectionDialog.value = false;
  };

  const togglePlayerSelection = (player: Player) => {
    const index = selectedPlayers.value.findIndex(
      (p) => p.username === player.username,
    );
    const maxPlayers = matchType.value === 'singles' ? 2 : 4;

    if (index >= 0) {
      // Remove player
      selectedPlayers.value.splice(index, 1);
    } else {
      // Add player if less than max selected
      if (selectedPlayers.value.length < maxPlayers) {
        selectedPlayers.value.push(player);
      } else {
        notify({
          type: 'warning',
          message: `You can only select ${maxPlayers} players`,
        });
      }
    }
  };

  const isPlayerSelected = (player: Player): boolean => {
    return selectedPlayers.value.some((p) => p.username === player.username);
  };

  const proceedToTeamArrangement = () => {
    const playerCount = selectedPlayers.value.length;

    if (playerCount < 2) {
      notify({
        type: 'warning',
        message: 'Please select at least 2 players',
      });
      return;
    }

    if (playerCount > 4) {
      notify({
        type: 'warning',
        message: 'Maximum 4 players allowed for tennis matches',
      });
      return;
    }

    // For doubles (4 players), use smart algorithm to create balanced teams
    if (playerCount === 4) {
      const balanced = createBalancedMatch([...selectedPlayers.value]);
      manualTeam1.value = [balanced[0], balanced[1]];
      manualTeam2.value = [balanced[2], balanced[3]];
    } else {
      // For singles or other configurations, clear teams
      manualTeam1.value = [];
      manualTeam2.value = [];
    }

    manualSelectionStep.value = 2;
  };

  const createManualMatchWithCourt = () => {
    let matchPlayers: Player[];

    if (matchType.value === 'doubles') {
      matchPlayers = [...manualTeam1.value, ...manualTeam2.value];
    } else {
      matchPlayers = [...selectedPlayers.value];
    }

    // Check for duplicate players in the selection
    const usernames = matchPlayers.map((p) => p.username);
    const uniqueUsernames = new Set(usernames);
    if (usernames.length !== uniqueUsernames.size) {
      notify({
        type: 'negative',
        message: 'Cannot create match with duplicate players',
      });
      return;
    }

    // Check if any selected players are already in other matches
    const playersInMatches = matchPlayers.filter((p) =>
      MatchmakingApp.state.activeMatches.some(
        (m) =>
          !m.deletedAt &&
          (m.teamA.includes(p.username) || m.teamB.includes(p.username)),
      ),
    );

    if (playersInMatches.length > 0) {
      const names = playersInMatches.map((p) => p.username).join(', ');
      notify({
        type: 'negative',
        message: `Cannot create match: ${names} already in another match`,
      });
      return;
    }

    // Auto-assign a slot
    const assignedCourt = assignCourt();

    const isCourtEmpty =
      !!assignedCourt &&
      !matches.value.some(
        (m) => m.court === assignedCourt && m.status === 'in-progress',
      );

    // Map original queue types
    const originalQueueTypes: Record<string, 'GENERAL' | 'WINNERS' | 'LOSERS'> =
      {};
    matchPlayers.forEach((p) => {
      const queueEntry = MatchmakingApp.state.queues
        .filter((q) => !q.deletedAt)
        .find((q) => q.username === p.username);
      originalQueueTypes[p.username] = queueEntry?.queueType || 'GENERAL';
    });

    MatchmakingApp.state.activeMatches.push({
      matchId: `match-${Date.now()}`,
      queueSource: 'MANUAL',
      teamA: (matchType.value === 'doubles'
        ? manualTeam1.value
        : [selectedPlayers.value[0]]
      ).map((p) => p.username),
      teamB: (matchType.value === 'doubles'
        ? manualTeam2.value
        : [selectedPlayers.value[1]]
      ).map((p) => p.username),
      expectedDifference: 0,
      ...(isCourtEmpty
        ? {
            status: 'in-progress' as const,
            court: assignedCourt,
            startedAt: Date.now(),
          }
        : { status: 'waiting' as const, court: undefined }),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      originalQueueTypes,
      generatedBy: currentAdminName.value,
      generationType: 'manual' as const,
    });

    matchPlayers.forEach((p) => MatchmakingApp.removeFromQueue(p.username));
    MatchmakingApp.persist();

    showManualSelectionDialog.value = false;
    selectedPlayers.value = [];
    manualTeam1.value = [];
    manualTeam2.value = [];
    manualSelectionStep.value = 1;

    notify({
      type: 'positive',
      message: 'Manual match created successfully!',
    });
  };

  return {
    startManualSelection,
    cancelManualSelection,
    togglePlayerSelection,
    isPlayerSelected,
    proceedToTeamArrangement,
    createManualMatchWithCourt,
  };
}
