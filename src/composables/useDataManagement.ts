import { type ComputedRef, type Ref, computed } from 'vue';
import { useQuasar } from 'quasar';
import type { QNotifyCreateOptions } from 'quasar';
import { MatchmakingApp, type CompletedMatch } from 'src/services/matchmaking';
import { useNotify } from 'src/composables/useNotify';
import { buildDuprCsv, downloadDuprCsv } from 'src/utils/duprExport';

type NotifyFn = (opts: QNotifyCreateOptions) => void;

export interface UseDataManagementContext {
  duprExportableMatches: ComputedRef<CompletedMatch[]> | Ref<CompletedMatch[]>;
  clubName: ComputedRef<string> | Ref<string>;
  routeParamsId: ComputedRef<string | string[]> | Ref<string | string[]>;
  showSettingsDialog: Ref<boolean>;
  clubId: ComputedRef<string> | Ref<string>;
  currentUserId: ComputedRef<string> | Ref<string>;
  currentUserName: ComputedRef<string> | Ref<string>;
}

export function useDataManagement(context: UseDataManagementContext) {
  const {
    duprExportableMatches,
    clubName,
    routeParamsId,
    showSettingsDialog,
    clubId: clubIdRef,
    currentUserId,
    currentUserName,
  } = context;
  const $q = useQuasar();
  const { notify: ctxNotify } = useNotify();
  const notify = ctxNotify as NotifyFn;

  const clubId = computed(() => clubIdRef.value || '');

  const confirmWithClubId = (opts: {
    title: string;
    message: string;
    okLabel: string;
    okColor: string;
    okIcon?: string;
    onConfirm: () => void;
  }) => {
    const showDialog = () => {
      $q.dialog({
        title: opts.title,
        message: opts.message,
        html: true,
        prompt: {
          model: '',
          type: 'text',
          label: `Type "${clubId.value}" to confirm`,
          outlined: true,
          isValid: (val) => val.trim() === clubId.value,
        },
        cancel: {
          label: 'Cancel',
          color: 'grey',
          flat: true,
        },
        ok: {
          label: opts.okLabel,
          color: opts.okColor,
          icon: opts.okIcon,
        },
        persistent: true,
      }).onOk(() => {
        opts.onConfirm();
      });
    };
    showDialog();
  };

  const resetGamesPlayed = () => {
    confirmWithClubId({
      title: 'Reset Stats',
      message:
        'Resets games played, wins, and losses to zero for all players.<br><br>' +
        '• Games played → 0<br>' +
        '• Wins → 0<br>' +
        '• Losses → 0<br><br>' +
        'Ratings, queue, matches, and match history are not affected.',
      okLabel: 'Reset Stats',
      okColor: 'negative',
      okIcon: 'refresh',
      onConfirm: () => {
        const playersAffected = Object.keys(
          MatchmakingApp.state.players,
        ).length;
        // Reset player stats (preserve ratings)
        const now = Date.now();
        Object.values(MatchmakingApp.state.players).forEach((player) => {
          player.matchesPlayed = 0;
          player.wins = 0;
          player.losses = 0;
          player.statsUpdatedAt = now;
          player.updatedAt = now;
        });

        MatchmakingApp.persist();
        MatchmakingApp.addActionLog(
          'reset_stats',
          currentUserName.value,
          currentUserId.value,
          { playersAffected },
        );

        notify({
          type: 'positive',
          message: 'All player stats have been reset',
        });
      },
    });
  };

  const clearMatches = () => {
    confirmWithClubId({
      title: 'Clear Matches',
      message:
        'Clears all active (in-progress) matches from this session.<br><br>' +
        'Queue, player stats, and match history are not affected.',
      okLabel: 'Clear Matches',
      okColor: 'warning',
      okIcon: 'delete',
      onConfirm: () => {
        const matchesCleared = MatchmakingApp.state.activeMatches.filter(
          (m) => !m.deletedAt,
        ).length;
        // Tombstone all matches instead of wiping (for cross-admin sync)
        MatchmakingApp.state.activeMatches.forEach((m) => {
          m.deletedAt = Date.now();
          m.updatedAt = Date.now();
        });
        MatchmakingApp.persist();
        MatchmakingApp.addActionLog(
          'clear_matches',
          currentUserName.value,
          currentUserId.value,
          { matchesCleared },
        );

        notify({
          type: 'positive',
          message: 'All matches have been cleared',
        });
      },
    });
  };

  const clearQueue = () => {
    confirmWithClubId({
      title: 'Clear Queue',
      message:
        'Empties the queue for this session.<br><br>' +
        'Player stats, matches, and match history are not affected.',
      okLabel: 'Clear Queue',
      okColor: 'warning',
      okIcon: 'delete_outline',
      onConfirm: () => {
        const queueEntriesCleared = MatchmakingApp.state.queues.filter(
          (q) => !q.deletedAt,
        ).length;
        // Tombstone all queue entries so deletions propagate across admins.
        // Keep the tombstoned entries in the array (do not wipe the array) —
        // otherwise a stale admin's live queue would resurrect on the next sync.
        const now = Date.now();
        MatchmakingApp.state.queues.forEach((q) => {
          q.deletedAt = now;
          q.updatedAt = now;
        });
        MatchmakingApp.persist();
        MatchmakingApp.addActionLog(
          'clear_queue',
          currentUserName.value,
          currentUserId.value,
          { queueEntriesCleared },
        );

        notify({
          type: 'positive',
          message: 'Queue has been cleared',
        });
      },
    });
  };

  const exportDuprCsv = () => {
    const matches = duprExportableMatches.value;
    if (matches.length === 0) {
      notify({
        type: 'warning',
        message: 'No completed matches to export',
      });
      return;
    }

    const eventName = `${clubName.value || 'Club'} - ${new Date().toISOString().split('T')[0]}`;
    const scoreTypeVal = MatchmakingApp.state.scoreType || 'RALLY';

    const csv = buildDuprCsv(matches, { eventName, scoreType: scoreTypeVal });
    const filename = `dupr_matches_${routeParamsId.value}_${new Date().toISOString().split('T')[0]}.csv`;
    downloadDuprCsv(csv, filename);
    MatchmakingApp.addActionLog(
      'export_dupr_csv',
      currentUserName.value,
      currentUserId.value,
      { matchesExported: matches.length },
    );
    notify({
      type: 'positive',
      message: `Exported ${matches.length} match(es) to DUPR CSV`,
    });
  };

  const resetSessionData = () => {
    confirmWithClubId({
      title: 'Restart Session',
      message:
        'Same players stay — stats, matches, queue, and match history are cleared.<br><br>' +
        '• Player stats → reset to 0<br>' +
        '• Active matches → cleared<br>' +
        '• Queue → emptied<br>' +
        '• Match history → cleared from this session<br><br>' +
        'Players and ratings are kept. Match history in the cloud is not affected.',
      okLabel: 'Restart Session',
      okColor: 'negative',
      okIcon: 'restart_alt',
      onConfirm: () => {
        const now = Date.now();
        const playersReset = Object.keys(MatchmakingApp.state.players).length;
        const matchesCleared = MatchmakingApp.state.activeMatches.length;
        const queueCleared = MatchmakingApp.state.queues.filter(
          (q) => !q.deletedAt,
        ).length;

        // Reset player stats
        Object.values(MatchmakingApp.state.players).forEach((player) => {
          player.matchesPlayed = 0;
          player.wins = 0;
          player.losses = 0;
          player.statsUpdatedAt = now;
          player.updatedAt = now;
        });

        // Hard-delete matches and queues; checkpoint handles cross-admin purge
        MatchmakingApp.state.activeMatches = [];
        MatchmakingApp.state.queues = [];
        MatchmakingApp.state.matchesResetAt = now;
        MatchmakingApp.state.queuesResetAt = now;

        // Epoch-based clear for completedMatches (multi-admin safe)
        MatchmakingApp.clearCompletedMatches();

        MatchmakingApp.state.settingsUpdatedAt = now;
        MatchmakingApp.state.lastModified = now;
        MatchmakingApp.persist();
        MatchmakingApp.addActionLog(
          'reset_session',
          currentUserName.value,
          currentUserId.value,
          { matchesCleared, queueCleared, playersReset },
        );

        notify({
          type: 'positive',
          message: 'Session reset complete',
        });
      },
    });
  };

  const resetAllData = () => {
    confirmWithClubId({
      title: 'Clear Session',
      message:
        'All players removed — everything is wiped from this session.<br><br>' +
        '• Players → ALL removed<br>' +
        '• Stats & ratings → deleted<br>' +
        '• Matches & queue → cleared<br>' +
        '• Match history → cleared from this session<br><br>' +
        'Match history in the cloud is not affected.',
      okLabel: 'Delete Everything',
      okColor: 'negative',
      okIcon: 'delete_forever',
      onConfirm: () => {
        MatchmakingApp.hardResetEverything();
        MatchmakingApp.addActionLog(
          'reset_all',
          currentUserName.value,
          currentUserId.value,
        );
        showSettingsDialog.value = false;
        notify({
          type: 'warning',
          message: 'All data has been reset',
        });
      },
    });
  };

  return {
    resetGamesPlayed,
    clearMatches,
    clearQueue,
    exportDuprCsv,
    resetSessionData,
    resetAllData,
  };
}
