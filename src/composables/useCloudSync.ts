import {
  ref,
  watch,
  onMounted,
  onUnmounted,
  type Ref,
  type ComputedRef,
} from 'vue';
import { readItems, updateItems } from '@likha-erp/likha-sdk';
import { likhaClient } from 'src/services/likhaClient';
import {
  MatchmakingApp,
  mergeAppState,
  enforceCompletedCaps,
} from 'src/services/matchmaking';
import type { AppState } from 'src/services/matchmaking';
import { useNotify } from 'src/composables/useNotify';
import { useAuth, registerBeforeLogoutHook } from 'src/composables/useAuth';
import {
  isClubPrivilegeMetaVerified,
  type ClubPrivilegeMeta,
} from 'src/services/clubMembersMapper';
import {
  shouldUseLightweightRead,
  shouldSkipFullRead,
  parseLightweightTimestamp,
  applyMergedState,
  collectionEqual,
  detectServerResetAdvantage,
  applyServerResetAdvantage,
} from 'src/services/cloudSyncHelpers';
import { perfMeasure, observeLongTasks } from 'src/utils/perfTelemetry';
import type { Router } from 'vue-router';
import { LocalStorage, type QNotifyCreateOptions } from 'quasar';

type NotifyFn = (opts: QNotifyCreateOptions) => void;
type HandleAuthErrorFn = (err: unknown, router: Router) => Promise<boolean>;

// Async twin of perfTelemetry.perfMeasure — perfMeasure only spans
// synchronous work, so network awaits get the same mark/measure treatment
// here. No-ops when performance.mark is unavailable (tests/SSR).
const perfMeasureAsync = async <T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T> => {
  if (
    typeof performance === 'undefined' ||
    typeof performance.mark !== 'function'
  ) {
    return fn();
  }
  const start = `perf-${name}-start`;
  const end = `perf-${name}-end`;
  try {
    performance.mark(start);
    const result = await fn();
    performance.mark(end);
    performance.measure(`perf-${name}`, start, end);
    return result;
  } catch (err) {
    try {
      performance.mark(end);
      performance.measure(`perf-${name}`, start, end);
    } catch {
      /* ignore */
    }
    throw err;
  }
};

export interface CloudSyncContext {
  currentClubUUID: Ref<string>;
  currentClubId: Ref<string>;
  clubAdminIds: Ref<Set<string>>;
  clubModeratorIds: Ref<Set<string>>;
  currentUserId: Ref<string>;
  isOpenPlay: ComputedRef<boolean>;
  likhaUrl: Ref<string>;
  // Returns whether the server payload (incl. member list) was applied —
  // callers may ignore it.
  loadClubData: (clubId: string) => Promise<unknown>;
  refreshPlayerRatings: () => Promise<void>;
  router: Router;
  lastSyncedServerTimestamp: Ref<number>;
  saveLastSyncedTimestamp: (clubId: string, ts: number) => void;
}

