import { describe, it, expect } from 'vitest';
import {
  shouldSkipSync,
  isNonAdmin,
  isClubMismatch,
  shouldMergeBeforePush,
  isEchoOfOwnWrite,
  isAdminForSync,
} from './cloudSyncHelpers';

describe('cloudSyncHelpers — shouldSkipSync', () => {
  it('skips when open play is active', () => {
    expect(shouldSkipSync(true, false, true, 'https://api.test', 'club-uuid')).toEqual({
      skip: true,
      retryPending: false,
    });
  });

  it('skips and marks retry when sync is already in progress', () => {
    expect(shouldSkipSync(false, true, true, 'https://api.test', 'club-uuid')).toEqual({
      skip: true,
      retryPending: true,
    });
  });

  it('skips when offline', () => {
    expect(shouldSkipSync(false, false, false, 'https://api.test', 'club-uuid')).toEqual({
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
    expect(shouldSkipSync(false, false, true, 'https://api.test', 'club-uuid')).toEqual({
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
