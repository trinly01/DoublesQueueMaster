import { type ComputedRef } from 'vue';
import { useQuasar } from 'quasar';
import type { QNotifyCreateOptions } from 'quasar';
import { MatchmakingApp } from 'src/services/matchmaking';
import type { Player } from 'src/services/matchmaking';
import { useNotify } from 'src/composables/useNotify';

type NotifyFn = (opts: QNotifyCreateOptions) => void;

export interface UsePlayerActionsContext {
  players: ComputedRef<(Player & { name: string })[]>;
}

export function usePlayerActions(context: UsePlayerActionsContext) {
  const { players } = context;
  const $q = useQuasar();
  const { notify: ctxNotify } = useNotify();
  const notify = ctxNotify as NotifyFn;

  const removePlayer = (username: string) => {
    $q.dialog({
      title: 'Remove Player',
      message: `Are you sure you want to remove "${username}"? This will delete their stats and remove them from the queue.`,
      cancel: { label: 'Cancel', color: 'grey', flat: true },
      ok: { label: 'Remove', color: 'negative', icon: 'delete' },
      persistent: true,
    }).onOk(() => {
      const player = MatchmakingApp.state.players[username];
      if (player) {
        player.deletedAt = Date.now();
        player.updatedAt = Date.now();
      }
      MatchmakingApp.removeFromQueue(username);
      MatchmakingApp.state.lastModified = Date.now();
      MatchmakingApp.persist();
      notify({
        type: 'info',
        message: `Player "${username}" removed`,
      });
    });
  };

  const removeFromQueue = (username: string) => {
    $q.dialog({
      title: 'Remove from Queue',
      message: `Remove "${username}" from the queue?`,
      cancel: { label: 'Cancel', color: 'grey', flat: true },
      ok: { label: 'Remove', color: 'warning', icon: 'remove_circle' },
      persistent: true,
    }).onOk(() => {
      MatchmakingApp.removeFromQueue(username);
      notify({
        type: 'info',
        message: `Player "${username}" removed from queue`,
      });
    });
  };

  const requeuePlayer = (username: string) => {
    const p = players.value.find((p) => p.username === username);
    if (!p) return;

    $q.dialog({
      title: 'Add to Queue',
      message: `Add "${p.firstName || p.username}" to the queue?`,
      cancel: { label: 'Cancel', color: 'grey' },
      ok: { label: 'Add', color: 'accent' },
      persistent: true,
    }).onOk(() => {
      const result = MatchmakingApp.checkInPlayer(p.username, p.level);

      if (result === 'already_in_match') {
        notify({
          type: 'warning',
          message: `Player "${username}" is already in a match`,
        });
        return;
      }

      if (result === 'already_in_queue') {
        notify({
          type: 'warning',
          message: `Player "${username}" is already in the queue`,
        });
        return;
      }

      notify({
        type: 'positive',
        message: `Player "${username}" added to queue`,
      });
    });
  };

  const addAllPlayersToQueue = () => {
    $q.dialog({
      title: 'Add All Players to Queue',
      message: `Add all ${players.value.length} players to the queue?`,
      cancel: {
        label: 'Cancel',
        color: 'grey',
        flat: true,
      },
      ok: {
        label: 'Add All',
        color: 'accent',
        icon: 'group_add',
      },
      persistent: true,
    }).onOk(() => {
      let addedCount = 0;
      let alreadyInQueueCount = 0;
      let alreadyInMatchCount = 0;

      players.value.forEach((p) => {
        const result = MatchmakingApp.checkInPlayer(p.username, p.level);
        if (result === 'added') addedCount++;
        else if (result === 'already_in_queue') alreadyInQueueCount++;
        else if (result === 'already_in_match') alreadyInMatchCount++;
      });

      if (addedCount > 0) {
        notify({
          type: 'positive',
          message: `Added ${addedCount} player${addedCount > 1 ? 's' : ''} to queue`,
        });
      }

      if (alreadyInQueueCount > 0) {
        notify({
          type: 'warning',
          message: `Skipped ${alreadyInQueueCount} player${alreadyInQueueCount > 1 ? 's' : ''} already in queue`,
          timeout: 3000,
        });
      }

      if (alreadyInMatchCount > 0) {
        notify({
          type: 'warning',
          message: `Skipped ${alreadyInMatchCount} player${alreadyInMatchCount > 1 ? 's' : ''} already in match`,
          timeout: 3000,
        });
      }
    });
  };

  return {
    removePlayer,
    removeFromQueue,
    requeuePlayer,
    addAllPlayersToQueue,
  };
}