export function useCloudSync(ctx: CloudSyncContext) {
  // PR-A instrumentation: longtask observer for the jank investigation.
  // Idempotent — safe across composable instances.
  observeLongTasks();
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
    if (pending) {
      syncAjaxBar.value?.start();
      // Durable intent: remember which club owes a push so a club switch,
      // reload, or failed push can't silently lose it (Phase 3 #15).
      markPendingSync(currentClubId.value);
    } else {
      syncAjaxBar.value?.stop();
    }
  });
  // Track when we went offline to detect sleep/long offline periods
  const offlineSince = ref<number | null>(null);

  // Sync mutex: prevent overlapping performCloudSync calls
  let syncInProgress = false;
  let syncRetryPending = false;

  // Debounce timer for batching rapid local mutations into one sync
  let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Set when the most recent push attempt failed. While true, the pending
  // flag means "push failed, awaiting retry" rather than "push armed" — the
  // staleness poll is allowed to PULL server state in that case (pending
  // blocks push-dedup, not pull).
  let pushFailed = false;

  // ---- Durable per-club pending-sync marker (RESET_DECISION Phase 3 #15) ----
  // hasPendingCloudSync is session state — a push dropped by the club-switch
  // guard (or a failed push before reload) loses the write club-wide if the
  // club is never revisited in a state that re-arms it. Persisting a dirty
  // marker per club lets the mount/switch-in path re-arm the push.
  const pendingSyncKey = (clubId: string) => `pending_sync_${clubId}`;
  const markPendingSync = (clubId: string) => {
    if (clubId) LocalStorage.set(pendingSyncKey(clubId), Date.now());
  };
  const clearPendingSync = (clubId: string) => {
    if (clubId) LocalStorage.remove(pendingSyncKey(clubId));
  };
  const hasPendingSyncMarker = (clubId: string): boolean =>
    !!clubId && LocalStorage.getItem(pendingSyncKey(clubId)) != null;

  // Smart-merge wrapper: runs reset-advantage detection first; when the
  // server carries a newer reset checkpoint for a collection, that
  // collection is adopted wholesale from the server instead of LWW-merged
  // (contract §2). Unflagged collections/settings stay on mergeAppState.
  const RESET_DISCARDED_MESSAGE =
    'Club data was reset — unsynced changes discarded';
  const mergeWithResetAdvantage = (
    local: AppState,
    server: AppState,
  ): AppState => {
    const advantage = detectServerResetAdvantage(local, server);
    const flagged =
      advantage.players ||
      advantage.queues ||
      advantage.matches ||
      advantage.completedMatches ||
      advantage.actionLogs ||
      advantage.stats;
    if (!flagged) {
      return perfMeasure('cloudsync.merge', () =>
        mergeAppState(local, server),
      );
    }
    const merged = perfMeasure('cloudsync.merge', () => {
      const m = mergeAppState(local, server);
      applyServerResetAdvantage(m, server, advantage);
      return m;
    });
    notify({
      type: 'info',
      message: RESET_DISCARDED_MESSAGE,
      timeout: 4000,
    });
    return merged;
  };

  // Realtime subscription handle — declared early so performCloudSync can
  // check isRealtimeActive() via closure. Assigned in startRealtime().
  let realtimeUnsub: (() => void) | null = null;
  const isRealtimeActive = () => realtimeUnsub !== null && isOnline.value;

  // Timestamp-only read — cheap probe for whether the server state moved.
  const readServerTimestamp = async (): Promise<number> => {
    const lightResult = await likhaClient.request(
      readItems('club', {
        filter: { id: { _eq: currentClubUUID.value } },
        fields: [
          'json(appState, matchmaking.lastModified)',
        ] as unknown as string[],
      }),
    );
    return parseLightweightTimestamp(lightResult);
  };

  const readServerMatchmaking = async (): Promise<AppState | undefined> => {
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
    return serverAppState?.matchmaking;
  };

  // Pre-write verify + CAS probe result. `lastModified` is the moved-check
  // timestamp; `undefined` means the json() alias couldn't vouch for it
  // (field absent/unsupported) → caller must fall back to the full blob
  // read. `matchmaking` is only populated by the full-probe fallback.
  type ClubRowProbe = {
    dateUpdated?: string;
    lastModified?: number;
    matchmaking?: AppState;
  };

  // Slim probe (PR-B B2): one read returning the row's `date_updated`
  // (the compare-and-swap token for the conditional PATCH below) plus the
  // matchmaking lastModified via the json() field function — NOT the full
  // appState blob. The blob is only fetched when the timestamp says the
  // server moved (or can't be trusted), removing 1-2 full-blob reads per
  // push attempt on the common no-conflict path.
  const readServerClubRow = async (): Promise<ClubRowProbe | undefined> => {
    const rows = await likhaClient.request(
      readItems('club', {
        filter: { id: { _eq: currentClubUUID.value } },
        fields: [
          'date_updated',
          'json(appState,matchmaking.lastModified)',
        ] as unknown as string[],
      }),
    );
    const row = rows?.[0] as
      | {
          date_updated?: string;
          appState_matchmaking_lastModified_json?: number | null;
        }
      | undefined;
    if (!row) return undefined;
    const rawTs = row.appState_matchmaking_lastModified_json;
    return {
      dateUpdated: row.date_updated,
      // Alias key absent → json() path unusable → undefined forces the
      // full blob read below (pre-slim verify behavior). A present null
      // legitimately means "no lastModified" → 0.
      lastModified:
        rawTs === undefined ? undefined : Number(rawTs ?? 0),
    };
  };

  // Full probe — the pre-slim shape (appState + date_updated). Used only
  // when the slim probe's request itself fails (json() rejected outright),
  // so the CAS token AND the merge blob arrive in one read.
  const readServerClubRowFull = async (): Promise<
    ClubRowProbe | undefined
  > => {
    const rows = await likhaClient.request(
      readItems('club', {
        filter: { id: { _eq: currentClubUUID.value } },
        fields: ['appState', 'date_updated'],
      }),
    );
    const row = rows?.[0] as
      | {
          appState?: { matchmaking?: AppState };
          date_updated?: string;
        }
      | undefined;
    if (!row) return undefined;
    return {
      dateUpdated: row.date_updated,
      lastModified: row.appState?.matchmaking?.lastModified,
      matchmaking: row.appState?.matchmaking,
    };
  };

  // Immediate sync to cloud (read-before-write for multi-admin conflict detection)
  const performCloudSync = async (skipServerMerge = false) => {
    if (isOpenPlay.value) return;
    if (clubSwitchInProgress.value) {
      // Drop this attempt, but the durable per-club marker written when the
      // pending flag armed keeps the intent alive for the next visit.
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
        if (shouldUseLightweightRead(isRealtimeActive(), isOnline.value)) {
          // Lightweight read: just check lastModified timestamp via json() function.
          // When realtime is active, it keeps lastSyncedServerTimestamp current,
          // so a timestamp-only check is sufficient to detect concurrent writes.
          try {
            serverTimestamp = await perfMeasureAsync(
              'cloudsync.read-ts',
              () => readServerTimestamp(),
            );

            // If timestamp matches, skip full read — realtime kept us current.
            if (
              !shouldSkipFullRead(
                serverTimestamp,
                lastSyncedServerTimestamp.value,
              )
            ) {
              // Timestamp moved — do full read to get changes for merging.
              serverMatchmaking = await perfMeasureAsync(
                'cloudsync.read-full',
                () => readServerMatchmaking(),
              );
              serverTimestamp = serverMatchmaking?.lastModified ?? 0;
            }
          } catch {
            // json() failed — fall back to full read (safe).
            serverMatchmaking = await perfMeasureAsync(
              'cloudsync.read-full',
              () => readServerMatchmaking(),
            );
            serverTimestamp = serverMatchmaking?.lastModified ?? 0;
          }
        } else {
          // Realtime not active — do full read (existing behavior).
          serverMatchmaking = await perfMeasureAsync(
            'cloudsync.read-full',
            () => readServerMatchmaking(),
          );
          serverTimestamp = serverMatchmaking?.lastModified ?? 0;
        }
      }

      // 2. Only allow admins/moderators to write to the cloud.
      // Privilege fail-closed (reset-detection contract §4): clubAdminIds /
      // clubModeratorIds may be seeded from the club_meta_* cache and drive
      // UI only — they never authorize a push. Authorization requires the
      // meta entry to pass isClubPrivilegeMetaVerified — `verified: true`
      // written only after a fresh admins/moderators M2M fetch, inside
      // CLUB_PRIVILEGE_META_TTL_MS, with a non-future timestamp — AND the
      // user present in that verified id snapshot. Legacy, expired, or
      // future-dated entries → no push (a stale verified flag alone must
      // not authorize pushes indefinitely once fetches stop).
      const privilegeMeta = LocalStorage.getItem(
        `club_meta_${currentClubId.value}`,
      ) as ClubPrivilegeMeta | null;
      const verifiedIds = isClubPrivilegeMetaVerified(privilegeMeta)
        ? [
            ...(privilegeMeta?.adminIds ?? []),
            ...(privilegeMeta?.moderatorIds ?? []),
          ]
        : [];
      const isVerifiedPrivileged =
        !!currentUserId.value && verifiedIds.includes(currentUserId.value);
      if (!isVerifiedPrivileged) {
        // Non-privileged (or privilege-unverified) users still advance their
        // base version so they don't false-conflict later.
        lastSyncedServerTimestamp.value = serverTimestamp;
        hasPendingCloudSync.value = false;
        pushFailed = false;
        syncInProgress = false;
        // Durable marker: keep it only while the user still looks privileged
        // in the UI-seeded refs — their role may simply be unverified and a
        // later fresh fetch can confirm it. Plain non-privileged users can
        // never push; their local edits resolve via server-wins on load.
        const uiPrivileged =
          !!currentUserId.value &&
          (clubAdminIds.value.has(currentUserId.value) ||
            clubModeratorIds.value.has(currentUserId.value));
        if (!uiPrivileged) clearPendingSync(currentClubId.value);
        return;
      }

      // 2b. Only sync if local state belongs to this club
      if (MatchmakingApp.state.clubId !== currentClubId.value) {
        hasPendingCloudSync.value = false;
        pushFailed = false;
        syncInProgress = false;
        return;
      }

      // 3. Optimistic concurrency: if the server moved since the version our local
      // state was based on, another privileged user wrote concurrently → smart-merge before pushing.
      if (
        serverMatchmaking &&
        serverTimestamp !== lastSyncedServerTimestamp.value
      ) {
        // mergeWithResetAdvantage: wholesale-adopts any collection whose
        // server reset checkpoint beats ours before the LWW merge result is
        // applied (reset-detection contract §2, hook point b).
        const merged = mergeWithResetAdvantage(
          MatchmakingApp.state,
          serverMatchmaking,
        );
        // Assign only keys whose content actually changed — identical merges
        // keep their references and don't invalidate the page's computeds.
        perfMeasure('cloudsync.apply-state', () =>
          applyMergedState(MatchmakingApp.state, merged),
        );
        // Extra safety: ensure no player appears in multiple matches
        MatchmakingApp.enforceOneMatchPerPlayer();
        notify({
          type: 'info',
          message: 'Merged concurrent changes from another session.',
          timeout: 3000,
        });
      }

      // 4. Pre-write verify + CAS push. Directus has no native OCC, but a
      // PATCH /items/club whose body carries
      //   { query: { filter: { id: {_eq}, date_updated: {_eq: <token>} } },
      //     data: { appState } }
      // (what updateItems emits for a Query argument) is an atomic
      // conditional UPDATE: the write lands only while the row still
      // matches, so a concurrent write in the read→PATCH gap yields an
      // empty result instead of a silent clobber. On conflict we re-fetch,
      // reset-aware merge, and retry exactly once — bounded, no loop.
      const MAX_CAS_ATTEMPTS = 2;
      let casConflict = false;
      for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
        // Fresh probe: date_updated CAS token + json() lastModified moved-
        // check. The full appState blob is fetched ONLY when the timestamp
        // demands it (moved / unverifiable / CAS retry). No token → abort:
        // an unconditional PATCH would reopen the clobber window this
        // guard exists to close, and the outer catch arms pushFailed/
        // pending for a later retry.
        let probe: ClubRowProbe | undefined;
        try {
          probe = await perfMeasureAsync('cloudsync.cas-probe', () =>
            readServerClubRow(),
          );
        } catch {
          // json() alias rejected outright (older Directus / field-
          // function error) — fall back to the full probe shape so both
          // the CAS token and the merge blob arrive in one read.
          probe = await perfMeasureAsync('cloudsync.cas-probe-full', () =>
            readServerClubRowFull(),
          );
        }
        const casToken = probe?.dateUpdated;
        if (!casToken) {
          throw new Error(
            '[cloudSync] pre-write verify read returned no club row',
          );
        }
        const observedTimestamp =
          serverTimestamp || lastSyncedServerTimestamp.value;
        // Blob required when: CAS retry (merge is forced — the conflicting
        // write may carry a reset whose checkpoint compare alone wouldn't
        // surface), the slim probe couldn't produce a timestamp (json()
        // field absent → fallback to the pre-slim full read), or the
        // server timestamp moved since our observed version.
        const probeTs = probe?.lastModified;
        const blobRequired =
          attempt > 0 ||
          probeTs === undefined ||
          probeTs !== observedTimestamp;
        let fresh = probe?.matchmaking;
        if (blobRequired && fresh === undefined) {
          fresh = await perfMeasureAsync('cloudsync.cas-blob', () =>
            readServerMatchmaking(),
          );
        }
        // The blob's own stamp is the freshest moved-check signal — prefer
        // it over the probe's json() value (the blob read is the later
        // request and may reflect a write that landed in between).
        const verifyTimestamp = fresh?.lastModified ?? probeTs ?? 0;
        if (fresh && (attempt > 0 || verifyTimestamp !== observedTimestamp)) {
          // Same reset-advantage adoption as the pre-push merge — the
          // server may have moved precisely because another admin reset
          // (contract §2, hook point c).
          perfMeasure('cloudsync.apply-state', () =>
            applyMergedState(
              MatchmakingApp.state,
              mergeWithResetAdvantage(MatchmakingApp.state, fresh),
            ),
          );
          MatchmakingApp.enforceOneMatchPerPlayer();
        }

        // 5. Stamp, push to cloud, persist locally, and advance our base
        // version. Re-stamped per attempt so a post-conflict merge retry
        // carries a fresh lastModified.
        const stamp = Date.now();
        MatchmakingApp.state.lastModified = stamp;
        MatchmakingApp.state.clubUUID = currentClubUUID.value;
        if (currentClubUUID.value) {
          MatchmakingApp.state.completedMatches.forEach((m) => {
            if (!m.club) m.club = currentClubUUID.value;
          });
        }

        const payload = {
          matchmaking: MatchmakingApp.state,
        };

        const casResult: unknown = await perfMeasureAsync(
          'cloudsync.push',
          () =>
            likhaClient.request(
              updateItems(
                'club',
                {
                  filter: {
                    id: { _eq: currentClubUUID.value },
                    date_updated: { _eq: casToken },
                  },
                },
                {
                  appState: payload,
                },
              ),
            ),
        );

        if (Array.isArray(casResult) && casResult.length === 0) {
          // CAS conflict: the row's date_updated moved between our probe
          // and the PATCH — someone else wrote first. Loop re-probes,
          // merges their state in, and retries with the fresh token.
          casConflict = true;
          console.warn(
            '[cloudSync] CAS conflict — server row changed mid-push, re-merging and retrying once',
          );
          continue;
        }
        casConflict = false;

        perfMeasure('cloudsync.persist', () =>
          MatchmakingApp.persistSilently(),
        );
        lastSyncedServerTimestamp.value = stamp;
        if (currentClubId.value) {
          saveLastSyncedTimestamp(currentClubId.value, stamp);
        }
        hasPendingCloudSync.value = false;
        pushFailed = false;
        clearPendingSync(currentClubId.value);
        syncRetryPending = false;
        break;
      }

      if (casConflict) {
        // Bounded retry exhausted — leave pending + the durable marker
        // armed; the debounce/rearm/poll machinery retries on the next
        // trigger rather than spinning here.
        throw new Error(
          '[cloudSync] CAS conflict persisted after bounded retry',
        );
      }
    } catch (err) {
      // Handle 401 Unauthorized errors
      if (await handleAuthError(err, router)) {
        syncInProgress = false;
        return;
      }
      console.error('Failed to sync to cloud:', err);
      hasPendingCloudSync.value = true;
      // Durable intent survives the failure — the per-club marker re-arms
      // the push on the next mount/switch-in even if this session ends.
      pushFailed = true;
      markPendingSync(currentClubId.value);
    } finally {
      syncInProgress = false;
      // If another sync was requested while we were busy, run one follow-up.
      if (syncRetryPending) {
        syncRetryPending = false;
        performCloudSync();
      }
    }
  };

  // Pre-logout flush (RESET_DECISION Phase 3 #16): useAuth.logout() drains
  // registered hooks BEFORE credentials are wiped, so a pending push still
  // has a valid token — otherwise the debounce/pagehide flush would fire
  // post-wipe, 401, and drop e.g. a just-issued reset. Bounded to 5s by
  // useAuth's flushBeforeLogout; performCloudSync's own gates (online,
  // verified privilege, club match, reset-aware merge, CAS) keep it safe.
  const unregisterBeforeLogout = registerBeforeLogoutHook(async () => {
    if (syncDebounceTimer) {
      clearTimeout(syncDebounceTimer);
      syncDebounceTimer = null;
    }
    if (
      !hasPendingCloudSync.value &&
      !hasPendingSyncMarker(currentClubId.value)
    ) {
      return;
    }
    await performCloudSync();
  });

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
  // realtimeUnsub is declared earlier (near performCloudSync) so the closure can check isRealtimeActive().
  let realtimeStarting = false;

  type ClubRealtimeMessage = {
    type?: string;
    event?: 'init' | 'create' | 'update' | 'delete';
    data?:
      | Array<{ id?: string; appState?: { matchmaking?: AppState } }>
      | { id?: string; appState?: { matchmaking?: AppState } };
  };

  // ---- Realtime role-field watch (contract §4 freshness) ----------------
  // The subscription now carries the admins/moderators M2M user ids. When
  // they change, the verified privilege snapshot cached in club_meta_* is
  // stale: a demoted admin's entry would keep authorizing pushes until the
  // next fresh fetch. We invalidate `verified` (fail-closed — pushes stop)
  // and run the existing loadClubData refresh, which re-fetches the M2M
  // and rewrites the entry with verified:true + a fresh TTL timestamp.
  let lastRoleSnapshot: { uuid: string; key: string } | null = null;

  const extractRoleIds = (rel: unknown): string[] => {
    if (!Array.isArray(rel)) return [];
    const ids = rel
      .map((entry) => {
        const user = (
          entry as {
            directus_users_id?: { id?: unknown } | string | null;
          } | null
        )?.directus_users_id;
        if (typeof user === 'string') return user;
        const id = (user as { id?: unknown } | null | undefined)?.id;
        return typeof id === 'string' ? id : undefined;
      })
      .filter((id): id is string => typeof id === 'string');
    return ids.sort();
  };

  const handleRealtimeRoleFields = (item: unknown) => {
    const row = item as {
      admins?: unknown;
      moderators?: unknown;
    } | null;
    // Payloads without the M2M fields (older server, stripped response)
    // carry no role signal — nothing to diff.
    if (!row || (row.admins === undefined && row.moderators === undefined)) {
      return;
    }
    const uuid = currentClubUUID.value;
    const key = JSON.stringify({
      admins: extractRoleIds(row.admins),
      moderators: extractRoleIds(row.moderators),
    });
    if (lastRoleSnapshot?.uuid === uuid && lastRoleSnapshot.key === key) {
      return; // unchanged since last observation
    }
    const firstObservation =
      !lastRoleSnapshot || lastRoleSnapshot.uuid !== uuid;
    lastRoleSnapshot = { uuid, key };
    if (firstObservation) return; // seed baseline — no refresh storm

    const metaKey = `club_meta_${currentClubId.value}`;
    const meta = LocalStorage.getItem(metaKey) as Record<
      string,
      unknown
    > | null;
    if (meta && typeof meta === 'object') {
      LocalStorage.set(metaKey, { ...meta, verified: false });
    }
    if (currentClubId.value) {
      void loadClubData(currentClubId.value).catch((err) => {
        console.warn('[realtime] role-change refresh failed:', err);
      });
    }
  };

  // Non-privileged server-wins overwrite, extracted so the whole sweep is
  // one perfMeasure span ('cloudsync.apply-serverwins'). collectionEqual
  // guards keep identical collections' references so the Club page
  // computeds aren't invalidated by a no-op overwrite; it early-exits at
  // the first differing element instead of serializing whole collections.
  const overwriteStateFromServer = (serverMatchmaking: AppState) => {
    if (
      serverMatchmaking.players &&
      !collectionEqual(
        MatchmakingApp.state.players,
        serverMatchmaking.players,
      )
    ) {
      MatchmakingApp.state.players = { ...serverMatchmaking.players };
    }
    if (
      serverMatchmaking.queues &&
      !collectionEqual(MatchmakingApp.state.queues, serverMatchmaking.queues)
    ) {
      MatchmakingApp.state.queues = [...serverMatchmaking.queues];
    }
    if (
      serverMatchmaking.activeMatches &&
      !collectionEqual(
        MatchmakingApp.state.activeMatches,
        serverMatchmaking.activeMatches,
      )
    ) {
      MatchmakingApp.state.activeMatches = [
        ...serverMatchmaking.activeMatches,
      ];
    }
    if (
      serverMatchmaking.completedMatches &&
      !collectionEqual(
        MatchmakingApp.state.completedMatches,
        serverMatchmaking.completedMatches,
      )
    ) {
      MatchmakingApp.state.completedMatches = [
        ...serverMatchmaking.completedMatches,
      ];
    }
    if (
      serverMatchmaking.completedMatchIds &&
      !collectionEqual(
        MatchmakingApp.state.completedMatchIds,
        serverMatchmaking.completedMatchIds,
      )
    ) {
      MatchmakingApp.state.completedMatchIds = [
        ...serverMatchmaking.completedMatchIds,
      ];
    }
    if (
      serverMatchmaking.actionLogs &&
      !collectionEqual(
        MatchmakingApp.state.actionLogs,
        serverMatchmaking.actionLogs,
      )
    ) {
      MatchmakingApp.state.actionLogs = [...serverMatchmaking.actionLogs];
    }
    // Overwrite settings — non-privileged users don't have local settings to preserve
    copyServerSettings(serverMatchmaking, SETTINGS_OVERWRITE_FIELDS, false);
    // Carry checkpoint timestamps
    MatchmakingApp.state.playersResetAt =
      serverMatchmaking.playersResetAt ?? 0;
    MatchmakingApp.state.queuesResetAt = serverMatchmaking.queuesResetAt ?? 0;
    MatchmakingApp.state.matchesResetAt =
      serverMatchmaking.matchesResetAt ?? 0;
    MatchmakingApp.state.statsResetAt = serverMatchmaking.statsResetAt ?? 0;
    MatchmakingApp.state.completedMatchesResetAt =
      serverMatchmaking.completedMatchesResetAt ?? 0;
    MatchmakingApp.state.actionLogsResetAt =
      serverMatchmaking.actionLogsResetAt ?? 0;
    if (serverMatchmaking.settingsFieldTimestamps) {
      MatchmakingApp.state.settingsFieldTimestamps = {
        ...serverMatchmaking.settingsFieldTimestamps,
      };
    }
    // Server-wins overwrite discards any local unpushed intent — the
    // durable marker is stale now.
    clearPendingSync(currentClubId.value);
  };

  const applyServerMatchmaking = (serverMatchmaking?: AppState) => {
    if (!serverMatchmaking) return;
    const incomingTs = serverMatchmaking.lastModified ?? 0;
    // Ignore the echo of our own last write.
    if (incomingTs === lastSyncedServerTimestamp.value) {
      return;
    }

    // Bound the incoming history the same way local writes do — an uncapped
    // blob written by an older client otherwise stays large forever here.
    perfMeasure('cloudsync.apply-prep', () =>
      enforceCompletedCaps(serverMatchmaking),
    );

    const isCurrentUserPrivilegedForSync =
      currentUserId.value &&
      (clubAdminIds.value.has(currentUserId.value) ||
        clubModeratorIds.value.has(currentUserId.value));

    // Suppress settings_change logs during programmatic merge —
    // server-driven settings changes should not be attributed to the
    // local admin in the action log.
    MatchmakingApp.suppressSettingsLog = true;
    try {
      // Only merge when this device actually has unsynced local writes —
      // lastModified (stamped by saveState on every mutation, never by
      // persistSilently) ahead of the last-synced server stamp. A clean
      // device that only views data takes the server-wins overwrite so its
      // stale persisted entities can't union-merge back and get re-pushed.
      // hasPendingCloudSync also counts as dirty: a failed push leaves
      // lastModified == lastSynced after a pull-merge while edits are still
      // owed to the server — they must keep merging, not be overwritten.
      const localHasUnsyncedChanges =
        (MatchmakingApp.state.lastModified ?? 0) >
          lastSyncedServerTimestamp.value || hasPendingCloudSync.value;
      if (isCurrentUserPrivilegedForSync && localHasUnsyncedChanges) {
        // Privileged + dirty: smart-merge so local offline edits are preserved.
        // mergeWithResetAdvantage wholesale-adopts collections whose server
        // reset checkpoint beats ours (contract §2, hook point a).
        const merged = mergeWithResetAdvantage(
          MatchmakingApp.state,
          serverMatchmaking,
        );
        // The merge result still owes the server a push — keep the durable
        // marker honest even if the session pending flag was dropped.
        markPendingSync(currentClubId.value);
        // Assign only keys whose content actually changed — identical merges
        // keep their references and don't invalidate the page's computeds.
        perfMeasure('cloudsync.apply-state', () =>
          applyMergedState(MatchmakingApp.state, merged),
        );
        // Extra safety: ensure no player appears in multiple matches
        // and no court has multiple in-progress matches
        MatchmakingApp.enforceOneMatchPerPlayer();
        MatchmakingApp.enforceOneMatchPerCourt();
      } else {
        // Non-privileged: server is source of truth — direct overwrite, no merge.
        perfMeasure('cloudsync.apply-serverwins', () =>
          overwriteStateFromServer(serverMatchmaking),
        );
      }
    } finally {
      // Re-enable settings_change logging now that the merge is complete —
      // finally so a merge exception can't leave logging stuck off.
      MatchmakingApp.suppressSettingsLog = false;
    }

    perfMeasure('cloudsync.persist', () =>
      MatchmakingApp.persistSilently(),
    );
    // Base version only moves forward — an out-of-order older realtime
    // message must not regress it and trigger spurious conflict merges.
    lastSyncedServerTimestamp.value = Math.max(
      lastSyncedServerTimestamp.value,
      incomingTs,
    );
    if (currentClubId.value) {
      saveLastSyncedTimestamp(
        currentClubId.value,
        lastSyncedServerTimestamp.value,
      );
    }
  };

  // ---- Realtime appState coalescing (PR-B B1) --------------------------
  // A burst of WS messages (multi-admin edits, or our own push echo
  // landing in the same window as a remote write) would otherwise run a
  // full merge + collectionEqual sweep + persist per message. Buffer the
  // appState payloads and flush the newest-wins winner after a ~50ms
  // trailing window instead.
  //
  // Selection is by MAX lastModified, NOT last-arrived: our own push echo
  // can arrive AFTER a remote write in the same window, and keeping the
  // last arrival would retain the echo — which applyServerMatchmaking then
  // echo-suppresses — while the newer remote write is dropped entirely.
  // Max-ts keeps the remote write; the echo loses the buffer slot.
  //
  // Timer-based (not rAF): rAF stalls in hidden tabs. pagehide /
  // visibilitychange flush immediately because background-tab timers are
  // throttled/suspended. Lossless: snapshots supersede — the flushed
  // payload is a full appState, and lastSyncedServerTimestamp's Math.max
  // keeps the base version monotonic regardless of flush order.
  const REALTIME_COALESCE_MS = 50;
  let realtimeCoalesceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingRealtimeMatchmaking: AppState | undefined;

  const flushRealtimeMatchmaking = () => {
    if (realtimeCoalesceTimer) {
      clearTimeout(realtimeCoalesceTimer);
      realtimeCoalesceTimer = null;
    }
    const pending = pendingRealtimeMatchmaking;
    pendingRealtimeMatchmaking = undefined;
    if (pending) {
      perfMeasure('cloudsync.realtime-flush', () =>
        applyServerMatchmaking(pending),
      );
    }
  };

  const bufferRealtimeMatchmaking = (matchmaking?: AppState) => {
    // Stripped/empty payloads never enter the buffer — and must not clear
    // a pending newer payload either.
    if (!matchmaking) return;
    const pendingTs = pendingRealtimeMatchmaking?.lastModified ?? 0;
    const incomingTs = matchmaking.lastModified ?? 0;
    if (!pendingRealtimeMatchmaking || incomingTs > pendingTs) {
      pendingRealtimeMatchmaking = matchmaking;
    }
    // Arm the window on the FIRST buffered message only — a fixed trailing
    // window bounds flush latency to ~50ms even under a sustained burst
    // (debounce-reset would postpone indefinitely).
    if (!realtimeCoalesceTimer) {
      realtimeCoalesceTimer = setTimeout(
        flushRealtimeMatchmaking,
        REALTIME_COALESCE_MS,
      );
    }
  };

  // Watchdog state: distinguishes a dropped stream (retry with backoff)
  // from an intentional stop, and drives the polling fallback for
  // foregrounded-but-idle viewers (TV / second screen) who never emit a
  // focus/visibility event to trigger restartRealtime().
  let realtimeWanted = false;
  let realtimeRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let realtimeRetryDelay = 3000;
  // Last time the stream produced any message. A stream can stay "open"
  // while silently delivering nothing (e.g. WS handshake auth issues for
  // cookie-mode logins) — the staleness poll below detects that.
  let lastRealtimeMessageAt = 0;

  const scheduleRealtimeRetry = () => {
    if (realtimeRetryTimer || !realtimeWanted) return;
    realtimeRetryTimer = setTimeout(() => {
      realtimeRetryTimer = null;
      if (realtimeWanted && isOnline.value && currentClubUUID.value) {
        void startRealtime();
      }
    }, realtimeRetryDelay);
    realtimeRetryDelay = Math.min(realtimeRetryDelay * 2, 30000);
  };

  const startRealtime = async () => {
    if (realtimeUnsub || realtimeStarting) return;
    if (!isOnline.value || !currentClubUUID.value) return;

    realtimeWanted = true;
    realtimeStarting = true;
    try {
      await likhaClient.connect();
      const { subscription, unsubscribe } = await likhaClient.subscribe(
        'club',
        {
          event: 'update',
          query: {
            filter: { id: { _eq: currentClubUUID.value } },
            fields: [
              'id',
              'appState',
              // Role M2M ids ride along so a server-side role change can
              // invalidate the verified club_meta_* privilege snapshot
              // (contract §4). Dot-notation M2M verified for Player tokens.
              'admins.directus_users_id.id',
              'moderators.directus_users_id.id',
            ],
          },
        },
      );

      realtimeUnsub = unsubscribe;

      void (async () => {
        try {
          for await (const message of subscription) {
            const msg = message as ClubRealtimeMessage;
            if (msg.type && msg.type !== 'subscription') {
              continue;
            }
            // data is an array for create/update, but tolerate a bare object
            // in case a server/SDK version returns the item directly.
            const item = Array.isArray(msg.data) ? msg.data[0] : msg.data;
            // Role-field diff runs PER-MESSAGE before buffering — role
            // changes are tiny but must not wait for (or be dropped by)
            // the appState coalescer, and they trigger loadClubData.
            handleRealtimeRoleFields(item);
            const matchmaking = item?.appState?.matchmaking;
            // Only a message carrying usable data proves the stream is
            // healthy — stripped/empty payloads (e.g. permission-filtered
            // appState) must not suppress the staleness poll. The stamp is
            // on RECEIPT, not flush: the ~50ms coalesce window must not
            // look like stream silence to the 20s staleness poll.
            if (matchmaking) lastRealtimeMessageAt = Date.now();
            // Non-appState messages (role fields handled above, other
            // collections, stripped payloads) bypass coalescing — they
            // simply never enter the buffer.
            bufferRealtimeMatchmaking(matchmaking);
          }
        } catch (err) {
          console.warn('Realtime stream ended:', err);
        } finally {
          // Stream closed (drop or unsubscribe). Unless stopRealtime() ran,
          // the stream was dropped — come back with exponential backoff so
          // idle viewers (TV/second screen, no focus events) self-heal.
          realtimeUnsub = null;
          scheduleRealtimeRetry();
        }
      })();

      realtimeRetryDelay = 3000; // healthy subscribe → reset backoff
    } catch (err) {
      console.warn(
        'Realtime subscribe failed; falling back to polling/manual refresh',
        err,
      );
      scheduleRealtimeRetry();
    } finally {
      realtimeStarting = false;
    }
  };

  const stopRealtime = () => {
    realtimeWanted = false;
    if (realtimeRetryTimer) {
      clearTimeout(realtimeRetryTimer);
      realtimeRetryTimer = null;
    }
    // Flush any coalesced payload BEFORE unsubscribing — preserves the
    // pre-coalescing invariant that every received appState is applied.
    // Runs while MatchmakingApp.state still belongs to this club (club
    // switches call stopRealtime before resetState).
    flushRealtimeMatchmaking();
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
      // the debounced cloud sync (1500ms) which handles the push — no need for
      // a separate performCloudSync() call here (that would do a second read).
      // Non-privileged users just get the direct overwrite via persistSilently().
      await loadClubData(currentClubId.value);
      // refreshPlayerRatings is no longer needed here — loadClubData now fetches
      // rating_updated_at and applies LWW rating adoption + clubMembers sync.
    }
    // Always reconnect realtime when app comes back to foreground.
    restartRealtime();
  };

  // Staleness watchdog: a realtime stream can be "open" yet silently
  // deliver nothing (WS handshake authenticated but permission-filtered,
  // cookie-mode SSO sockets, proxy buffering). Viewers can't rely on the
  // stream alone, so every POLL_MS we compare the server's matchmaking
  // timestamp against our last-synced one and pull on drift. Skipped
  // entirely while the stream is healthy (a message arrived recently),
  // so realtime costs nothing extra.
  const STALENESS_POLL_MS = 20000;
  let pollInFlight = false;
  const pollServerState = async () => {
    if (pollInFlight) return;
    if (isOpenPlay.value || clubSwitchInProgress.value) return;
    if (!isOnline.value || !currentClubUUID.value || !currentClubId.value)
      return;
    // Don't pull mid-edit: an admin's debounced push is armed or in flight.
    // Exception: when the last push FAILED (pushFailed), pending means
    // "awaiting retry" with no retry necessarily scheduled — pulling is the
    // only way this device converges, and applyServerMatchmaking's dirty
    // check (hasPendingCloudSync counts as dirty) keeps unpushed edits safe.
    if (syncInProgress) return;
    if (hasPendingCloudSync.value && !pushFailed) return;
    // Healthy stream delivered recently — nothing to check.
    if (Date.now() - lastRealtimeMessageAt < STALENESS_POLL_MS) return;

    pollInFlight = true;
    try {
      const light = await likhaClient.request(
        readItems('club', {
          filter: { id: { _eq: currentClubUUID.value } },
          fields: [
            'json(appState, matchmaking.lastModified)',
          ] as unknown as string[],
        }),
      );
      const serverTs = parseLightweightTimestamp(light);
      if (serverTs && serverTs !== lastSyncedServerTimestamp.value) {
        const full = await likhaClient.request(
          readItems('club', {
            filter: { id: { _eq: currentClubUUID.value } },
            fields: ['appState'],
          }),
        );
        const serverAppState = (
          full?.[0] as unknown as {
            appState?: { matchmaking?: AppState };
          }
        )?.appState;
        applyServerMatchmaking(serverAppState?.matchmaking);
      }
    } catch (err) {
      console.warn('[poll] staleness check failed:', err);
      // Lightweight read unsupported/failed and realtime is dead — fall
      // back to a full pull so viewers still converge.
      if (!realtimeUnsub && !realtimeStarting && currentClubId.value) {
        try {
          await loadClubData(currentClubId.value);
        } catch {
          /* offline-ish */
        }
      }
    } finally {
      pollInFlight = false;
    }
  };

  // Watch for matchmaking state changes and sync to cloud
  // Debounced wrapper: batch rapid mutations into a single sync attempt.
  const debouncedCloudSync = () => {
    if (clubSwitchInProgress.value) return;
    hasPendingCloudSync.value = true;
    if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(() => {
      performCloudSync();
    }, 1500);
  };

  MatchmakingApp.onStateChange = debouncedCloudSync;

  // Durable pending-sync re-arm (Phase 3 #15): when a club with a pending
  // marker becomes current — on mount, club switch-in, or when the switch
  // guard releases — re-arm the push through the normal debounced path.
  // performCloudSync's own gates (online, verified privilege, club match,
  // merge-before-push) keep this safe; if it gets dropped again mid-switch
  // the marker persists and the next trigger retries.
  const maybeRearmPendingSync = () => {
    const clubId = currentClubId.value;
    if (!clubId || isOpenPlay.value || hasPendingCloudSync.value) return;
    if (!hasPendingSyncMarker(clubId)) return;
    // Only re-arm once local state actually belongs to this club.
    if (
      MatchmakingApp.state.clubId &&
      MatchmakingApp.state.clubId !== clubId
    ) {
      return;
    }
    debouncedCloudSync();
  };
  watch(currentClubId, maybeRearmPendingSync, { immediate: true });
  watch(clubSwitchInProgress, (inProgress) => {
    if (!inProgress) maybeRearmPendingSync();
  });

  // Sync-related event listeners (mounted/unmounted in composable)
  let ratingsRefreshInterval: ReturnType<typeof setInterval> | null = null;
  let stalenessPollInterval: ReturnType<typeof setInterval> | null = null;

  // Flush any pending debounced sync immediately on pagehide (tab close /
  // navigation / mobile backgrounding). The async performCloudSync may not
  // complete before the page unloads, but the fetch request usually reaches
  // the server. LocalStorage (written by saveState) is the backup for the
  // next load via restoreFromCache + mergeAppState.
  const handlePageHide = () => {
    if (syncDebounceTimer) {
      clearTimeout(syncDebounceTimer);
      syncDebounceTimer = null;
    }
    // Hidden-tab timers are throttled/suspended — apply any coalesced
    // realtime payload now rather than waiting out the 50ms window.
    flushRealtimeMatchmaking();
    if (hasPendingCloudSync.value) {
      void performCloudSync();
    }
  };

  // visibilitychange covers the cases pagehide misses (mobile tab
  // switchers, bfcache restores): flush the coalescer on either
  // transition so a buffered burst can't stall behind a suspended timer.
  const handleVisibilityChange = () => {
    flushRealtimeMatchmaking();
  };

  onMounted(() => {
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Player ratings live in directus_users (not in club.appState), so realtime
    // can't observe them. Poll the club.players M2M periodically to keep ratings fresh.
    ratingsRefreshInterval = setInterval(() => {
      if (!isOnline.value || !currentClubUUID.value) return;
      void refreshPlayerRatings();
    }, 60000);

    // Staleness watchdog: catches streams that are open but silent, plus
    // fully-dead sockets, without relying on focus events. Cheap — skips
    // entirely while realtime is delivering.
    stalenessPollInterval = setInterval(() => {
      void pollServerState();
    }, STALENESS_POLL_MS);
  });

  onUnmounted(() => {
    unregisterBeforeLogout();
    window.removeEventListener('online', updateOnlineStatus);
    window.removeEventListener('offline', updateOnlineStatus);
    window.removeEventListener('pagehide', handlePageHide);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    stopRealtime();
    if (ratingsRefreshInterval) {
      clearInterval(ratingsRefreshInterval);
      ratingsRefreshInterval = null;
    }
    if (stalenessPollInterval) {
      clearInterval(stalenessPollInterval);
      stalenessPollInterval = null;
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
    pollServerState, // exposed for tests — the staleness interval calls it
    // exposed for tests + pagehide/visibilitychange wiring — applies any
    // coalesced realtime payload immediately
    flushRealtimeMatchmaking,
  };
}
