/**
 * Pure helper functions extracted from ClubPage.vue sync logic.
 * These are testable without Vue context (no refs, no closures).
 * Used by useCloudSync composable — see Step 2.0/2.1 of the maintainability refactor.
 */

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
  return (
    !!serverMatchmaking &&
    serverTimestamp !== lastSyncedServerTimestamp
  );
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
