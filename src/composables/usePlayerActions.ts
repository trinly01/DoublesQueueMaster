import { type ComputedRef, ref } from 'vue';
import { useQuasar } from 'quasar';
import type { QNotifyCreateOptions } from 'quasar';
import {
  MatchmakingApp,
  MAX_AVOIDS_PER_PLAYER,
} from 'src/services/matchmaking';
import type { Player } from 'src/services/matchmaking';
import { PlayerProfile } from 'src/services/playerProfile';
import { useNotify } from 'src/composables/useNotify';
import { useDupr } from 'src/composables/useDupr';

type NotifyFn = (opts: QNotifyCreateOptions) => (() => void) | void;

export interface UsePlayerActionsContext {
  players: ComputedRef<(Player & { name: string })[]>;
  /**
   * Pair-duo/avoid gate — admin role AND active Pro club subscription.
   * Optional so specs can omit it (defaults to allowed).
   */
  canUsePairAvoid?: ComputedRef<boolean>;
}

export function usePlayerActions(context: UsePlayerActionsContext) {
  const { players, canUsePairAvoid } = context;
  const $q = useQuasar();
  const { notify: ctxNotify } = useNotify();
  const notify = ctxNotify as NotifyFn;
  const Dupr = useDupr();

  /**
   * After a dupr_plus_required denial, re-pull the player's DUPR subscription
   * server-side — covers "just upgraded mid-session". Returns true when the
   * fresh pull says PREMIUM_L1; callers retry check-in once with
   * duprPlus: true.
   */
  const reverifyDuprPlus = async (duprId?: string | null): Promise<boolean> => {
    if (!duprId) return false;
    notify({ type: 'info', message: 'Verifying DUPR+ status…', timeout: 2500 });
    const res = await Dupr.refreshEntitlement(duprId);
    return res?.plus === true;
  };

  // Resolve the actor's name as the club sees it: the roster record carries
  // the member's display firstName even when the account profile itself has
  // blank name/username fields (SSO provisioning gap, email-only signups).
  const actorName = () =>
    players.value.find((p) => p.userId && p.userId === PlayerProfile.state.id)
      ?.firstName || PlayerProfile.displayName;

  const logAction = (action: string, details: Record<string, unknown>) => {
    MatchmakingApp.addActionLog(
      action,
      actorName(),
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
      MatchmakingApp.clearPlayerAvoids(username);
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
      // Explicit check-out breaks the duo and clears avoids — they persist
      // across matches and auto re-queue within the session, but check-out
      // ends the player's session participation.
      MatchmakingApp.unlinkPlayer(username);
      MatchmakingApp.clearPlayerAvoids(username);
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
        logAction('unlock_player', { player: displayName, username });
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
        logAction('lock_player', { player: displayName, username });
        notify({
          type: 'info',
          message: `"${displayName}" locked — skipped by auto-draft`,
        });
      }
    });
  };

  // Pair/avoid is an admin-only Pro feature — callers hide the UI, but the
  // composable hard-blocks too so nothing slips through another entry point.
  const pairAvoidBlocked = (): boolean =>
    canUsePairAvoid !== undefined && !canUsePairAvoid.value;

  const denyPairAvoid = () =>
    notify({
      type: 'warning',
      message: 'Pair duo & Avoid player need an admin with an active Pro plan',
      timeout: 4000,
    });

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
    cancelAvoidMode();
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
    if (pairAvoidBlocked()) {
      denyPairAvoid();
      return;
    }
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
    if (pairAvoidBlocked()) return false;
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

  // --- Avoid player (tap-mode) ---
  const pendingAvoidUsername = ref<string | null>(null);
  let avoidModeDismiss: (() => void) | void | null = null;

  const cancelAvoidMode = () => {
    pendingAvoidUsername.value = null;
    avoidModeDismiss?.();
    avoidModeDismiss = null;
  };

  const armAvoidMode = (username: string) => {
    cancelLinkMode();
    pendingAvoidUsername.value = username;
    avoidModeDismiss = notify({
      type: 'info',
      icon: 'person_off',
      message: `Tap a player that "${displayNameOf(username)}" should avoid`,
      timeout: 0,
      actions: [
        {
          label: 'Cancel',
          color: 'white',
          handler: cancelAvoidMode,
        },
      ],
    });
  };

  /** Card action button: arm (or cancel) avoid tap-mode to ADD an avoid. */
  const togglePlayerAvoid = (username: string) => {
    if (pairAvoidBlocked()) {
      denyPairAvoid();
      return;
    }
    if (pendingAvoidUsername.value === username) {
      cancelAvoidMode();
      return;
    }
    armAvoidMode(username);
  };

  /** Badge tap: manage this player's existing avoids (checkbox remove list). */
  const managePlayerAvoids = (username: string) => {
    if (pairAvoidBlocked()) {
      denyPairAvoid();
      return;
    }
    const entries = Object.entries(MatchmakingApp.getPlayerAvoids(username));
    if (entries.length === 0) {
      armAvoidMode(username);
      return;
    }

    $q.dialog({
      title: `"${displayNameOf(username)}" avoids…`,
      message: 'Check players to remove the avoid:',
      options: {
        type: 'checkbox',
        model: [],
        items: entries.map(([target]) => ({
          label: displayNameOf(target),
          value: target,
          color: 'negative',
        })),
      },
      cancel: { label: 'Close', color: 'grey', flat: true },
      ok: { label: 'Remove', color: 'negative', icon: 'delete' },
      persistent: true,
    }).onOk((selected: string[]) => {
      for (const target of selected ?? []) {
        MatchmakingApp.removePlayerAvoid(username, target);
        logAction('remove_avoid', {
          player: displayNameOf(username),
          target: displayNameOf(target),
        });
        notify({
          type: 'info',
          message: `"${displayNameOf(username)}" no longer avoids "${displayNameOf(target)}"`,
        });
      }
    });
  };

  /**
   * Row-tap handler while avoid-mode is armed. Returns true when the tap was
   * consumed by avoid-mode (callers should skip their normal click behavior).
   */
  const pickAvoidTarget = (targetUsername: string): boolean => {
    if (pairAvoidBlocked()) return false;
    const source = pendingAvoidUsername.value;
    if (!source) return false;

    if (targetUsername === source) {
      cancelAvoidMode(); // tapping the source row again cancels
      return true;
    }

    const sourceName = displayNameOf(source);
    const targetName = displayNameOf(targetUsername);

    if (MatchmakingApp.getLinkedPartner(source) === targetUsername) {
      notify({
        type: 'warning',
        message: `"${sourceName}" is paired with "${targetName}" — unpair first`,
      });
      return true;
    }

    const existing =
      MatchmakingApp.state.players[source]?.avoids?.[targetUsername];
    const reverse =
      MatchmakingApp.state.players[targetUsername]?.avoids?.[source];

    // Outgoing cap — a player may only hold MAX_AVOIDS_PER_PLAYER avoids.
    // Re-selecting the existing target still opens the manage dialog.
    if (!existing) {
      const current = Object.keys(MatchmakingApp.getPlayerAvoids(source));
      if (current.length >= MAX_AVOIDS_PER_PLAYER) {
        notify({
          type: 'warning',
          icon: 'person_off',
          message:
            `"${sourceName}" already avoids "${displayNameOf(current[0])}" — ` +
            `a player can only avoid ${MAX_AVOIDS_PER_PLAYER === 1 ? 'one player' : `${MAX_AVOIDS_PER_PLAYER} players`}. Remove it first.`,
        });
        cancelAvoidMode();
        return true;
      }
    }

    // Dynamic import keeps the .vue component out of the composable graph —
    // vitest has no vue plugin for import analysis.
    void import('src/components/club/AvoidPlayerDialog.vue').then(
      ({ default: AvoidPlayerDialog }) => {
        $q.dialog({
          component: AvoidPlayerDialog,
          componentProps: {
            sourceName,
            targetName,
            existingAvoid: !!existing,
            existingBothWays: !!existing && !!reverse,
          },
        })
          .onOk((payload: { bothWays?: boolean; remove?: boolean }) => {
            if (payload?.remove) {
              MatchmakingApp.removePlayerAvoid(source, targetUsername);
              logAction('remove_avoid', {
                player: sourceName,
                target: targetName,
              });
              notify({
                type: 'info',
                message: `"${sourceName}" no longer avoids "${targetName}"`,
              });
            } else {
              if (
                MatchmakingApp.setPlayerAvoid(
                  source,
                  targetUsername,
                  payload?.bothWays ?? false,
                )
              ) {
                logAction('set_avoid', {
                  player: sourceName,
                  target: targetName,
                  bothWays: payload?.bothWays,
                });
                notify({
                  type: 'positive',
                  message: `"${sourceName}" prefers to avoid "${targetName}"`,
                });
              } else {
                notify({
                  type: 'warning',
                  icon: 'person_off',
                  message: `Couldn't set the avoid — limit reached or "${targetName}" already has too many avoid restrictions`,
                });
              }
            }
            cancelAvoidMode();
          })
          .onDismiss(cancelAvoidMode);
      },
    );
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
    }).onOk(async () => {
      let result = MatchmakingApp.checkInPlayer(p.username, p.level);

      // Stale-entitlement recovery: reverify live, then retry once.
      if (
        result === 'dupr_plus_required' &&
        (await reverifyDuprPlus(p.duprId))
      ) {
        result = MatchmakingApp.checkInPlayer(p.username, p.level, {
          duprId: p.duprId,
          duprPlus: true,
        });
      }

      if (result === 'dupr_required') {
        notify({
          type: 'warning',
          message: `"${p.firstName || p.username}" can't join — DUPR-only session, link DUPR to your account`,
          timeout: 5000,
        });
        return;
      }

      if (result === 'dupr_plus_required') {
        notify({
          type: 'warning',
          message: `"${p.firstName || p.username}" can't join — this session requires DUPR+`,
          timeout: 5000,
        });
        return;
      }

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
    }).onOk(async () => {
      let addedCount = 0;
      let alreadyInQueueCount = 0;
      let alreadyInMatchCount = 0;
      let duprBlockedCount = 0;
      const duprDenied: Player[] = [];

      for (const p of players.value) {
        const result = MatchmakingApp.checkInPlayer(p.username, p.level);
        if (result === 'added') {
          addedCount++;
          logAction('check_in', {
            player: p.firstName || p.username,
            source: 'requeue',
          });
        } else if (result === 'already_in_queue') alreadyInQueueCount++;
        else if (result === 'already_in_match') alreadyInMatchCount++;
        else if (result === 'dupr_required') duprBlockedCount++;
        else if (result === 'dupr_plus_required') duprDenied.push(p);
      }

      // Stale-entitlement recovery: reverify every denied player who has a
      // linked DUPR account in parallel (one flow call each), then retry the
      // ones whose fresh pull shows PREMIUM_L1.
      const reverified = new Set<string>();
      const withDupr = duprDenied.filter((p) => p.duprId);
      let recoveredCount = 0;
      if (withDupr.length) {
        notify({
          type: 'info',
          message: 'Verifying DUPR+ status…',
          timeout: 2500,
        });
        const results = await Promise.all(
          withDupr.map((p) => Dupr.refreshEntitlement(p.duprId)),
        );
        withDupr.forEach((p, i) => {
          if (results[i]?.plus) reverified.add(p.username);
        });
        for (const p of duprDenied) {
          if (!reverified.has(p.username)) continue;
          const retry = MatchmakingApp.checkInPlayer(p.username, p.level, {
            duprId: p.duprId,
            duprPlus: true,
          });
          if (retry === 'added') {
            addedCount++;
            recoveredCount++;
            logAction('check_in', {
              player: p.firstName || p.username,
              source: 'requeue',
            });
          }
        }
      }
      const duprPlusBlockedCount = duprDenied.length - recoveredCount;

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

      if (duprBlockedCount > 0) {
        notify({
          type: 'warning',
          message: `${duprBlockedCount} player${duprBlockedCount > 1 ? 's' : ''} skipped — DUPR-only session, link DUPR to your account`,
          timeout: 5000,
        });
      }

      if (duprPlusBlockedCount > 0) {
        notify({
          type: 'warning',
          message: `${duprPlusBlockedCount} player${duprPlusBlockedCount > 1 ? 's' : ''} skipped — this session requires DUPR+`,
          timeout: 5000,
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
    pendingAvoidUsername,
    togglePlayerAvoid,
    managePlayerAvoids,
    pickAvoidTarget,
    cancelAvoidMode,
  };
}
