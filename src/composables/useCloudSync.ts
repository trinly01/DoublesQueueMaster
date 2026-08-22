import {
  ref,
  watch,
  onMounted,
  onUnmounted,
  type Ref,
  type ComputedRef,
} from 'vue';
import { readItems, updateItem } from '@likha-erp/likha-sdk';
import { likhaClient } from 'src/services/likhaClient';
import { MatchmakingApp, mergeAppState } from 'src/services/matchmaking';
import type { AppState } from 'src/services/matchmaking';
import { useNotify } from 'src/composables/useNotify';
import { useAuth } from 'src/composables/useAuth';
import type { Router } from 'vue-router';
import type { QNotifyCreateOptions } from 'quasar';

type NotifyFn = (opts: QNotifyCreateOptions) => void;
type HandleAuthErrorFn = (err: unknown, router: Router) => Promise<boolean>;

export interface CloudSyncContext {
  currentClubUUID: Ref<string>;
  currentClubId: Ref<string>;
  clubAdminIds: Ref<Set<string>>;
  clubModeratorIds: Ref<Set<string>>;
  currentUserId: Ref<string>;
  isOpenPlay: ComputedRef<boolean>;
  likhaUrl: Ref<string>;
  loadClubData: (clubId: string) => Promise<void>;
  refreshPlayerRatings: () => Promise<void>;
  router: Router;
  lastSyncedServerTimestamp: Ref<number>;
  saveLastSyncedTimestamp: (clubId: string, ts: number) => void;
}

