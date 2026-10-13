import { type ComputedRef, ref } from 'vue';
import { useQuasar } from 'quasar';
import type { QNotifyCreateOptions } from 'quasar';
import { MatchmakingApp } from 'src/services/matchmaking';
import type { Player } from 'src/services/matchmaking';
import { PlayerProfile } from 'src/services/playerProfile';
import { useNotify } from 'src/composables/useNotify';

type NotifyFn = (opts: QNotifyCreateOptions) => (() => void) | void;

export interface UsePlayerActionsContext {
  players: ComputedRef<(Player & { name: string })[]>;
}

export function usePlayerActions(context: UsePlayerActionsContext) {
  const { players } = context;
  const $q = useQuasar();
  const { notify: ctxNotify } = useNotify();
  const notify = ctxNotify as NotifyFn;

  const logAction = (action: string, details: Record<string, unknown>) => {
    MatchmakingApp.addActionLog(
      action,
      PlayerProfile.state.firstName || PlayerProfile.state.username,
      PlayerProfile.state.id,
      details,
    );
  };

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
      MatchmakingApp.unlinkPlayer(username);
      MatchmakingApp.removeFromQueue(username);
      MatchmakingApp.state.lastModified = Date.now();
      MatchmakingApp.persist();
      logAction('remove_player', { player: username });
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
      // Explicit check-out breaks the duo — draft/manual tombstones elsewhere
      // keep it (the pair stays linked across matches and re-queue).
      MatchmakingApp.unlinkPlayer(username);
      MatchmakingApp.removeFromQueue(username);
      logAction('check_out', { player: username });
      notify({
        type: 'info',
        message: `Player "${username}" removed from queue`,
      });
    });
  };

  const toggleQueueLock = (username: string) => {
    const displayName =
      players.value.find((p) => p.username === username)?.firstName || username;

    if (MatchmakingApp.isQueueLocked(username)) {
      // Unlock: instant, no confirmation — reversible and harmless.
      if (MatchmakingApp.setQueueLock(username, false)) {
        logAction('unlock_player', { player: displayName });
        notify({
          type: 'positive',
          message: `"${displayName}" unlocked — back in auto-draft`,
        });
      }
      return;
    }

    $q.dialog({
      title: 'Lock Player',
      message: `Lock "${displayName}"? They keep their queue spot but Auto won't draft them.`,
      cancel: { label: 'Cancel', color: 'grey', flat: true },
      ok: { label: 'Lock', color: 'warning', icon: 'lock' },
      persistent: true,
    }).onOk(() => {
      if (MatchmakingApp.setQueueLock(username, true)) {
        logAction('lock_player', { player: displayName });
        notify({
          type: 'info',
          message: `"${displayName}" locked — skipped by auto-draft`,
        });
      }
    });
  };

  // --- Fixed-duo linking (tap-to-pair) ---
  const pendingLinkUsername = ref<string | null>(null);
  let linkModeDismiss: (() => void) | void | null = null;

  const displayNameOf = (username: string) =>
    players.value.find((p) => p.username === username)?.firstName || username;

  const cancelLinkMode = () => {
    pendingLinkUsername.value = null;
    linkModeDismiss?.();
    linkModeDismiss = null;
  };

  const armLinkMode = (username: string) => {
    pendingLinkUsername.value = username;
    linkModeDismiss = notify({
      type: 'info',
      icon: 'link',
      message: `Tap a partner to pair with "${displayNameOf(username)}"`,
      timeout: 0,
      actions: [
        {
          label: 'Cancel',
          color: 'white',
          handler: cancelLinkMode,
        },
      ],
    });
  };

  const togglePlayerLink = (username: string) => {
    // Tapping the source's button again cancels pairing mode.
    if (pendingLinkUsername.value === username) {
      cancelLinkMode();
      return;
    }

    const partner = MatchmakingApp.getLinkedPartner(username);
    if (!partner) {
      armLinkMode(username);
      return;
    }

    const a = displayNameOf(username);
    const b = displayNameOf(partner);
    $q.dialog({
      title: 'Unpair Duo',
      message: `Unpair "${a}" and "${b}"? They'll draft separately again.`,
      cancel: { label: 'Cancel', color: 'grey', flat: true },
      ok: { label: 'Unpair', color: 'warning', icon: 'link_off' },
      persistent: true,
    }).onOk(() => {
      if (MatchmakingApp.unlinkPlayer(username)) {
        logAction('unpair_players', { players: [a, b] });
        notify({
          type: 'info',
          message: `"${a}" and "${b}" unpaired`,
        });
      }
    });
  };

  /**
   * Row-tap handler while link-mode is armed. Returns true when the tap was
   * consumed by link-mode (callers should skip their normal click behavior).
   */
  const pickLinkPartner = (partnerUsername: string): boolean => {
    const source = pendingLinkUsername.value;
    if (!source) return false;

    if (partnerUsername === source) {
      cancelLinkMode(); // tapping the source row again cancels
      return true;
    }

    const sourceName = displayNameOf(source);
    const partnerName = displayNameOf(partnerUsername);

    const inQueue = MatchmakingApp.state.queues.some(
      (q) => !q.deletedAt && q.username === partnerUsername,
    );
    if (!inQueue) {
      notify({
        type: 'warning',
        message: `"${partnerName}" is not in the queue`,
      });
      return true;
    }
    const existingPartner = MatchmakingApp.getLinkedPartner(partnerUsername);
    if (existingPartner) {
      notify({
        type: 'warning',
        message: `"${partnerName}" is already paired with "${displayNameOf(existingPartner)}"`,
      });
      return true;
    }
    if (MatchmakingApp.isQueueLocked(partnerUsername)) {
      notify({
        type: 'warning',
        message: `"${partnerName}" is locked — unlock them first`,
      });
      return true;
    }

    $q.dialog({
      title: 'Pair Duo',
      message: `Pair "${sourceName}" with "${partnerName}"? They'll draft together this session.`,
      cancel: { label: 'Cancel', color: 'grey', flat: true },
      ok: { label: 'Pair', color: 'teal', icon: 'link' },
      persistent: true,
    })
      .onOk(() => {
        if (MatchmakingApp.setPlayerLink(source, partnerUsername)) {
          logAction('pair_players', { players: [sourceName, partnerName] });
          notify({
            type: 'positive',
            message: `"${sourceName}" paired with "${partnerName}"`,
          });
        }
        cancelLinkMode();
      })
      .onCancel(() => {
        cancelLinkMode();
      });
    return true;
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

      logAction('check_in', {
        player: p.firstName || p.username,
        source: 'requeue',
      });
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
        if (result === 'added') {
          addedCount++;
          logAction('check_in', {
            player: p.firstName || p.username,
            source: 'requeue',
          });
        } else if (result === 'already_in_queue') alreadyInQueueCount++;
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
    toggleQueueLock,
    requeuePlayer,
    addAllPlayersToQueue,
    pendingLinkUsername,
    togglePlayerLink,
    pickLinkPartner,
    cancelLinkMode,
  };
}
