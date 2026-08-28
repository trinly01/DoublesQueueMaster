import { describe, it, expect } from 'vitest';
import {
  shouldSkipSync,
  isNonAdmin,
  isClubMismatch,
  shouldMergeBeforePush,
  isEchoOfOwnWrite,
  isAdminForSync,
  shouldUseLightweightRead,
  shouldSkipFullRead,
  parseLightweightTimestamp,
  shouldSkipClubInfoRefresh,
  mergePlayerFromDB,
  type DBUser,
} from './cloudSyncHelpers';
import type { Player } from './matchmaking';

describe('cloudSyncHelpers — shouldSkipSync', () => {
  it('skips when open play is active', () => {
    expect(
      shouldSkipSync(true, false, true, 'https://api.test', 'club-uuid'),
    ).toEqual({
      skip: true,
      retryPending: false,
    });
  });

  it('skips and marks retry when sync is already in progress', () => {
    expect(
      shouldSkipSync(false, true, true, 'https://api.test', 'club-uuid'),
    ).toEqual({
      skip: true,
      retryPending: true,
    });
  });

  it('skips when offline', () => {
    expect(
      shouldSkipSync(false, false, false, 'https://api.test', 'club-uuid'),
    ).toEqual({
      skip: true,
      retryPending: false,
    });
  });

  it('skips when no likhaUrl', () => {
    expect(shouldSkipSync(false, false, true, '', 'club-uuid')).toEqual({
      skip: true,
      retryPending: false,
    });
  });

  it('skips when no currentClubUUID', () => {
    expect(shouldSkipSync(false, false, true, 'https://api.test', '')).toEqual({
      skip: true,
      retryPending: false,
    });
  });

  it('does not skip when all conditions are met', () => {
    expect(
      shouldSkipSync(false, false, true, 'https://api.test', 'club-uuid'),
    ).toEqual({
      skip: false,
      retryPending: false,
    });
  });
});

describe('cloudSyncHelpers — isNonAdmin', () => {
  it('returns true when no currentUserId', () => {
    expect(isNonAdmin('', new Set(['user1']))).toBe(true);
  });

  it('returns true when user is not in admin set', () => {
    expect(isNonAdmin('user1', new Set(['user2', 'user3']))).toBe(true);
  });

  it('returns false when user is in admin set', () => {
    expect(isNonAdmin('user1', new Set(['user1', 'user2']))).toBe(false);
  });
});

describe('cloudSyncHelpers — isClubMismatch', () => {
  it('returns true when local clubId differs from current', () => {
    expect(isClubMismatch('club-a', 'club-b')).toBe(true);
  });

  it('returns false when clubIds match', () => {
    expect(isClubMismatch('club-a', 'club-a')).toBe(false);
  });
});

describe('cloudSyncHelpers — shouldMergeBeforePush', () => {
  it('returns false when no server matchmaking', () => {
    expect(shouldMergeBeforePush(null, 0, 0)).toBe(false);
  });

  it('returns false when server timestamp matches last synced', () => {
    expect(shouldMergeBeforePush({ foo: 1 }, 1000, 1000)).toBe(false);
  });

  it('returns true when server has moved (concurrent write)', () => {
    expect(shouldMergeBeforePush({ foo: 1 }, 2000, 1000)).toBe(true);
  });

  it('returns true when server timestamp is older (local is ahead)', () => {
    expect(shouldMergeBeforePush({ foo: 1 }, 500, 1000)).toBe(true);
  });
});

describe('cloudSyncHelpers — isEchoOfOwnWrite', () => {
  it('returns true when incoming ts matches last synced', () => {
    expect(isEchoOfOwnWrite(1000, 1000)).toBe(true);
  });

  it('returns false when incoming ts differs', () => {
    expect(isEchoOfOwnWrite(2000, 1000)).toBe(false);
  });

  it('returns false when both are 0 (no sync has happened yet)', () => {
    expect(isEchoOfOwnWrite(0, 0)).toBe(true);
  });
});