export function useCloudSync(ctx: CloudSyncContext) {
  const {
    currentClubUUID,
    currentClubId,
    clubAdminIds,
    clubModeratorIds,
    currentUserId,
    isOpenPlay,
    likhaUrl,
    loadClubData,
    refreshPlayerRatings,
    router,
    lastSyncedServerTimestamp,
    saveLastSyncedTimestamp,
  } = ctx;
  const { notify: ctxNotify } = useNotify();
  const { handleAuthError: ctxHandleAuthError } = useAuth();
  const notify = ctxNotify as NotifyFn;
  const handleAuthError = ctxHandleAuthError as HandleAuthErrorFn;

  // Cloud sync state
  const isOnline = ref(navigator.onLine);
  const hasPendingCloudSync = ref(false);
  const syncAjaxBar = ref<{ start: () => void; stop: () => void } | null>(null);
  const dataFetchBar = ref<{ start: () => void; stop: () => void } | null>(
    null,
  );

  // Club switch guard: suppresses cloud sync while clubs are being switched
  // to prevent pushing reset defaults to the new club's server.
  const clubSwitchInProgress = ref(false);
  let clubSwitchTimeout: ReturnType<typeof setTimeout> | null = null;
  const setClubSwitchInProgress = (value: boolean) => {
    clubSwitchInProgress.value = value;
    if (clubSwitchTimeout) clearTimeout(clubSwitchTimeout);
    // Safety: auto-clear after 10s in case loadClubData never completes
    if (value) {
      clubSwitchTimeout = setTimeout(() => {
        clubSwitchInProgress.value = false;
      }, 10000);
    }
  };
  watch(hasPendingCloudSync, (pending) => {
    if (pending) syncAjaxBar.value?.start();
    else syncAjaxBar.value?.stop();
  });
  // Track when we went offline to detect sleep/long offline periods
  const offlineSince = ref<number | null>(null);

  // Sync mutex: prevent overlapping performCloudSync calls
  let syncInProgress = false;
  let syncRetryPending = false;

  // Debounce timer for batching rapid local mutations into one sync
  let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Immediate sync to cloud (read-before-write for multi-admin conflict detection)
  const performCloudSync = async (skipServerMerge = false) => {
    if (isOpenPlay.value) return;
    if (clubSwitchInProgress.value) {
      hasPendingCloudSync.value = false;
      return;
    }

    // Mutex: if another sync is in-flight, mark pending and bail.
    if (syncInProgress) {
      syncRetryPending = true;
      return;
    }
    syncInProgress = true;
    hasPendingCloudSync.value = true;

    if (!isOnline.value || !likhaUrl.value || !currentClubUUID.value) {
      syncInProgress = false;
      return;
    }

    try {
      // 1. Read current server state first (skip if we're coming back online with offline changes)
      let serverMatchmaking: AppState | undefined;
      let serverTimestamp = 0;
      if (!skipServerMerge) {
        const serverResult = await likhaClient.request(
          readItems('club', {
            filter: { id: { _eq: currentClubUUID.value } },
            fields: ['appState'],
          }),
        );

        const serverAppState = (
          serverResult?.[0] as unknown as {
            appState?: { matchmaking?: AppState };
          }
        )?.appState;
        serverMatchmaking = serverAppState?.matchmaking;
        serverTimestamp = serverMatchmaking?.lastModified ?? 0;
      }

      // 2. Only allow admins/moderators to write to the cloud
      if (
        !currentUserId.value ||
        (!clubAdminIds.value.has(currentUserId.value) &&
          !clubModeratorIds.value.has(currentUserId.value))
      ) {
        // Non-privileged users still advance their base version so they don't false-conflict later.
        lastSyncedServerTimestamp.value = serverTimestamp;
        hasPendingCloudSync.value = false;
        syncInProgress = false;
        console.log('Skipped cloud sync: not admin or moderator');
        return;
      }

      // 2b. Only sync if local state belongs to this club
      if (MatchmakingApp.state.clubId !== currentClubId.value) {
        hasPendingCloudSync.value = false;
        syncInProgress = false;
        console.log(
          'Skipped cloud sync: local state belongs to a different club',
        );
        return;
      }

      // 3. Optimistic concurrency: if the server moved since the version our local
      // state was based on, another privileged user wrote concurrently → smart-merge before pushing.
      if (
        serverMatchmaking &&
        serverTimestamp !== lastSyncedServerTimestamp.value
      ) {
        const merged = mergeAppState(MatchmakingApp.state, serverMatchmaking);
        Object.assign(MatchmakingApp.state, merged);
        // Extra safety: ensure no player appears in multiple matches
        MatchmakingApp.enforceOneMatchPerPlayer();
        notify({
          type: 'info',
          message: 'Merged concurrent changes from another session.',
          timeout: 3000,
        });
      }

      // 5. Stamp, push to cloud, persist locally, and advance our base version.
      const stamp = Date.now();
      MatchmakingApp.state.lastModified = stamp;
      MatchmakingApp.state.clubUUID = currentClubUUID.value;
      if (currentClubUUID.value) {
        MatchmakingApp.state.completedMatches.forEach((m) => {
          if (!m.club) m.club = currentClubUUID.value;
        });
      }

      console.log(
        '[cloudSync] pushing — queues:',
        MatchmakingApp.state.queues.filter((q) => !q.deletedAt).length,
        'matches:',
        MatchmakingApp.state.activeMatches.filter((m) => !m.deletedAt).length,
        'ts:',
        stamp,
      );

      const payload = {
        matchmaking: MatchmakingApp.state,
      };

      await likhaClient.request(
        updateItem('club', currentClubUUID.value, {
          appState: payload,
        }),
      );

      MatchmakingApp.persistSilently();
      lastSyncedServerTimestamp.value = stamp;
      if (currentClubId.value) {
        saveLastSyncedTimestamp(currentClubId.value, stamp);
      }
      hasPendingCloudSync.value = false;
      syncRetryPending = false;
      console.log('Successfully synced to cloud');
    } catch (err) {
      // Handle 401 Unauthorized errors
      if (await handleAuthError(err, router)) {
        syncInProgress = false;
        return;
      }
      console.error('Failed to sync to cloud:', err);
      hasPendingCloudSync.value = true;
    } finally {
      syncInProgress = false;
      // If another sync was requested while we were busy, run one follow-up.
      if (syncRetryPending) {
        syncRetryPending = false;
        performCloudSync();
      }
    }
  };

  const updateOnlineStatus = () => {
    const wasOffline = !isOnline.value;
    isOnline.value = navigator.onLine;

    // Track when we went offline
    if (!isOnline.value && wasOffline) {
      offlineSince.value = Date.now();
    }

    // If we just came back online and have pending sync, sync now with retry
    if (isOnline.value && wasOffline && hasPendingCloudSync.value) {
      const attemptSync = async (retries = 3, delay = 1000) => {
        try {
          // Check if we were offline for a long time (e.g., sleep)
          const offlineDuration = offlineSince.value
            ? Date.now() - offlineSince.value
            : 0;
          const wasSleeping = offlineDuration > 5 * 60 * 1000; // 5 minutes

          // When coming back online after sleep/offline, prioritize server state
          // to avoid overwriting newer changes from other devices (e.g., phone)
          await performCloudSync(false);
          // After successful sync, refresh ratings to pull the updated values from cloud
          void refreshPlayerRatings();

          if (wasSleeping) {
            notify({
              type: 'info',
              message: 'Back online. Synced with server data.',
              timeout: 3000,
            });
          }
        } catch {
          if (retries > 0) {
            setTimeout(() => attemptSync(retries - 1, delay * 2), delay);
          } else {
            notify({
              type: 'negative',
              message: 'Cloud sync failed after reconnect. Will retry.',
              timeout: 3000,
            });
          }
        }
      };
      attemptSync();
      notify({
        type: 'positive',
        message: 'Back online. Syncing to cloud...',
        timeout: 2000,
      });
    }

    // Re-establish live updates after a reconnect if the socket dropped, and
    // refresh ratings that may have changed while we were offline.
    // Skip refreshPlayerRatings if we have pending sync (offline changes to push)
    // to avoid stale DB ratings overwriting our local offline changes before they sync.
    if (isOnline.value && wasOffline) {
      offlineSince.value = null; // Reset offline tracking
      restartRealtime(); // Force clean reconnect
      // If we have pending sync, don't refresh ratings yet - let the sync complete first
      // Otherwise, refresh to get latest data from server
      if (!hasPendingCloudSync.value) void refreshPlayerRatings();
    }
  };

  // ---- Real-time sync (WebSocket subscription) ----
  // Pushes other privileged users' changes to this client instantly, then smart-merges them.
  let realtimeUnsub: (() => void) | null = null;
  let realtimeStarting = false;

  type ClubRealtimeMessage = {
    type?: string;
    event?: 'init' | 'create' | 'update' | 'delete';
    data?: Array<{ id?: string; appState?: { matchmaking?: AppState } }>;
  };

  const applyServerMatchmaking = (serverMatchmaking?: AppState) => {
    if (!serverMatchmaking) return;
    const incomingTs = serverMatchmaking.lastModified ?? 0;
    // Ignore the echo of our own last write.
    if (incomingTs === lastSyncedServerTimestamp.value) {
      console.log(
        '[applyServer] ignoring echo of our own write, ts:',
        incomingTs,
      );
      return;
    }

    const isCurrentUserPrivilegedForSync =
      currentUserId.value &&
      (clubAdminIds.value.has(currentUserId.value) ||
        clubModeratorIds.value.has(currentUserId.value));

    console.log(
      '[applyServer] incoming — queues:',
      serverMatchmaking.queues?.length,
      'matches:',
      serverMatchmaking.activeMatches?.filter((m) => !m.deletedAt).length,
      'ts:',
      incomingTs,
      'our last synced:',
      lastSyncedServerTimestamp.value,
      'isPrivileged:',
      isCurrentUserPrivilegedForSync,
    );

    if (isCurrentUserPrivilegedForSync) {
      // Privileged (admins/moderators): smart-merge so local offline edits are preserved
      const merged = mergeAppState(MatchmakingApp.state, serverMatchmaking);
      Object.assign(MatchmakingApp.state, merged);
      // Extra safety: ensure no player appears in multiple matches
      // and no court has multiple in-progress matches
      MatchmakingApp.enforceOneMatchPerPlayer();
      MatchmakingApp.enforceOneMatchPerCourt();
    } else {
      // Non-privileged: server is source of truth — direct overwrite, no merge
      if (serverMatchmaking.players) {
        MatchmakingApp.state.players = { ...serverMatchmaking.players };
      }
      if (serverMatchmaking.queues) {
        MatchmakingApp.state.queues = [...serverMatchmaking.queues];
      }
      if (serverMatchmaking.activeMatches) {
        MatchmakingApp.state.activeMatches = [
          ...serverMatchmaking.activeMatches,
        ];
      }
      if (serverMatchmaking.completedMatches) {
        MatchmakingApp.state.completedMatches = [
          ...serverMatchmaking.completedMatches,
        ];
      }
      // Overwrite settings — non-privileged users don't have local settings to preserve
      copyServerSettings(serverMatchmaking, SETTINGS_OVERWRITE_FIELDS, false);
      // Carry checkpoint timestamps
      MatchmakingApp.state.playersResetAt =
        serverMatchmaking.playersResetAt ?? 0;
      MatchmakingApp.state.queuesResetAt = serverMatchmaking.queuesResetAt ?? 0;
      MatchmakingApp.state.matchesResetAt =
        serverMatchmaking.matchesResetAt ?? 0;
      if (serverMatchmaking.settingsFieldTimestamps) {
        MatchmakingApp.state.settingsFieldTimestamps = {
          ...serverMatchmaking.settingsFieldTimestamps,
        };
      }
    }

    MatchmakingApp.persistSilently();
    lastSyncedServerTimestamp.value = incomingTs;
    if (currentClubId.value) {
      saveLastSyncedTimestamp(currentClubId.value, incomingTs);
    }

    console.log(
      '[applyServer] applied — queues:',
      MatchmakingApp.state.queues.filter((q) => !q.deletedAt).length,
      'matches:',
      MatchmakingApp.state.activeMatches.filter((m) => !m.deletedAt).length,
    );
  };

  const startRealtime = async () => {
    if (realtimeUnsub || realtimeStarting) return;
    if (!isOnline.value || !currentClubUUID.value) return;

    realtimeStarting = true;
    try {
      await likhaClient.connect();
      const { subscription, unsubscribe } = await likhaClient.subscribe(
        'club',
        {
          event: 'update',
          query: {
            filter: { id: { _eq: currentClubUUID.value } },
            fields: ['id', 'appState'],
          },
        },
      );

      realtimeUnsub = unsubscribe;

      void (async () => {
        try {
          for await (const message of subscription) {
            const msg = message as ClubRealtimeMessage;
            console.log('[realtime] received message:', msg);
            if (msg.type && msg.type !== 'subscription') {
              console.log(
                '[realtime] skipping non-subscription message, type:',
                msg.type,
              );
              continue;
            }
            applyServerMatchmaking(msg.data?.[0]?.appState?.matchmaking);
          }
        } catch (err) {
          console.warn('Realtime stream ended:', err);
        } finally {
          // Stream closed (drop or unsubscribe) → let polling take over and
          // allow a fresh subscribe on the next reconnect.
          realtimeUnsub = null;
        }
      })();

      console.log(
        'Realtime subscription active for club',
        currentClubUUID.value,
      );
    } catch (err) {
      console.warn(
        'Realtime subscribe failed; falling back to polling/manual refresh',
        err,
      );
    } finally {
      realtimeStarting = false;
    }
  };

  const stopRealtime = () => {
    if (realtimeUnsub) {
      try {
        realtimeUnsub();
      } catch {
        /* noop */
      }
      realtimeUnsub = null;
    }
  };

  let lastResumeSyncAt = 0;

  const restartRealtime = () => {
    if (!isOnline.value || !currentClubUUID.value) return;
    stopRealtime();
    void startRealtime();
  };

  const doResumeSync = async () => {
    // Throttle: ignore if we synced < 3s ago
    if (Date.now() - lastResumeSyncAt < 3000) return;
    lastResumeSyncAt = Date.now();
    if (isOnline.value && currentClubId.value) {
      // loadClubData reads server state and merges. For privileged users (admins/moderators), persist() arms
      // the debounced cloud sync (500ms) which handles the push — no need for
      // a separate performCloudSync() call here (that would do a second read).
      // Non-privileged users just get the direct overwrite via persistSilently().
      await loadClubData(currentClubId.value);
      void refreshPlayerRatings();
    }
    // Always reconnect realtime when app comes back to foreground.
    restartRealtime();
  };

  // Watch for matchmaking state changes and sync to cloud
  // Debounced wrapper: batch rapid mutations into a single sync attempt.
  const debouncedCloudSync = () => {
    if (clubSwitchInProgress.value) return;
    hasPendingCloudSync.value = true;
    if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(() => {
      performCloudSync();
    }, 500);
  };

  MatchmakingApp.onStateChange = debouncedCloudSync;

  // Sync-related event listeners (mounted/unmounted in composable)
  let ratingsRefreshInterval: ReturnType<typeof setInterval> | null = null;

  onMounted(() => {
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    // Player ratings live in directus_users (not in club.appState), so realtime
    // can't observe them. Poll the club.players M2M periodically to keep ratings fresh.
    ratingsRefreshInterval = setInterval(() => {
      if (isOnline.value && currentClubUUID.value) {
        void refreshPlayerRatings();
      }
    }, 60000);
  });

  onUnmounted(() => {
    window.removeEventListener('online', updateOnlineStatus);
    window.removeEventListener('offline', updateOnlineStatus);
    stopRealtime();
    if (ratingsRefreshInterval) {
      clearInterval(ratingsRefreshInterval);
      ratingsRefreshInterval = null;
    }
  });

  // Settings copy helper — moved from ClubPage.vue (Step 1.6)
  const SETTINGS_SEED_FIELDS = [
    'availableCourts',
    'autoAdvanceMatches',
    'queueReturnMethod',
    'autoSortQueue',
    'queuePriorityMode',
    'matchmakingMode',
    'sortBy',
    'matchType',
    'allStarSortDirection',
    'matchesFilterBy',
    'ttsEnabled',
  ] as const;
  const SETTINGS_OVERWRITE_FIELDS = [
    ...SETTINGS_SEED_FIELDS,
    'qrContinueScan',
    'scoreType',
    'teamSize',
  ] as const;

  const copyServerSettings = (
    server: AppState,
    fields: readonly string[],
    onlyIfUndefined: boolean,
  ) => {
    const local = MatchmakingApp.state as unknown as Record<string, unknown>;
    const srv = server as unknown as Record<string, unknown>;
    for (const field of fields) {
      if (srv[field] !== undefined) {
        if (!onlyIfUndefined || local[field] === undefined) {
          local[field] = srv[field];
        }
      }
    }
  };

  return {
    isOnline,
    hasPendingCloudSync,
    lastSyncedServerTimestamp,
    syncAjaxBar,
    dataFetchBar,
    clubSwitchInProgress,
    setClubSwitchInProgress,
    performCloudSync,
    startRealtime,
    restartRealtime,
    stopRealtime,
    updateOnlineStatus,
    doResumeSync,
  };
}
