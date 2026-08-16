import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { useRouter } from 'vue-router';
import { useNotify } from 'src/composables/useNotify';
import { useAuth } from 'src/composables/useAuth';
import { LocalStorage } from 'quasar';
import type { QNotifyCreateOptions } from 'quasar';
import { MatchmakingApp, mergeAppState } from 'src/services/matchmaking';
import type { AppState } from 'src/services/matchmaking';
import { likhaClient, LIKHA_URL } from 'src/services/likhaClient';
import { joinClub as joinClubService } from 'src/services/clubMembership';
import { readItems, updateItem, uploadFiles } from '@likha-erp/likha-sdk';
import type { Router } from 'vue-router';

type NotifyFn = (opts: QNotifyCreateOptions) => void;
type HandleAuthErrorFn = (err: unknown, router: Router) => Promise<boolean>;

export interface UseClubDataContext {
  likhaUrl: Ref<string>;
  currentUserId: Ref<string>;
  isOpenPlay: ComputedRef<boolean>;
  getDataFetchBar: () =>
    | { start: () => void; stop: () => void }
    | undefined
    | null;
  lastSyncedServerTimestamp: Ref<number>;
  saveLastSyncedTimestamp: (clubId: string, ts: number) => void;
}

export function useClubData(context: UseClubDataContext) {
  const {
    likhaUrl,
    currentUserId,
    isOpenPlay,
    getDataFetchBar,
    lastSyncedServerTimestamp,
    saveLastSyncedTimestamp,
  } = context;
  const router = useRouter();
  const { notify: ctxNotify } = useNotify();
  const notify = ctxNotify as NotifyFn;
  const { handleAuthError: ctxHandleAuthError } = useAuth();
  const handleAuthError = ctxHandleAuthError as HandleAuthErrorFn;

  const currentClubId = ref<string>('');
  const currentClubUUID = ref<string>('');
  const clubName = ref<string>('');
  const clubLogo = ref<string>('');
  const getClubLogoUrl = computed(() => {
    if (!clubLogo.value) return '';
    if (
      clubLogo.value.startsWith('http://') ||
      clubLogo.value.startsWith('https://')
    ) {
      return clubLogo.value;
    }
    return `${LIKHA_URL}/assets/${clubLogo.value}`;
  });
  const editClubName = ref('');
  const editClubId = ref('');
  const editClubLoading = ref(false);
  const clubLogoInput = ref<HTMLInputElement | null>(null);
  const clubLoadingState = ref<
    'loading' | 'loaded' | 'not-found' | 'unpublished' | 'error'
  >('loading');
  const clubStatus = ref<string>('published');
  const clubErrorMessage = ref<string>('');
  const isCurrentUserMember = ref(true);
  const clubAdminIds = ref<Set<string>>(new Set());
  const clubMembers = ref<
    Array<{
      id: string;
      username?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      rating?: number;
      level?: 1 | 2 | 3;
      isAdmin?: boolean;
      avatar?: string;
      duprId?: string;
      playerJunctionId?: string;
      adminJunctionId?: string;
    }>
  >([]);

  const populateEditClubFields = () => {
    editClubName.value = clubName.value;
    editClubId.value = currentClubId.value;
  };

  const refreshClubInfo = async () => {
    if (!currentClubUUID.value) return;
    try {
      const result = await likhaClient.request(
        readItems('club', {
          filter: { id: { _eq: currentClubUUID.value } },
          fields: ['id', 'name', 'clubId', 'logo'],
        }),
      );
      const club = result?.[0] as
        | { name?: string; clubId?: string; logo?: string }
        | undefined;
      if (club) {
        clubName.value = club.name || clubName.value;
        currentClubId.value = club.clubId || currentClubId.value;
        clubLogo.value = club.logo || clubLogo.value;
      }
    } catch (err) {
      console.warn('Failed to refresh club info:', err);
    }
  };

  const onLogoSelected = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !currentClubUUID.value) return;

    try {
      const formData = new FormData();
      formData.append('file', file);
      const uploadResult = await likhaClient.request(uploadFiles(formData));
      const uploaded = Array.isArray(uploadResult)
        ? uploadResult[0]
        : uploadResult;
      const logoId = uploaded?.id;

      if (logoId) {
        await likhaClient.request(
          updateItem('club', currentClubUUID.value, { logo: logoId }),
        );
        clubLogo.value = logoId;
        notify({ color: 'positive', message: 'Logo updated!' });
      }
    } catch (err) {
      console.error('Logo upload failed:', err);
      notify({ color: 'negative', message: 'Failed to upload logo' });
    } finally {
      input.value = '';
    }
  };

  const saveClubDetails = async () => {
    if (
      !editClubName.value.trim() ||
      !editClubId.value.trim() ||
      !currentClubUUID.value
    )
      return;
    editClubLoading.value = true;
    try {
      const trimmedName = editClubName.value.trim();
      const trimmedId = editClubId.value.trim();
      const idChanged = trimmedId !== currentClubId.value;

      await likhaClient.request(
        updateItem('club', currentClubUUID.value, {
          name: trimmedName,
          clubId: trimmedId,
        }),
      );

      clubName.value = trimmedName;
      currentClubId.value = trimmedId;
      notify({ color: 'positive', message: 'Club details updated!' });

      if (idChanged) {
        router.replace(`/club/${trimmedId}`);
      }
    } catch (err) {
      console.error('Update club details failed:', err);
      const error = err as { errors?: { message?: string }[] };
      const msg = error?.errors?.[0]?.message || 'Failed to update club';
      notify({ color: 'negative', message: msg });
    } finally {
      editClubLoading.value = false;
    }
  };

  const handleJoinClub = async () => {
    if (!currentClubId.value || !currentUserId.value) return;
    try {
      const result = await joinClubService(
        currentClubId.value,
        currentUserId.value,
      );
      if (!result.success) {
        notify({ color: 'negative', message: result.error });
        return;
      }
      if (!result.alreadyMember) {
        notify({ type: 'positive', message: 'Joined club successfully!' });
      }
      await loadClubData(currentClubId.value);
    } catch (err) {
      if (await handleAuthError(err, router)) return;
      notify({ color: 'negative', message: 'Failed to join club' });
    }
  };

  const restoreFromCache = (clubId: string): boolean => {
    const cached = LocalStorage.getItem('matchmaking_state') as Record<
      string,
      unknown
    > | null;
    const meta = LocalStorage.getItem(`club_meta_${clubId}`) as {
      clubUUID?: string;
      adminIds?: string[];
      members?: typeof clubMembers.value;
      clubName?: string;
      clubLogo?: string;
      clubStatus?: string;
    } | null;

    if (cached && Object.keys(cached).length > 0 && meta) {
      currentClubId.value = clubId;
      MatchmakingApp.state.clubId = clubId;
      currentClubUUID.value = meta.clubUUID || '';
      MatchmakingApp.state.clubUUID = meta.clubUUID || '';
      clubAdminIds.value = new Set(meta.adminIds || []);
      clubMembers.value = meta.members || [];
      isCurrentUserMember.value =
        isOpenPlay.value ||
        clubMembers.value.some((m) => m.id === currentUserId.value);
      clubName.value = meta.clubName || clubId;
      clubLogo.value = meta.clubLogo || '';
      clubStatus.value = meta.clubStatus || 'published';
      return true;
    }
    return false;
  };

  // Copy settings from server state to local state for a specific set of fields.
  // onlyIfUndefined=true: only copy if local value is undefined (admin seed pattern).
  // onlyIfUndefined=false: always copy if server value is defined (non-admin overwrite pattern).
  const SETTINGS_SEED_FIELDS = [
    'availableCourts',
    'autoAdvanceMatches',
    'queueReturnMethod',
    'autoSortQueue',
    'queuePriorityMode',
    'matchmakingMode',
    'sortBy',
    'matchType',
    'matchesFilterBy',
    'ttsEnabled',
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

  const loadClubData = async (clubId: string) => {
    if (!clubId || !likhaUrl.value) {
      clubStatus.value = 'published';
      clubLoadingState.value = 'loaded';
      return;
    }

    // If switching clubs, clear cached matchmaking state so the new club starts fresh
    if (
      (currentClubId.value && currentClubId.value !== clubId) ||
      (MatchmakingApp.state.clubId && MatchmakingApp.state.clubId !== clubId)
    ) {
      MatchmakingApp.resetState();
    }

    // Capture expected club so we can abort if the user switched clubs while the API was in-flight
    const expectedClubId = clubId;

    // Check for cached data — if available, restore immediately and fetch in background
    const hasCache = restoreFromCache(clubId);
    if (hasCache) {
      clubLoadingState.value = 'loaded';
      getDataFetchBar()?.start();
    } else {
      clubLoadingState.value = 'loading';
    }

    try {
      const result = await likhaClient.request(
        readItems('club', {
          filter: {
            clubId: {
              _eq: clubId,
            },
          },
          fields: [
            'id',
            'clubId',
            'name',
            'logo',
            'status',
            'appState',
            'players.id',
            'players.directus_users_id.id',
            'players.directus_users_id.username',
            'players.directus_users_id.first_name',
            'players.directus_users_id.last_name',
            'players.directus_users_id.email',
            'players.directus_users_id.rating',
            'players.directus_users_id.dupr_id',
            'players.directus_users_id.avatar',
            'admins.id',
            'admins.directus_users_id.id',
            'admins.directus_users_id.email',
          ] as unknown as string[],
          deep: {
            players: { _limit: -1 },
            admins: { _limit: -1 },
          },
        }),
      );

      // Guard: if the user switched clubs while the API was in-flight, discard this response
      if (
        MatchmakingApp.state.clubId &&
        MatchmakingApp.state.clubId !== expectedClubId
      ) {
        clubLoadingState.value = 'loaded';
        return;
      }

      if (result && result.length > 0) {
        const club = result[0] as unknown as {
          id: string;
          clubId: string;
          name?: string;
          logo?: string;
          status?: string;
          appState?: {
            matchmaking?: unknown;
            courtSettings?: {
              availableCourts: unknown;
              autoAdvanceMatches: boolean;
            };
            queueSettings?: {
              queueReturnMethod:
                | 'fairness_first'
                | 'end_of_queue'
                | 'smart_position';
              autoSortQueue: boolean;
              queuePriorityMode: 'timestamp' | 'gamesPlayed';
              matchmakingMode?:
                | 'variety_first'
                | 'balance_first'
                | 'balanced_variety'
                | 'strict_balance'
                | 'fair_balance';
            };
            uiSettings?: {
              sortBy:
                | 'matchesPlayed'
                | 'rating'
                | 'winRate'
                | 'wins'
                | 'losses'
                | 'name';
              matchType: 'singles' | 'doubles';
              matchesFilterBy:
                | 'all'
                | 'in-progress'
                | 'waiting'
                | 'cancelled'
                | 'completed'
                | 'edited';
            };
          };
          players?: Array<{
            id: string;
            directus_users_id?: {
              id: string;
              username?: string;
              first_name?: string;
              last_name?: string;
              email?: string;
              rating?: number;
              rating_updated_at?: number;
              avatar?: string;
            };
          }>;
          admins?: Array<{
            id: string;
            directus_users_id?: {
              id: string;
              email?: string;
            };
          }>;
        };
        currentClubId.value = clubId;
        currentClubUUID.value = club.id;
        clubName.value = club.name || clubId;
        clubLogo.value = club.logo || '';
        MatchmakingApp.state.clubId = clubId;
        MatchmakingApp.state.clubUUID = club.id;

        clubStatus.value = club.status || 'published';

        // Local client is the source of truth. Only use cloud settings as fallback
        // when local state doesn't have them yet (first visit / new device).
        const serverMatchmaking = club.appState?.matchmaking as
          | AppState
          | undefined;

        // Wrap the entire merge/seed block so a client-side exception (e.g.,
        // malformed appState, unexpected null) is never misdiagnosed as "offline".
        // On merge failure we keep whatever server data was fetched and still
        // mark the club as loaded — the outer catch handles only network/API errors.
        try {
          // Determine admin status from raw club data (needed before any merge logic)
          const isAdminFromData = (club.admins || []).some(
            (a) => a.directus_users_id?.id === currentUserId.value,
          );

          if (serverMatchmaking) {
            if (isAdminFromData) {
              // Admins: only merge settings that are missing locally — never overwrite existing
              copyServerSettings(serverMatchmaking, SETTINGS_SEED_FIELDS, true);
            }
            // Non-admins: settings are overwritten directly in the non-admin block below
          } else {
            // Cloud appState is blank/null — clear local data so UI starts fresh
            MatchmakingApp.resetState();
            MatchmakingApp.state.clubId = clubId;
          }
          if (serverMatchmaking) {
            if (isAdminFromData) {
              // Admins: smart-merge so a refresh picks up other admins' newly created
              //   queues/matches (latest-writer-wins) while preserving player stats.
              // Detect remote reset: another admin cleared all data (full reset).
              // Partial checkpoint advances (session resets) are handled by mergeAppState.
              const serverHasNoPlayers =
                Object.keys(serverMatchmaking.players || {}).length === 0;
              const serverHasNoQueues =
                (serverMatchmaking.queues || []).length === 0;
              const serverHasNoMatches =
                (serverMatchmaking.activeMatches || []).filter(
                  (m) => !m.deletedAt,
                ).length === 0;
              const serverTime = serverMatchmaking.lastModified ?? 0;
              const localTime = MatchmakingApp.state.lastModified ?? 0;
              const isRemoteReset =
                serverHasNoPlayers &&
                serverHasNoQueues &&
                serverHasNoMatches &&
                serverTime > localTime;

              if (isRemoteReset) {
                // Another admin performed a reset — adopt server state (mergeAppState will purge)
                MatchmakingApp.state.players = {};
                MatchmakingApp.state.queues = [];
                MatchmakingApp.state.activeMatches = [];
                MatchmakingApp.state.completedMatches = [];
                MatchmakingApp.state.lastModified = serverTime;
                MatchmakingApp.state.playersResetAt =
                  serverMatchmaking.playersResetAt ?? 0;
                MatchmakingApp.state.queuesResetAt =
                  serverMatchmaking.queuesResetAt ?? 0;
                MatchmakingApp.state.matchesResetAt =
                  serverMatchmaking.matchesResetAt ?? 0;
                notify({
                  type: 'info',
                  message: 'Club data was reset by another admin',
                  timeout: 3000,
                });
              } else {
                // Check if local state is "fresh" (no meaningful data) - e.g., incognito/private mode
                // In this case, directly adopt server state instead of merging to prevent
                // timestamp-based logic from keeping empty local data.
                const isFreshState =
                  Object.keys(MatchmakingApp.state.players).length === 0 &&
                  MatchmakingApp.state.queues.length === 0 &&
                  MatchmakingApp.state.activeMatches.length === 0;

                if (isFreshState) {
                  // Fresh state: directly adopt server data
                  if (serverMatchmaking.players) {
                    MatchmakingApp.state.players = {
                      ...serverMatchmaking.players,
                    };
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
                  // Carry checkpoint timestamps so resets propagate
                  MatchmakingApp.state.playersResetAt =
                    serverMatchmaking.playersResetAt ?? 0;
                  MatchmakingApp.state.queuesResetAt =
                    serverMatchmaking.queuesResetAt ?? 0;
                  MatchmakingApp.state.matchesResetAt =
                    serverMatchmaking.matchesResetAt ?? 0;
                  // Carry settings timestamps so per-field LWW survives on fresh devices
                  MatchmakingApp.state.settingsUpdatedAt =
                    serverMatchmaking.settingsUpdatedAt ?? 0;
                  if (serverMatchmaking.settingsFieldTimestamps) {
                    MatchmakingApp.state.settingsFieldTimestamps = {
                      ...serverMatchmaking.settingsFieldTimestamps,
                    };
                  }
                } else {
                  // Existing local state: smart-merge with server
                  const merged = mergeAppState(
                    MatchmakingApp.state,
                    serverMatchmaking,
                  );
                  Object.assign(MatchmakingApp.state, merged);
                  // Extra safety: ensure no player appears in multiple matches
                  MatchmakingApp.enforceOneMatchPerPlayer();
                }
              }
            } else {
              // Non-admins: server is source of truth — directly overwrite everything, no merge
              if (serverMatchmaking.players) {
                MatchmakingApp.state.players = {
                  ...serverMatchmaking.players,
                };
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
              // Overwrite settings too — non-admins don't have local settings to preserve
              copyServerSettings(
                serverMatchmaking,
                SETTINGS_SEED_FIELDS,
                false,
              );
              // Carry checkpoint timestamps so resets propagate
              MatchmakingApp.state.playersResetAt =
                serverMatchmaking.playersResetAt ?? 0;
              MatchmakingApp.state.queuesResetAt =
                serverMatchmaking.queuesResetAt ?? 0;
              MatchmakingApp.state.matchesResetAt =
                serverMatchmaking.matchesResetAt ?? 0;
            }
          }
          // Backward-compat: migrate old separate settings blocks into MatchmakingApp.state (admin only)
          if (isAdminFromData && club.appState?.courtSettings) {
            const ac = club.appState.courtSettings.availableCourts;
            if (MatchmakingApp.state.availableCourts === undefined) {
              MatchmakingApp.state.availableCourts =
                typeof ac === 'number' ? ac : 1;
            }
            if (MatchmakingApp.state.autoAdvanceMatches === undefined) {
              MatchmakingApp.state.autoAdvanceMatches =
                club.appState.courtSettings.autoAdvanceMatches;
            }
          }
          if (isAdminFromData && club.appState?.queueSettings) {
            if (MatchmakingApp.state.queueReturnMethod === undefined) {
              MatchmakingApp.state.queueReturnMethod =
                club.appState.queueSettings.queueReturnMethod;
            }
            if (MatchmakingApp.state.autoSortQueue === undefined) {
              MatchmakingApp.state.autoSortQueue =
                club.appState.queueSettings.autoSortQueue;
            }
            if (MatchmakingApp.state.queuePriorityMode === undefined) {
              MatchmakingApp.state.queuePriorityMode =
                club.appState.queueSettings.queuePriorityMode;
            }
            if (MatchmakingApp.state.matchmakingMode === undefined) {
              MatchmakingApp.state.matchmakingMode =
                club.appState.queueSettings.matchmakingMode;
            }
          }
          if (isAdminFromData && club.appState?.uiSettings) {
            if (MatchmakingApp.state.sortBy === undefined) {
              MatchmakingApp.state.sortBy = club.appState.uiSettings.sortBy;
            }
            if (MatchmakingApp.state.matchType === undefined) {
              MatchmakingApp.state.matchType =
                club.appState.uiSettings.matchType;
            }
            if (MatchmakingApp.state.matchesFilterBy === undefined) {
              MatchmakingApp.state.matchesFilterBy =
                club.appState.uiSettings.matchesFilterBy;
            }
          }
          // Ensure the club UUID is always present after any server state merge
          if (currentClubUUID.value) {
            MatchmakingApp.state.clubUUID = currentClubUUID.value;
            // Backfill club on any completed matches that were created without it
            MatchmakingApp.state.completedMatches.forEach((m) => {
              if (!m.club) m.club = currentClubUUID.value;
            });
          }

          // Admins: persist() fires onStateChange → debounced cloud sync (push).
          // Non-admins: persistSilently() saves to LocalStorage without arming a
          // cloud push — non-admins never write to the server.
          if (isAdminFromData) {
            MatchmakingApp.persist();
          } else {
            MatchmakingApp.persistSilently();
          }

          // Update our concurrency token to the server's version so subsequent syncs
          // don't falsely conflict with the state we just merged.
          if (serverMatchmaking?.lastModified) {
            lastSyncedServerTimestamp.value = serverMatchmaking.lastModified;
            saveLastSyncedTimestamp(clubId, serverMatchmaking.lastModified);
          }

          // Build admin set and clubMembers list
          clubAdminIds.value = new Set(
            (club.admins || [])
              .map((a) => a.directus_users_id?.id)
              .filter((id): id is string => !!id),
          );
          // Build admin junction ID lookup for member management
          const adminJunctionMap = new Map<string, string>();
          (club.admins || []).forEach((a) => {
            const adminUserId = a.directus_users_id?.id;
            if (adminUserId && a.id) {
              adminJunctionMap.set(adminUserId, a.id);
            }
          });

          clubMembers.value =
            (club.players || [])
              .map((p) => {
                const u = p.directus_users_id as Record<string, unknown> | null;
                const userId = typeof u?.id === 'string' ? u.id : '';
                const avatarId =
                  typeof u?.avatar === 'string' ? u.avatar : undefined;
                return {
                  id: userId,
                  username:
                    typeof u?.username === 'string' ? u.username : undefined,
                  firstName:
                    typeof u?.first_name === 'string'
                      ? u.first_name
                      : undefined,
                  lastName:
                    typeof u?.last_name === 'string' ? u.last_name : undefined,
                  email: typeof u?.email === 'string' ? u.email : undefined,
                  rating: typeof u?.rating === 'number' ? u.rating : undefined,
                  duprId:
                    typeof u?.dupr_id === 'string' ? u.dupr_id : undefined,
                  isAdmin: clubAdminIds.value.has(userId),
                  avatar: avatarId
                    ? `${likhaUrl.value}/assets/${avatarId}`
                    : undefined,
                  playerJunctionId: p.id || undefined,
                  adminJunctionId: adminJunctionMap.get(userId) || undefined,
                };
              })
              .filter((m) => m.id) || [];

          // Check if current user is a club member (skip for open play)
          isCurrentUserMember.value =
            isOpenPlay.value ||
            clubMembers.value.some((m) => m.id === currentUserId.value);

          // Persist club metadata for offline admin detection
          LocalStorage.set(`club_meta_${clubId}`, {
            clubUUID: club.id,
            adminIds: Array.from(clubAdminIds.value),
            members: clubMembers.value,
            clubName: club.name || clubId,
            clubLogo: club.logo || '',
            clubStatus: club.status || 'published',
            timestamp: Date.now(),
          });

          // Merge club players into local state
          if (club.players && Array.isArray(club.players)) {
            club.players.forEach((p) => {
              const user = p.directus_users_id as Record<
                string,
                unknown
              > | null;
              if (user && user.id) {
                // Check if we already have a player with this userId (they might have been renamed locally)
                const existingPlayer = Object.values(
                  MatchmakingApp.state.players,
                ).find((player) => player.userId === user.id);

                if (existingPlayer) {
                  // LWW: only adopt the DB rating when it's newer than our local one.
                  // If we have a local ratingUpdatedAt (from the rating engine or a
                  // prior manual edit) and the DB timestamp is missing/older, keep local.
                  const dbTs = Number(user.rating_updated_at || 0);
                  const localTs = Number(existingPlayer.ratingUpdatedAt || 0);
                  const dbIsNewer = dbTs > localTs;
                  const localHasTs = localTs > 0;
                  const shouldAdopt = dbTs > 0 ? dbIsNewer : !localHasTs; // if DB has no timestamp, only overwrite if local also has none

                  if (shouldAdopt) {
                    const userRating =
                      typeof user.rating === 'number' ? user.rating : undefined;
                    existingPlayer.rating =
                      userRating || existingPlayer.rating || 1450;
                    if (dbTs > 0) existingPlayer.ratingUpdatedAt = dbTs;
                    existingPlayer.updatedAt = Date.now();
                  }

                  // Update avatar if present
                  const avatarId =
                    typeof user.avatar === 'string' ? user.avatar : undefined;
                  if (avatarId) {
                    existingPlayer.avatar = `${likhaUrl.value}/assets/${avatarId}`;
                    existingPlayer.updatedAt = Date.now();
                  }

                  // Update firstName if present
                  const firstName =
                    typeof user.first_name === 'string'
                      ? user.first_name
                      : undefined;
                  if (firstName) {
                    existingPlayer.firstName = firstName;
                    existingPlayer.updatedAt = Date.now();
                  }
                }
                // Note: We do NOT add new club members automatically - that should be done via the "Add Club Members" UI
              }
            });
            MatchmakingApp.persist();
          }
        } catch (mergeErr) {
          console.error('[loadClubData] merge/seed failed:', mergeErr);
          notify({
            color: 'warning',
            message:
              'Loaded club data, but some local sync failed. Refresh if data looks incorrect.',
            timeout: 5000,
          });
        }

        clubLoadingState.value = 'loaded';
        if (hasCache) getDataFetchBar()?.stop();
      } else {
        // Club truly not found
        if (hasCache) getDataFetchBar()?.stop();
        clubLoadingState.value = 'not-found';
        clubErrorMessage.value = `Club "${clubId}" not found.`;
      }
    } catch (err) {
      if (hasCache) getDataFetchBar()?.stop();
      // Handle 401 Unauthorized errors
      if (await handleAuthError(err, router)) return;

      // Check if the error is due to an unpublished club
      const error = err as { response?: { status?: number }; message?: string };
      if (
        error?.response?.status === 403 ||
        error?.message?.includes('unpublished')
      ) {
        // Try to fetch club without filter to check if it exists but is unpublished
        try {
          const clubResult = await likhaClient.request(
            readItems('club', {
              filter: {
                clubId: {
                  _eq: clubId,
                },
              },
              fields: [
                'id',
                'clubId',
                'name',
                'status',
                'admins.directus_users_id.id',
              ] as unknown as string[],
              limit: 1,
              deep: {
                admins: { _limit: -1 },
              },
            }),
          );

          if (clubResult && clubResult.length > 0) {
            const unpublishedClub = clubResult[0] as unknown as {
              id: string;
              clubId: string;
              name?: string;
              status?: string;
              admins?: Array<{
                directus_users_id?: {
                  id: string;
                };
              }>;
            };

            // Check if current user is an admin of this unpublished club
            const isAdmin = (unpublishedClub.admins || []).some(
              (a) => a.directus_users_id?.id === currentUserId.value,
            );

            if (isAdmin) {
              clubLoadingState.value = 'unpublished';
              clubErrorMessage.value = `Club "${unpublishedClub.name || clubId}" is not yet activated. Please click the Pay button below to activate.`;
              return;
            }
          }
        } catch {
          // Ignore secondary fetch error, fall through to generic error handling
        }
      }

      // Extract the real error message (Directus SDK, Error, or string)
      const rawErr = err as {
        errors?: { message?: string }[];
        message?: string;
        response?: { status?: number };
      };
      const realMsg =
        rawErr?.errors?.[0]?.message ||
        rawErr?.message ||
        (typeof err === 'string' ? err : 'Unknown error');
      const statusCode = rawErr?.response?.status;
      const actuallyOffline = !navigator.onLine;

      console.error(
        `[loadClubData] failed (status: ${statusCode ?? 'n/a'}, online: ${navigator.onLine}):`,
        realMsg,
        err,
      );

      // If cache was already restored at the start, just notify — app is usable
      if (hasCache) {
        notify({
          color: 'warning',
          message: actuallyOffline
            ? 'Offline — showing cached club data'
            : `Could not refresh club data: ${realMsg}`,
        });
      } else {
        // No cache available — try offline fallback one more time
        const cached = LocalStorage.getItem('matchmaking_state') as Record<
          string,
          unknown
        > | null;
        if (cached && Object.keys(cached).length > 0) {
          if (restoreFromCache(clubId)) {
            clubStatus.value = 'published';
            clubLoadingState.value = 'loaded';
            notify({
              color: 'warning',
              message: actuallyOffline
                ? 'Offline — showing cached club data'
                : `Could not load club: ${realMsg}`,
            });
            return;
          }
        }
        clubLoadingState.value = 'error';
        clubErrorMessage.value =
          'Failed to load club data. No cached data available.';
      }
    }
  };

  return {
    currentClubId,
    currentClubUUID,
    clubName,
    clubLogo,
    getClubLogoUrl,
    editClubName,
    editClubId,
    editClubLoading,
    clubLogoInput,
    clubLoadingState,
    clubStatus,
    clubErrorMessage,
    isCurrentUserMember,
    clubAdminIds,
    clubMembers,
    populateEditClubFields,
    refreshClubInfo,
    onLogoSelected,
    saveClubDetails,
    handleJoinClub,
    loadClubData,
    restoreFromCache,
  };
}
