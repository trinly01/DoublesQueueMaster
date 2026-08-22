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
}

export function useDataManagement(context: UseDataManagementContext) {
  const { duprExportableMatches, clubName, routeParamsId, showSettingsDialog } =
    context;
  const $q = useQuasar();
  const { notify: ctxNotify } = useNotify();
  const notify = ctxNotify as NotifyFn;

  const clubId = computed(() => String(routeParamsId.value));

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
      title: 'Confirm Reset Stats',
      message:
        'This will set games played, wins, and losses to zero for all players. Ratings are preserved.',
      okLabel: 'Reset Stats',
      okColor: 'accent',
      okIcon: 'refresh',
      onConfirm: () => {
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

        notify({
          type: 'positive',
          message: 'All player stats have been reset',
        });
      },
    });
  };

  const clearMatches = () => {
    confirmWithClubId({
      title: 'Confirm Clear Matches',
      message: 'This will remove all current matches from the system.',
      okLabel: 'Clear Matches',
      okColor: 'warning',
      okIcon: 'delete',
      onConfirm: () => {
        // Tombstone all matches instead of wiping (for cross-admin sync)
        MatchmakingApp.state.activeMatches.forEach((m) => {
          m.deletedAt = Date.now();
          m.updatedAt = Date.now();
        });
        MatchmakingApp.persist();

        notify({
          type: 'positive',
          message: 'All matches have been cleared',
        });
      },
    });
  };

  const clearQueue = () => {
    confirmWithClubId({
      title: 'Confirm Clear Queue',
      message: 'This will remove all players from the queue.',
      okLabel: 'Clear Queue',
      okColor: 'warning',
      okIcon: 'delete_outline',
      onConfirm: () => {
        // Tombstone all queue entries so deletions propagate across admins.
        // Keep the tombstoned entries in the array (do not wipe the array) —
        // otherwise a stale admin's live queue would resurrect on the next sync.
        const now = Date.now();
        MatchmakingApp.state.queues.forEach((q) => {
          q.deletedAt = now;
          q.updatedAt = now;
        });
        MatchmakingApp.persist();

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
    notify({
      type: 'positive',
      message: `Exported ${matches.length} match(es) to DUPR CSV`,
    });
  };

  const resetSessionData = () => {
    const resetAt = MatchmakingApp.state.completedMatchesResetAt ?? 0;
    const lastExported = MatchmakingApp.state.lastExportedAt ?? 0;
    const unexported = MatchmakingApp.state.completedMatches.filter(
      (m) => m.completedAt > resetAt && m.completedAt > lastExported,
    );

    const doReset = () => {
      const now = Date.now();

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

      notify({
        type: 'positive',
        message: 'Session reset complete',
      });
    };

    if (unexported.length > 0) {
      $q.dialog({
        title: 'Unexported Matches',
        message: `You have ${unexported.length} completed match(es) that have not been exported to DUPR.`,
        ok: {
          label: 'Export & Reset',
          color: 'positive',
          icon: 'download',
          noCaps: true,
        },
        cancel: {
          label: 'Reset Anyway',
          color: 'negative',
          flat: true,
          noCaps: true,
        },
        persistent: true,
      })
        .onOk(() => {
          exportDuprCsv();
          confirmWithClubId({
            title: 'Confirm Reset Session',
            message:
              'This will reset all player stats, clear all matches, and clear the queue. Players will be kept.',
            okLabel: 'Reset Session',
            okColor: 'negative',
            okIcon: 'restart_alt',
            onConfirm: doReset,
          });
        })
        .onCancel(() => {
          confirmWithClubId({
            title: 'Reset Without Export',
            message:
              'Unexported match data will be lost. This will reset all player stats, clear all matches, and clear the queue.',
            okLabel: 'Reset Anyway',
            okColor: 'negative',
            okIcon: 'restart_alt',
            onConfirm: doReset,
          });
        });
      return;
    }

    confirmWithClubId({
      title: 'Confirm Reset Session',
      message:
        'This will reset all player stats, clear all matches, and clear the queue. Players will be kept.',
      okLabel: 'Reset Session',
      okColor: 'negative',
      okIcon: 'restart_alt',
      onConfirm: doReset,
    });
  };

  const resetAllData = () => {
    confirmWithClubId({
      title: 'Reset Everything',
      message:
        'This will delete ALL data including players. This cannot be undone.',
      okLabel: 'Delete Everything',
      okColor: 'negative',
      okIcon: 'delete_forever',
      onConfirm: () => {
        MatchmakingApp.hardResetEverything();
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
