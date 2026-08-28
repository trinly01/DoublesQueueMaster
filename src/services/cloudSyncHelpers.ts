/**
 * Pure helper functions extracted from ClubPage.vue sync logic.
 * These are testable without Vue context (no refs, no closures).
 * Used by useCloudSync composable — see Step 2.0/2.1 of the maintainability refactor.
 */

import type { Player } from './matchmaking';

/**
 * Returns true if the cloud sync should be skipped entirely.
 * Mirrors the guard logic at the top of performCloudSync.
 */
export const shouldSkipSync = (
  isOpenPlay: boolean,
  syncInProgress: boolean,
  isOnline: boolean,
  likhaUrl: string,
  currentClubUUID: string,
): { skip: boolean; retryPending: boolean } => {
  if (isOpenPlay) return { skip: true, retryPending: false };
  if (syncInProgress) return { skip: true, retryPending: true };
  if (!isOnline || !likhaUrl || !currentClubUUID)
    return { skip: true, retryPending: false };
  return { skip: false, retryPending: false };
};

/**
 * Returns true if the current user is NOT an admin (and thus should not write to cloud).
 * Mirrors the non-admin check in performCloudSync.
 */
export const isNonAdmin = (
  currentUserId: string,
  clubAdminIds: Set<string>,
): boolean => {
  return !currentUserId || !clubAdminIds.has(currentUserId);
};

/**
 * Returns true if the local state belongs to a different club (skip sync).
 * Mirrors the club mismatch check in performCloudSync.
 */
export const isClubMismatch = (
  localClubId: string,
  currentClubId: string,
): boolean => {
  return localClubId !== currentClubId;
};

/**
 * Returns true if the server has moved since our last sync (concurrent write detected).
 * Mirrors the optimistic concurrency check in performCloudSync.
 */
export const shouldMergeBeforePush = (
  serverMatchmaking: unknown,
  serverTimestamp: number,
  lastSyncedServerTimestamp: number,
): boolean => {
  return !!serverMatchmaking && serverTimestamp !== lastSyncedServerTimestamp;
};

/**
 * Returns true if the incoming realtime message is an echo of our own write (skip).
 * Mirrors the echo detection in applyServerMatchmaking.
 */
export const isEchoOfOwnWrite = (
  incomingTs: number,
  lastSyncedServerTimestamp: number,
): boolean => {
  return incomingTs === lastSyncedServerTimestamp;
};

/**
 * Returns true if the current user is an admin for sync purposes.
 * Mirrors the admin check in applyServerMatchmaking.
 */
export const isAdminForSync = (
  currentUserId: string,
  clubAdminIds: Set<string>,
): boolean => {
  return !!currentUserId && clubAdminIds.has(currentUserId);
};

// ---------------------------------------------------------------------------
// #6 — Lightweight server read helpers (when realtime is active)
// ---------------------------------------------------------------------------

/**
 * Returns true if a lightweight (timestamp-only) read should be used instead of
 * the full appState read. Requires both an active realtime subscription and
 * network connectivity — the realtime stream keeps lastSyncedServerTimestamp
 * current, so a timestamp-only check is sufficient to detect concurrent writes.
 */
export const shouldUseLightweightRead = (
  realtimeActive: boolean,
  isOnline: boolean,
): boolean => {
  return realtimeActive && isOnline;
};

/**
 * Returns true if the full appState read can be skipped because the server
 * timestamp matches our last-synced token (no concurrent writes detected).
 */
export const shouldSkipFullRead = (
  serverTimestamp: number,
  lastSyncedServerTimestamp: number,
): boolean => {
  return serverTimestamp === lastSyncedServerTimestamp;
};

/**
 * Extracts the lastModified timestamp from a json() field-function response.
 * The Directus json() alias format is {fieldname}_{jsonpath}_json, e.g.
 * appState_matchmaking_lastModified_json. Returns 0 if the response is
 * malformed or the field is absent (safe fallback — triggers full read).
 */