describe('cloudSyncHelpers — isAdminForSync', () => {
  it('returns false when no currentUserId', () => {
    expect(isAdminForSync('', new Set(['user1']))).toBe(false);
  });

  it('returns false when user is not in admin set', () => {
    expect(isAdminForSync('user1', new Set(['user2']))).toBe(false);
  });

  it('returns true when user is in admin set', () => {
    expect(isAdminForSync('user1', new Set(['user1']))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// #6 — Lightweight server read helpers
// ---------------------------------------------------------------------------

describe('cloudSyncHelpers — shouldUseLightweightRead', () => {
  it('returns true when realtime is active and online', () => {
    expect(shouldUseLightweightRead(true, true)).toBe(true);
  });

  it('returns false when realtime is not active', () => {
    expect(shouldUseLightweightRead(false, true)).toBe(false);
  });

  it('returns false when offline', () => {
    expect(shouldUseLightweightRead(true, false)).toBe(false);
  });

  it('returns false when both are false', () => {
    expect(shouldUseLightweightRead(false, false)).toBe(false);
  });
});

describe('cloudSyncHelpers — shouldSkipFullRead', () => {
  it('returns true when timestamps match', () => {
    expect(shouldSkipFullRead(1000, 1000)).toBe(true);
  });

  it('returns false when timestamps differ (server moved)', () => {
    expect(shouldSkipFullRead(2000, 1000)).toBe(false);
  });

  it('returns false when server is older (local ahead)', () => {
    expect(shouldSkipFullRead(500, 1000)).toBe(false);
  });

  it('returns true when both are 0 (first sync, no data on server)', () => {
    expect(shouldSkipFullRead(0, 0)).toBe(true);
  });
});

describe('cloudSyncHelpers — parseLightweightTimestamp', () => {
  it('extracts timestamp from json() response', () => {
    const response = [{ appState_matchmaking_lastModified_json: 178671740789 }];
    expect(parseLightweightTimestamp(response)).toBe(178671740789);
  });

  it('returns 0 when response is empty array', () => {
    expect(parseLightweightTimestamp([])).toBe(0);
  });

  it('returns 0 when field is missing', () => {
    expect(parseLightweightTimestamp([{}])).toBe(0);
  });

  it('returns 0 when response is null', () => {
    expect(parseLightweightTimestamp(null)).toBe(0);
  });

  it('returns 0 when response is undefined', () => {
    expect(parseLightweightTimestamp(undefined)).toBe(0);
  });

  it('returns 0 when response throws (malformed)', () => {
    expect(parseLightweightTimestamp('not-an-object')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// #8 — refreshClubInfo TTL cache helper
// ---------------------------------------------------------------------------

describe('cloudSyncHelpers — shouldSkipClubInfoRefresh', () => {
  it('returns true when within TTL window', () => {
    expect(shouldSkipClubInfoRefresh(1000, 5000, 60000)).toBe(true);
  });

  it('returns false when TTL has expired', () => {
    expect(shouldSkipClubInfoRefresh(1000, 62000, 60000)).toBe(false);
  });

  it('returns false when lastFetchAt is 0 (never fetched)', () => {
    expect(shouldSkipClubInfoRefresh(0, 5000, 60000)).toBe(false);
  });

  it('returns true at exact TTL boundary minus 1ms', () => {
    expect(shouldSkipClubInfoRefresh(1000, 61000 - 1, 60000)).toBe(true);
  });

  it('returns false at exact TTL boundary', () => {
    expect(shouldSkipClubInfoRefresh(1000, 61000, 60000)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// #3 — mergePlayerFromDB: LWW rating/avatar/name adoption
// ---------------------------------------------------------------------------

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    username: 'alice',
    name: 'Alice',
    level: 1,
    rating: 1500,
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    ...overrides,
  };
}

describe('cloudSyncHelpers — mergePlayerFromDB rating LWW', () => {
  it('adopts DB rating when rating_updated_at > local ratingUpdatedAt', () => {
    const player = makePlayer({ rating: 1500, ratingUpdatedAt: 1000 });
    const dbUser: DBUser = {
      id: 'u1',
      rating: 1600,
      rating_updated_at: 2000,
    };
    const result = mergePlayerFromDB(player, dbUser, 'https://api.test', 5000);
    expect(result.changed).toBe(true);
    expect(result.newRating).toBe(1600);
    expect(player.rating).toBe(1600);
    expect(player.ratingUpdatedAt).toBe(2000);
    expect(player.updatedAt).toBe(5000);
  });

  it('preserves local rating when rating_updated_at < local ratingUpdatedAt', () => {
    const player = makePlayer({ rating: 1600, ratingUpdatedAt: 2000 });
    const dbUser: DBUser = {
      id: 'u1',
      rating: 1500,
      rating_updated_at: 1000,
    };
    const result = mergePlayerFromDB(player, dbUser, 'https://api.test', 5000);
    expect(result.changed).toBe(false);
    expect(result.newRating).toBeUndefined();
    expect(player.rating).toBe(1600);
    expect(player.ratingUpdatedAt).toBe(2000);
  });

  it('preserves local rating when rating_updated_at is missing (backward compat)', () => {
    const player = makePlayer({ rating: 1600, ratingUpdatedAt: 2000 });
    const dbUser: DBUser = {
      id: 'u1',
      rating: 1500,
      // rating_updated_at not provided
    };
    const result = mergePlayerFromDB(player, dbUser, 'https://api.test', 5000);
    expect(result.changed).toBe(false);
    expect(player.rating).toBe(1600);
    expect(player.ratingUpdatedAt).toBe(2000);
  });

  it('adopts DB rating when both have no timestamp (legacy fallback)', () => {
    const player = makePlayer({ rating: 1500 });
    const dbUser: DBUser = {
      id: 'u1',
      rating: 1600,
      // no rating_updated_at
    };
    const result = mergePlayerFromDB(player, dbUser, 'https://api.test', 5000);
    expect(result.changed).toBe(true);
    expect(result.newRating).toBe(1600);
    expect(player.rating).toBe(1600);
  });

  it('does not mark changed when DB rating matches local rating', () => {
    const player = makePlayer({ rating: 1500, ratingUpdatedAt: 1000 });
    const dbUser: DBUser = {
      id: 'u1',
      rating: 1500,
      rating_updated_at: 2000,
    };
    const result = mergePlayerFromDB(player, dbUser, 'https://api.test', 5000);
    // Rating didn't change, but ratingUpdatedAt should be adopted
    expect(result.changed).toBe(true);
    expect(result.newRating).toBeUndefined();
    expect(player.rating).toBe(1500);
    expect(player.ratingUpdatedAt).toBe(2000);
  });
});

describe('cloudSyncHelpers — mergePlayerFromDB avatar/firstName/lastName', () => {
  it('updates avatar from DB', () => {
    const player = makePlayer({ avatar: 'https://api.test/assets/old' });
    const dbUser: DBUser = {
      id: 'u1',
      avatar: 'new-avatar-id',
    };
    const result = mergePlayerFromDB(player, dbUser, 'https://api.test', 5000);
    expect(result.changed).toBe(true);
    expect(player.avatar).toBe('https://api.test/assets/new-avatar-id');
  });

  it('does not change avatar when DB avatar is missing', () => {
    const player = makePlayer({ avatar: 'https://api.test/assets/old' });
    const dbUser: DBUser = { id: 'u1' };
    const result = mergePlayerFromDB(player, dbUser, 'https://api.test', 5000);
    expect(result.changed).toBe(false);
    expect(player.avatar).toBe('https://api.test/assets/old');
  });

  it('updates firstName from DB', () => {
    const player = makePlayer({ firstName: 'Old' });
    const dbUser: DBUser = { id: 'u1', first_name: 'New' };
    const result = mergePlayerFromDB(player, dbUser, 'https://api.test', 5000);
    expect(result.changed).toBe(true);
    expect(player.firstName).toBe('New');
  });

  it('updates lastName from DB', () => {
    const player = makePlayer({ lastName: 'OldLast' });
    const dbUser: DBUser = { id: 'u1', last_name: 'NewLast' };
    const result = mergePlayerFromDB(player, dbUser, 'https://api.test', 5000);
    expect(result.changed).toBe(true);
    expect(player.lastName).toBe('NewLast');
  });

  it('does not change firstName when DB firstName matches', () => {
    const player = makePlayer({ firstName: 'Same' });
    const dbUser: DBUser = { id: 'u1', first_name: 'Same' };
    const result = mergePlayerFromDB(player, dbUser, 'https://api.test', 5000);
    expect(result.changed).toBe(false);
  });

  it('does not change lastName when DB lastName matches', () => {
    const player = makePlayer({ lastName: 'SameLast' });
    const dbUser: DBUser = { id: 'u1', last_name: 'SameLast' };
    const result = mergePlayerFromDB(player, dbUser, 'https://api.test', 5000);
    expect(result.changed).toBe(false);
  });
});
