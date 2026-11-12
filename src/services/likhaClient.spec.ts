import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock quasar LocalStorage with a key store so prefix enumeration is real.
const store = new Map<string, unknown>();
vi.mock('quasar', () => ({
  LocalStorage: {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    set: vi.fn((key: string, value: unknown) => {
      store.set(key, value);
    }),
    remove: vi.fn((key: string) => {
      store.delete(key);
    }),
    has: vi.fn((key: string) => store.has(key)),
    hasItem: vi.fn((key: string) => store.has(key)),
    getAllKeys: vi.fn(() => Array.from(store.keys())),
    getLength: vi.fn(() => store.size),
    getIndex: vi.fn(() => null),
    getKey: vi.fn(() => null),
    getAll: vi.fn(() => ({})),
  },
}));

// Mock the SDK: createLikha returns a chainable client stub with the methods
// likhaClient.ts binds/overrides at module scope.
vi.mock('@likha-erp/likha-sdk', () => ({
  createLikha: vi.fn(() => {
    const client = {
      with: vi.fn(),
      request: vi.fn(),
      refresh: vi.fn(),
      logout: vi.fn(),
      connect: vi.fn(),
      subscribe: vi.fn(),
      stopRefreshing: vi.fn(),
    };
    client.with.mockReturnValue(client);
    return client;
  }),
  authentication: vi.fn(() => ({})),
  rest: vi.fn(() => ({})),
  realtime: vi.fn(() => ({})),
}));

import {
  clearAuthSession,
  clearClubScopedCaches,
  isAuthenticated,
} from './likhaClient';

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
});

describe('clearClubScopedCaches', () => {
  it('removes club_meta_*, per-club matchmaking_state_* and the legacy key', () => {
    store.set('club_meta_club-a', { adminIds: ['u1'] });
    store.set('club_meta_club-b', { adminIds: ['u2'] });
    store.set('matchmaking_state_club-a', { players: {} });
    store.set('matchmaking_state', { players: {} }); // legacy shared key
    store.set('last_synced_ts_club-a', 12345); // sync token — kept
    store.set('player_profile', { id: 'u1' }); // cleared elsewhere — kept here
    store.set('unrelated_key', 'x');

    clearClubScopedCaches();

    expect(store.has('club_meta_club-a')).toBe(false);
    expect(store.has('club_meta_club-b')).toBe(false);
    expect(store.has('matchmaking_state_club-a')).toBe(false);
    expect(store.has('matchmaking_state')).toBe(false);
    // Non-club-scoped keys survive.
    expect(store.has('last_synced_ts_club-a')).toBe(true);
    expect(store.has('player_profile')).toBe(true);
    expect(store.has('unrelated_key')).toBe(true);
  });

  it('does not remove keys that merely share a prefix substring', () => {
    store.set('my_club_meta_x', 1);
    store.set('prefix_matchmaking_state_y', 2);
    clearClubScopedCaches();
    expect(store.has('my_club_meta_x')).toBe(true);
    expect(store.has('prefix_matchmaking_state_y')).toBe(true);
  });
});

describe('clearAuthSession', () => {
  it('clears auth indicators AND club-scoped caches together', () => {
    store.set('dink-auth', true);
    store.set('likha-data', { access_token: 'tok' });
    store.set('current_user_id', 'u1');
    store.set('club_meta_club-a', { adminIds: ['u1'] });
    store.set('matchmaking_state_club-a', { players: {} });

    clearAuthSession();

    expect(store.has('likha-data')).toBe(false);
    expect(store.has('dink-auth')).toBe(false);
    expect(store.has('current_user_id')).toBe(false);
    expect(store.has('club_meta_club-a')).toBe(false);
    expect(store.has('matchmaking_state_club-a')).toBe(false);
    expect(isAuthenticated()).toBe(false);
  });
});