export const parseLightweightTimestamp = (response: unknown): number => {
  try {
    const arr = response as Record<string, unknown>[] | null | undefined;
    const data = arr?.[0] as
      | { appState_matchmaking_lastModified_json?: number }
      | undefined;
    return data?.appState_matchmaking_lastModified_json ?? 0;
  } catch {
    return 0;
  }
};

// ---------------------------------------------------------------------------
// #8 — refreshClubInfo TTL cache helper
// ---------------------------------------------------------------------------

/**
 * Returns true if a refreshClubInfo API call can be skipped because the cache
 * is still within its TTL window. Returns false if the cache has expired or
 * was never populated (lastFetchAt === 0).
 */
export const shouldSkipClubInfoRefresh = (
  lastFetchAt: number,
  now: number,
  ttl: number,
): boolean => {
  if (lastFetchAt === 0) return false;
  return now - lastFetchAt < ttl;
};

// ---------------------------------------------------------------------------
// #3 — mergePlayerFromDB: LWW rating/avatar/name adoption from DB user
// ---------------------------------------------------------------------------

/**
 * DB user shape from the club.players.directus_users_id join.
 */
export interface DBUser {
  id: string;
  rating?: number;
  rating_updated_at?: number;
  avatar?: string;
  first_name?: string;
  last_name?: string;
}

/**
 * Result of a merge attempt — the mutated player and whether anything changed.
 */
export interface MergePlayerResult {
  changed: boolean;
  newRating?: number; // if rating changed, the new value (for clubMembers sync)
}

/**
 * Merges a DB user record into an existing local player using LWW logic.
 * Mirrors the inline logic in useClubData.ts loadClubData player merge loop.
 *
 * LWW rules:
 * - Rating: adopted only when DB rating_updated_at > local ratingUpdatedAt
 *   (or both have no timestamp — legacy fallback).
 * - Avatar/firstName/lastName: always overwritten from DB if present.
 *
 * Mutates the player object in place. Returns whether anything changed and
 * the new rating (if adopted) so callers can sync clubMembers.
 */
export const mergePlayerFromDB = (
  player: Player,
  dbUser: DBUser,
  likhaUrl: string,
  now: number,
): MergePlayerResult => {
  let changed = false;
  let newRating: number | undefined;

  // --- Rating LWW ---
  const dbTs = Number(dbUser.rating_updated_at || 0);
  const localTs = Number(player.ratingUpdatedAt || 0);
  const dbIsNewer = dbTs > localTs;
  const localHasTs = localTs > 0;
  const shouldAdopt = dbTs > 0 ? dbIsNewer : !localHasTs;

  if (shouldAdopt) {
    const userRating =
      typeof dbUser.rating === 'number' ? dbUser.rating : undefined;
    if (userRating !== undefined && userRating !== player.rating) {
      player.rating = userRating || player.rating || 1450;
      if (dbTs > 0) player.ratingUpdatedAt = dbTs;
      player.updatedAt = now;
      changed = true;
      newRating = player.rating;
    } else if (dbTs > 0 && dbTs !== player.ratingUpdatedAt) {
      // Rating value matches (or DB has no rating), but DB has a newer
      // rating_updated_at — adopt the timestamp so future LWW comparisons
      // are accurate. This prevents a stale local timestamp from blocking
      // a genuinely newer DB rating on the next sync.
      player.ratingUpdatedAt = dbTs;
      changed = true;
    }
  }

  // --- Avatar ---
  if (typeof dbUser.avatar === 'string') {
    const avatarUrl = `${likhaUrl}/assets/${dbUser.avatar}`;
    if (player.avatar !== avatarUrl) {
      player.avatar = avatarUrl;
      player.updatedAt = now;
      changed = true;
    }
  }

  // --- firstName ---
  if (typeof dbUser.first_name === 'string') {
    if (player.firstName !== dbUser.first_name) {
      player.firstName = dbUser.first_name;
      player.updatedAt = now;
      changed = true;
    }
  }

  // --- lastName ---
  if (typeof dbUser.last_name === 'string') {
    if (player.lastName !== dbUser.last_name) {
      player.lastName = dbUser.last_name;
      player.updatedAt = now;
      changed = true;
    }
  }

  return { changed, newRating };
};
