import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock quasar LocalStorage with a key store (same pattern as
// likhaClient.spec.ts) — vitest runs in node, no real localStorage.
// vi.hoisted: matchmaking.ts reads LocalStorage at module load
// (MatchmakingApp singleton), before this module body would run.
const store = vi.hoisted(() => new Map<string, unknown>());
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
  },
}));

import {
  unitFingerprint,
  computeDirtyUnits,
  captureBaseline,
  loadBaseline,
  saveBaseline,
  refreshBaselineAfterMerge,
  buildLocalForMerge,
} from './syncDirtyTracker';
import { mergeAppState } from './matchmaking';
import type {
  AppState,
  Player,
  QueueEntry,
  ActiveMatch,
  CompletedMatch,
} from './matchmaking';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makePlayer = (over: Partial<Player> = {}): Player => ({
  username: 'alice',
  level: 2,
  rating: 1500,
  matchesPlayed: 0,
  wins: 0,
  losses: 0,
  ...over,
});

const makeQueueEntry = (over: Partial<QueueEntry> = {}): QueueEntry => ({
  username: 'alice',
  queueType: 'GENERAL',
  enteredAt: 1000,
  updatedAt: 1000,
  queuedAt: 1000,
  ...over,
});

const makeMatch = (over: Partial<ActiveMatch> = {}): ActiveMatch => ({
  matchId: 'm1',
  queueSource: 'GENERAL',
  teamA: ['alice'],
  teamB: ['bob'],
  expectedDifference: 0,
  status: 'waiting',
  createdAt: 1000,
  updatedAt: 1000,
  ...over,
});

const makeCompletedMatch = (
  over: Partial<CompletedMatch> = {},
): CompletedMatch => ({
  matchId: 'm1',
  matchType: 'doubles',
  teamA: [],
  teamB: [],
  teamAScore: 0,
  teamBScore: 0,
  completedAt: 1000,
  updatedAt: 1000,
  club: 'club-1',
  ...over,
});

const makeState = (over: Partial<AppState> = {}): AppState =>
  ({
    teamSize: 2,
    players: {},
    queues: [],
    activeMatches: [],
    completedMatches: [],
    lastModified: 1000,
    ...over,
  }) as AppState;

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// unitFingerprint
// ---------------------------------------------------------------------------

describe('syncDirtyTracker — unitFingerprint', () => {
  it('is deterministic regardless of object key order', () => {
    expect(unitFingerprint({ a: 1, b: { c: 2, d: 3 } })).toBe(
      unitFingerprint({ b: { d: 3, c: 2 }, a: 1 }),
    );
  });

  it('differs when content differs', () => {
    expect(unitFingerprint({ a: 1 })).not.toBe(unitFingerprint({ a: 2 }));
    expect(unitFingerprint([1, 2])).not.toBe(unitFingerprint([2, 1]));
  });

  it('handles nested arrays/objects and scalar leaves', () => {
    const value = { list: [{ x: 1, y: [true, null, 's'] }], n: 1.5 };
    expect(unitFingerprint(value)).toBe(unitFingerprint({ ...value }));
    expect(typeof unitFingerprint(value)).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// computeDirtyUnits
// ---------------------------------------------------------------------------

describe('syncDirtyTracker — computeDirtyUnits', () => {
  it('treats every present unit as dirty when baseline is null', () => {
    const state = makeState({
      players: { alice: makePlayer() },
      queues: [makeQueueEntry()],
      completedMatches: [makeCompletedMatch({ matchId: 'm1' })],
      completedMatchIds: ['m1'],
      actionLogs: [
        {
          id: 'l1',
          action: 'test',
          performedBy: 'alice',
          performedById: 'u1',
          timestamp: 1,
        },
      ],
      sortBy: 'rating',
    });
    const dirty = computeDirtyUnits(state, null);
    expect(dirty.has('players:alice')).toBe(true);
    // Per-entity keys for the entity collections; whole-unit keys for the
    // derived/append-only companions.
    expect(dirty.has('coll:queues:alice')).toBe(true);
    expect(dirty.has('coll:completedMatches:m1')).toBe(true);
    expect(dirty.has('coll:completedMatchIds')).toBe(true);
    expect(dirty.has('coll:actionLogs')).toBe(true);
    expect(dirty.has('settings:sortBy')).toBe(true);
    // Scalar/meta keys are never units.
    expect(dirty.has('lastModified')).toBe(false);
    expect(dirty.has('teamSize')).toBe(false);
  });

  it('returns an empty set when state matches the baseline', () => {
    const state = makeState({
      players: { alice: makePlayer({ wins: 3 }) },
      queues: [makeQueueEntry()],
      sortBy: 'rating',
      availableCourts: 2,
    });
    const dirty = computeDirtyUnits(state, captureBaseline(state));
    expect(dirty.size).toBe(0);
  });

  it('flags only the edited player key (per-key granularity)', () => {
    const baselineState = makeState({
      players: {
        alice: makePlayer({ username: 'alice', wins: 1 }),
        bob: makePlayer({ username: 'bob', wins: 2 }),
      },
    });
    const baseline = captureBaseline(baselineState);
    const edited = makeState({
      players: {
        alice: makePlayer({ username: 'alice', wins: 9, updatedAt: 500 }),
        bob: makePlayer({ username: 'bob', wins: 2 }),
      },
    });
    const dirty = computeDirtyUnits(edited, baseline);
    expect(dirty.has('players:alice')).toBe(true);
    expect(dirty.has('players:bob')).toBe(false);
    expect(dirty.size).toBe(1);
  });

  it('flags a player present now but absent from baseline (local add)', () => {
    const baseline = captureBaseline(makeState({ players: {} }));
    const state = makeState({ players: { carol: makePlayer({ username: 'carol' }) } });
    const dirty = computeDirtyUnits(state, baseline);
    expect(dirty.has('players:carol')).toBe(true);
  });

  it('flags a player in baseline but absent now (local delete)', () => {
    const baseline = captureBaseline(
      makeState({ players: { alice: makePlayer() } }),
    );
    const dirty = computeDirtyUnits(makeState({ players: {} }), baseline);
    expect(dirty.has('players:alice')).toBe(true);
  });

  it('flags only the edited settings field (per-field granularity)', () => {
    const baseline = captureBaseline(
      makeState({ sortBy: 'rating', availableCourts: 2 }),
    );
    const state = makeState({ sortBy: 'wins', availableCourts: 2 });
    const dirty = computeDirtyUnits(state, baseline);
    expect(dirty.has('settings:sortBy')).toBe(true);
    expect(dirty.has('settings:availableCourts')).toBe(false);
    expect(dirty.size).toBe(1);
  });

  it('flags only the edited queue entity — per-entity granularity', () => {
    const baseline = captureBaseline(
      makeState({
        queues: [
          makeQueueEntry({
            username: 'alice',
            queuedAt: 100,
            updatedAt: 100,
          }),
          makeQueueEntry({
            username: 'bob',
            queuedAt: 200,
            updatedAt: 200,
          }),
        ],
      }),
    );
    const state = makeState({
      queues: [
        makeQueueEntry({
          username: 'alice',
          queuedAt: 100,
          updatedAt: 2000,
        }),
        makeQueueEntry({
          username: 'bob',
          queuedAt: 200,
          updatedAt: 200,
        }),
      ],
    });
    const dirty = computeDirtyUnits(state, baseline);
    expect(dirty.has('coll:queues:alice')).toBe(true);
    expect(dirty.has('coll:queues:bob')).toBe(false);
  });

  it('ignores scalar/meta key changes entirely', () => {
    const baseline = captureBaseline(
      makeState({ lastModified: 100, teamSize: 2, playersResetAt: 0 }),
    );
    const state = makeState({
      lastModified: 9999,
      playersResetAt: 5000,
      settingsUpdatedAt: 1234,
      clubUUID: 'other',
    });
    const dirty = computeDirtyUnits(state, baseline);
    expect(dirty.size).toBe(0);
  });
  it('tracks teamSize as a per-field settings unit', () => {
    const baseline = captureBaseline(makeState({ teamSize: 2 }));
    const dirty = computeDirtyUnits(makeState({ teamSize: 4 }), baseline);
    expect(dirty.has('settings:teamSize')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// captureBaseline / loadBaseline / saveBaseline
// ---------------------------------------------------------------------------

describe('syncDirtyTracker — baseline persistence', () => {
  it('round-trips a baseline through LocalStorage per clubUUID', () => {
    const state = makeState({
      players: { alice: makePlayer() },
      sortBy: 'rating',
    });
    const baseline = captureBaseline(state);
    saveBaseline('uuid-A', baseline);
    expect(loadBaseline('uuid-A')).toEqual(baseline);
    // Per-club isolation.
    expect(loadBaseline('uuid-B')).toBeNull();
  });

  it('returns null for missing or malformed stored values', () => {
    expect(loadBaseline('uuid-A')).toBeNull();
    store.set('sync_dirty_baseline_uuid-A', 'not-an-object');
    expect(loadBaseline('uuid-A')).toBeNull();
    store.set('sync_dirty_baseline_uuid-A', [1, 2, 3]);
    expect(loadBaseline('uuid-A')).toBeNull();
    store.set('sync_dirty_baseline_uuid-A', { good: 'fp', bad: 42 });
    expect(loadBaseline('uuid-A')).toEqual({ good: 'fp' });
  });

  it('no-ops on empty clubUUID', () => {
    saveBaseline('', { 'players:a': 'fp' });
    expect(loadBaseline('')).toBeNull();
    expect(store.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// refreshBaselineAfterMerge
// ---------------------------------------------------------------------------

describe('syncDirtyTracker — refreshBaselineAfterMerge', () => {
  it('re-fingerprints clean units to post-merge state, keeps dirty fingerprints', () => {
    // Baseline at last sync: alice wins=1, sortBy 'rating'.
    const baseline = captureBaseline(
      makeState({
        players: { alice: makePlayer({ wins: 1 }) },
        sortBy: 'rating',
      }),
    );
    // Pre-merge local: alice edited (dirty), sortBy untouched (clean).
    const preMergeLocal = makeState({
      players: { alice: makePlayer({ wins: 9, updatedAt: 700 }) },
      sortBy: 'rating',
    });
    const dirty = computeDirtyUnits(preMergeLocal, baseline);
    expect(dirty).toEqual(new Set(['players:alice']));

    // Post-merge state: alice kept its local edit; sortBy adopted the
    // server value 'wins' because it was clean.
    const postMerge = makeState({
      players: { alice: makePlayer({ wins: 9, updatedAt: 700 }) },
      sortBy: 'wins',
    });
    const next = refreshBaselineAfterMerge(baseline, postMerge, dirty);
    expect(next).not.toBeNull();
    const after = computeDirtyUnits(postMerge, next!);
    // Adopted sortBy is synced content → clean against the new baseline.
    expect(after.has('settings:sortBy')).toBe(false);
    // alice's edit is still owed to the server → stays dirty.
    expect(after.has('players:alice')).toBe(true);
  });

  it('returns null when there is no baseline (all-dirty first run)', () => {
    const state = makeState({ players: { alice: makePlayer() } });
    expect(refreshBaselineAfterMerge(null, state, new Set())).toBeNull();
  });

  it('returns the same baseline ref when nothing changed', () => {
    const state = makeState({ sortBy: 'rating' });
    const baseline = captureBaseline(state);
    const dirty = computeDirtyUnits(state, baseline);
    expect(refreshBaselineAfterMerge(baseline, state, dirty)).toBe(baseline);
  });
});

// ---------------------------------------------------------------------------
// buildLocalForMerge + mergeAppState — the merge-path behavior
// ---------------------------------------------------------------------------

describe('syncDirtyTracker — buildLocalForMerge', () => {
  it('clean units adopt the server version even when local stamps are newer', () => {
    // Stale-offline shape: local alice carries a HIGH client stamp but old
    // content; server alice is newer content with a lower (honest) stamp.
    const local = makeState({
      lastModified: 8000,
      players: {
        alice: makePlayer({ wins: 5, updatedAt: 9000 }),
      },
      sortBy: 'rating',
    });
    const server = makeState({
      lastModified: 9500,
      players: {
        alice: makePlayer({ wins: 9, updatedAt: 5000 }),
      },
      sortBy: 'wins',
    });
    const baseline = captureBaseline(local);
    const dirty = computeDirtyUnits(local, baseline);
    expect(dirty.size).toBe(0);

    // Pre-fix behavior: local wins on the higher stamp.
    const oldMerged = mergeAppState(local, server);
    expect(oldMerged.players.alice.wins).toBe(5);

    // Fixed: clean units are pre-seeded with server content → server wins.
    const merged = mergeAppState(
      buildLocalForMerge(local, server, dirty),
      server,
    );
    expect(merged.players.alice.wins).toBe(9);
    expect(merged.sortBy).toBe('wins');
  });

  it('dirty units still compete in LWW and keep the local edit', () => {
    const synced = makeState({
      players: { alice: makePlayer({ wins: 5, updatedAt: 4000 }) },
    });
    const baseline = captureBaseline(synced);
    // Genuine local edit after the baseline: wins 5 → 7.
    const local = makeState({
      lastModified: 8000,
      players: { alice: makePlayer({ wins: 7, updatedAt: 9000 }) },
    });
    const server = makeState({
      lastModified: 9500,
      players: { alice: makePlayer({ wins: 9, updatedAt: 5000 }) },
    });
    const dirty = computeDirtyUnits(local, baseline);
    expect(dirty.has('players:alice')).toBe(true);

    const merged = mergeAppState(
      buildLocalForMerge(local, server, dirty),
      server,
    );
    // Local edit wins LWW on its newer stamp.
    expect(merged.players.alice.wins).toBe(7);
  });

  it('baseline=null → all dirty → identical to plain mergeAppState', () => {
    const local = makeState({
      lastModified: 8000,
      players: { alice: makePlayer({ wins: 5, updatedAt: 9000 }) },
    });
    const server = makeState({
      lastModified: 9500,
      players: { alice: makePlayer({ wins: 9, updatedAt: 5000 }) },
    });
    const dirty = computeDirtyUnits(local, null);
    const merged = mergeAppState(
      buildLocalForMerge(local, server, dirty),
      server,
    );
    // Local high stamp still wins — current behavior preserved.
    expect(merged.players.alice.wins).toBe(5);
  });

  it('players granularity: editing one player leaves the others clean', () => {
    const local = makeState({
      lastModified: 8000,
      players: {
        alice: makePlayer({ username: 'alice', wins: 5, updatedAt: 9000 }),
        bob: makePlayer({ username: 'bob', wins: 1, updatedAt: 9000 }),
      },
    });
    const server = makeState({
      lastModified: 9500,
      players: {
        alice: makePlayer({ username: 'alice', wins: 9, updatedAt: 5000 }),
        bob: makePlayer({ username: 'bob', wins: 4, updatedAt: 5000 }),
      },
    });
    // Baseline has alice OLD content; local alice edited (dirty), bob clean.
    const baseline = captureBaseline(
      makeState({
        players: {
          alice: makePlayer({ username: 'alice', wins: 2, updatedAt: 3000 }),
          bob: makePlayer({ username: 'bob', wins: 1, updatedAt: 9000 }),
        },
      }),
    );
    const dirty = computeDirtyUnits(local, baseline);
    expect(dirty.has('players:alice')).toBe(true);
    expect(dirty.has('players:bob')).toBe(false);

    const merged = mergeAppState(
      buildLocalForMerge(local, server, dirty),
      server,
    );
    // alice: dirty → local edit wins LWW.
    expect(merged.players.alice.wins).toBe(5);
    // bob: clean → server version wins despite lower stamp.
    expect(merged.players.bob.wins).toBe(4);
  });

  it('settings granularity: clean fields adopt server, dirty fields LWW', () => {
    // Non-empty queues on both sides: mergeAppState's empty-state
    // "remote reset" heuristic would otherwise short-circuit the merge.
    const queue = [makeQueueEntry({ username: 'q1' })];
    const local = makeState({
      lastModified: 8000,
      sortBy: 'rating',
      matchmakingMode: 'balanced_variety',
      settingsFieldTimestamps: {
        sortBy: 9000,
        matchmakingMode: 9000,
      },
      settingsUpdatedAt: 8000,
      queues: queue,
    });
    const server = makeState({
      lastModified: 9500,
      sortBy: 'wins',
      matchmakingMode: 'strict_balance',
      settingsFieldTimestamps: {
        sortBy: 5000,
        matchmakingMode: 5000,
      },
      settingsUpdatedAt: 9000,
      queues: queue,
    });
    // Baseline: sortBy already 'rating' (clean), matchmakingMode was
    // 'strict_balance' → local change to 'balanced_variety' is dirty.
    const baseline = captureBaseline(
      makeState({
        sortBy: 'rating',
        matchmakingMode: 'strict_balance',
        settingsFieldTimestamps: {
          sortBy: 9000,
          matchmakingMode: 5000,
        },
        queues: queue,
      }),
    );
    const dirty = computeDirtyUnits(local, baseline);
    expect(dirty.has('settings:sortBy')).toBe(false);
    expect(dirty.has('settings:matchmakingMode')).toBe(true);

    const merged = mergeAppState(
      buildLocalForMerge(local, server, dirty),
      server,
    );
    // sortBy clean → server 'wins' (local stamp 9000 would have won LWW).
    expect(merged.sortBy).toBe('wins');
    // matchmakingMode dirty → local edit wins on stamp 9000 > 5000.
    expect(merged.matchmakingMode).toBe('balanced_variety');
  });

  it('clean collections adopt the server wholesale — stale local entries drop', () => {
    const local = makeState({
      lastModified: 8000,
      queues: [
        makeQueueEntry({ username: 'staleQ', updatedAt: 9000, queuedAt: 9000 }),
      ],
    });
    const server = makeState({
      lastModified: 9500,
      queues: [
        makeQueueEntry({ username: 'freshQ', updatedAt: 5000, queuedAt: 5000 }),
      ],
    });
    const baseline = captureBaseline(local); // queues clean
    const dirty = computeDirtyUnits(local, baseline);
    expect(dirty.has('coll:queues:staleQ')).toBe(false);

    const merged = mergeAppState(
      buildLocalForMerge(local, server, dirty),
      server,
    );
    const usernames = merged.queues.map((q) => q.username);
    expect(usernames).toEqual(['freshQ']);
    expect(usernames).not.toContain('staleQ');
  });

  it('dirty collections keep local entries through the normal merge', () => {
    const synced = makeState({
      queues: [makeQueueEntry({ username: 'oldQ', queuedAt: 100 })],
    });
    const baseline = captureBaseline(synced);
    const local = makeState({
      lastModified: 8000,
      queues: [
        makeQueueEntry({ username: 'oldQ', queuedAt: 100 }),
        makeQueueEntry({ username: 'newQ', queuedAt: 9000, updatedAt: 9000 }),
      ],
    });
    const server = makeState({
      lastModified: 9500,
      queues: [
        makeQueueEntry({ username: 'serverQ', queuedAt: 5000, updatedAt: 5000 }),
      ],
    });
    const dirty = computeDirtyUnits(local, baseline);
    // Per-entity: only the local-only newQ is dirty; unchanged oldQ is clean.
    expect(dirty.has('coll:queues:newQ')).toBe(true);
    expect(dirty.has('coll:queues:oldQ')).toBe(false);

    const merged = mergeAppState(
      buildLocalForMerge(local, server, dirty),
      server,
    );
    const usernames = merged.queues.map((q) => q.username).sort();
    // Per-entity merge: dirty local-only newQ appends, server serverQ is
    // adopted; clean local-only oldQ drops (absent from server).
    expect(usernames).toContain('newQ');
    expect(usernames).toContain('serverQ');
    expect(usernames).not.toContain('oldQ');
  });

  it('stale-offline simulation: clean fields take server, dirty edit survives', () => {
    // Device synced at T0 (baseline carries this device's fast-clock
    // stamps), went offline, made ONE edit, reconnected after other
    // admins pushed newer commits written by a slower clock.
    const atSync = makeState({
      players: {
        alice: makePlayer({ wins: 5, updatedAt: 9000 }),
        bob: makePlayer({ username: 'bob', wins: 2, updatedAt: 9000 }),
      },
      queues: [
        makeQueueEntry({ username: 'q1', queuedAt: 2000, updatedAt: 2000 }),
      ],
      sortBy: 'rating',
      availableCourts: 1,
    });
    const baseline = captureBaseline(atSync);

    // Offline period: the only genuine edit is bob's wins 2 → 6. alice's
    // copy is untouched carryover — fingerprint-identical to baseline.
    const local = makeState({
      lastModified: 9600,
      players: {
        alice: makePlayer({ wins: 5, updatedAt: 9000 }),
        bob: makePlayer({ username: 'bob', wins: 6, updatedAt: 9500 }),
      },
      queues: [
        makeQueueEntry({ username: 'q1', queuedAt: 2000, updatedAt: 2000 }),
      ],
      sortBy: 'rating',
      availableCourts: 1,
    });

    const server = makeState({
      lastModified: 9700,
      players: {
        alice: makePlayer({ wins: 9, updatedAt: 5000 }),
        bob: makePlayer({ username: 'bob', wins: 4, updatedAt: 5000 }),
        carol: makePlayer({ username: 'carol', wins: 1, updatedAt: 5000 }),
      },
      queues: [
        makeQueueEntry({
          username: 'serverQ',
          queuedAt: 6000,
          updatedAt: 6000,
        }),
      ],
      sortBy: 'wins',
      availableCourts: 2,
    });

    const dirty = computeDirtyUnits(local, baseline);
    expect(dirty.has('players:bob')).toBe(true); // genuine edit
    expect(dirty.has('players:alice')).toBe(false); // clean carryover
    expect(dirty.has('coll:queues:q1')).toBe(false);
    expect(dirty.has('settings:sortBy')).toBe(false);
    expect(dirty.has('settings:availableCourts')).toBe(false);

    const merged = mergeAppState(
      buildLocalForMerge(local, server, dirty),
      server,
    );
    // Clean alice → server version (wins 9), not the stale local copy.
    expect(merged.players.alice.wins).toBe(9);
    // Dirty bob → local edit wins LWW (updatedAt 9500 > 5000).
    expect(merged.players.bob.wins).toBe(6);
    // Server-only carol merges in normally.
    expect(merged.players.carol).toBeDefined();
    // Clean queues → server collection only.
    expect(merged.queues.map((q) => q.username)).toEqual(['serverQ']);
    // Clean settings → server values.
    expect(merged.sortBy).toBe('wins');
    expect(merged.availableCourts).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Per-entity collection granularity (queues / matches by entity key)
// ---------------------------------------------------------------------------

describe('syncDirtyTracker — per-entity collection granularity', () => {
  it('fingerprints entity collections per entity; ids/logs stay whole-unit', () => {
    const state = makeState({
      queues: [makeQueueEntry({ username: 'alice' })],
      activeMatches: [makeMatch({ matchId: 'm1' })],
      completedMatches: [makeCompletedMatch({ matchId: 'm2' })],
      completedMatchIds: ['m2'],
      actionLogs: [
        {
          id: 'l1',
          action: 'test',
          performedBy: 'alice',
          performedById: 'u1',
          timestamp: 1,
        },
      ],
    });
    const baseline = captureBaseline(state);
    expect(baseline['coll:queues:alice']).toBeDefined();
    expect(baseline['coll:activeMatches:m1']).toBeDefined();
    expect(baseline['coll:completedMatches:m2']).toBeDefined();
    // Whole-unit companions keep the legacy key shape.
    expect(baseline['coll:completedMatchIds']).toBeDefined();
    expect(baseline['coll:actionLogs']).toBeDefined();
    // No whole-unit keys for the entity collections.
    expect(baseline['coll:queues']).toBeUndefined();
    expect(baseline['coll:activeMatches']).toBeUndefined();
    expect(baseline['coll:completedMatches']).toBeUndefined();
  });

  it('clean queue entity adopts server inside a dirty collection; order preserved', () => {
    // Baseline: q1 synced carrying a fast-clock stamp, q2 synced.
    const baseline = captureBaseline(
      makeState({
        queues: [
          makeQueueEntry({
            username: 'q1',
            queueType: 'GENERAL',
            queuedAt: 100,
            updatedAt: 9000,
          }),
          makeQueueEntry({
            username: 'q2',
            queueType: 'GENERAL',
            queuedAt: 200,
            updatedAt: 200,
          }),
        ],
      }),
    );
    // Local: q1 untouched carryover (clean — fingerprint-identical to
    // baseline, so its 9000 stamp must NOT compete); q2 genuinely edited
    // to LOSERS (dirty, local-only — server never saw it).
    const local = makeState({
      lastModified: 8000,
      queues: [
        makeQueueEntry({
          username: 'q1',
          queueType: 'GENERAL',
          queuedAt: 100,
          updatedAt: 9000,
        }),
        makeQueueEntry({
          username: 'q2',
          queueType: 'LOSERS',
          queuedAt: 200,
          updatedAt: 9500,
        }),
      ],
    });
    const server = makeState({
      lastModified: 9600,
      queues: [
        makeQueueEntry({
          username: 'q1',
          queueType: 'WINNERS',
          queuedAt: 100,
          updatedAt: 5000,
        }),
        makeQueueEntry({
          username: 'q3',
          queueType: 'GENERAL',
          queuedAt: 300,
          updatedAt: 5000,
        }),
      ],
    });
    const dirty = computeDirtyUnits(local, baseline);
    expect(dirty.has('coll:queues:q1')).toBe(false); // clean carryover
    expect(dirty.has('coll:queues:q2')).toBe(true); // genuine edit

    const merged = mergeAppState(
      buildLocalForMerge(local, server, dirty),
      server,
    );
    const byUser = new Map(merged.queues.map((q) => [q.username, q]));
    // q1 clean → server version adopted despite the local stamp being
    // newer (whole-collection dirty tracking would have let it win).
    expect(byUser.get('q1')?.queueType).toBe('WINNERS');
    // q2 dirty local-only → appended and kept through the merge.
    expect(byUser.get('q2')?.queueType).toBe('LOSERS');
    // Server-only q3 merges in normally.
    expect(byUser.get('q3')).toBeDefined();
    // Order: server order for server entities, dirty local-only appended —
    // queue order is FIFO-semantic and must never be reordered.
    expect(merged.queues.map((q) => q.username)).toEqual(['q1', 'q3', 'q2']);
  });

  it('drops a local-only CLEAN entity — stale copy cannot resurrect', () => {
    const baseline = captureBaseline(
      makeState({
        queues: [
          makeQueueEntry({
            username: 'g1',
            queuedAt: 100,
            updatedAt: 100,
          }),
          makeQueueEntry({
            username: 'g2',
            queuedAt: 200,
            updatedAt: 200,
          }),
        ],
      }),
    );
    const local = makeState({
      queues: [
        makeQueueEntry({
          username: 'g1',
          queuedAt: 100,
          updatedAt: 100,
        }),
        makeQueueEntry({
          username: 'g2',
          queuedAt: 200,
          updatedAt: 200,
        }),
      ],
    });
    // Server no longer carries g2 (removed via tombstone then purged).
    const server = makeState({
      queues: [
        makeQueueEntry({
          username: 'g1',
          queuedAt: 100,
          updatedAt: 500,
        }),
      ],
    });
    const dirty = computeDirtyUnits(local, baseline);
    expect(dirty.size).toBe(0);

    const merged = mergeAppState(
      buildLocalForMerge(local, server, dirty),
      server,
    );
    // g2's clean local copy dropped — it cannot union-merge back.
    expect(merged.queues.map((q) => q.username)).toEqual(['g1']);
  });

  it('tombstoned queue entity re-fingerprints dirty and propagates the delete', () => {
    const baseline = captureBaseline(
      makeState({
        queues: [
          makeQueueEntry({
            username: 'alice',
            queueType: 'GENERAL',
            queuedAt: 100,
            updatedAt: 100,
          }),
        ],
      }),
    );
    // Local deleted alice via tombstone (deletedAt) — the entity keeps
    // its key, so the fingerprint change marks exactly this unit dirty.
    const local = makeState({
      queues: [
        makeQueueEntry({
          username: 'alice',
          queueType: 'GENERAL',
          queuedAt: 100,
          updatedAt: 9000,
          deletedAt: 9000,
        }),
      ],
    });
    const server = makeState({
      queues: [
        makeQueueEntry({
          username: 'alice',
          queueType: 'GENERAL',
          queuedAt: 100,
          updatedAt: 5000,
        }),
      ],
    });
    const dirty = computeDirtyUnits(local, baseline);
    expect(dirty.has('coll:queues:alice')).toBe(true);

    const merged = mergeAppState(
      buildLocalForMerge(local, server, dirty),
      server,
    );
    const alice = merged.queues.find((q) => q.username === 'alice');
    // Tombstone won LWW (deletedAt 9000 > live queuedAt 100) — the delete
    // propagates instead of being laundered away by the stale live copy.
    expect(alice?.deletedAt).toBe(9000);
  });

  it('activeMatches merge per matchId: clean adopts server, dirty LWWs, local-only appends', () => {
    // Distinct teams per match — mergeAppState's one-match-per-player
    // invariant would otherwise tombstone the shared default roster.
    const baseline = captureBaseline(
      makeState({
        // Cap ≥2 so the merged two in-progress matches aren't demoted by
        // enforceConcurrencyLimitOnState (default cap is 1).
        availableCourts: 2,
        activeMatches: [
          makeMatch({
            matchId: 'm1',
            teamA: ['a1'],
            teamB: ['b1'],
            updatedAt: 9000,
            status: 'waiting',
          }),
          makeMatch({
            matchId: 'm2',
            teamA: ['a2'],
            teamB: ['b2'],
            updatedAt: 100,
            status: 'waiting',
          }),
        ],
      }),
    );
    const local = makeState({
      lastModified: 8000,
      availableCourts: 2,
      activeMatches: [
        // m1 clean carryover — high stamp, would win LWW if it competed.
        makeMatch({
          matchId: 'm1',
          teamA: ['a1'],
          teamB: ['b1'],
          updatedAt: 9000,
          status: 'waiting',
        }),
        // m2 genuine edit — flipped status, newer stamp (dirty).
        makeMatch({
          matchId: 'm2',
          teamA: ['a2'],
          teamB: ['b2'],
          updatedAt: 9500,
          status: 'in-progress',
        }),
        // m3 brand-new local match — dirty local-only.
        makeMatch({
          matchId: 'm3',
          teamA: ['a3'],
          teamB: ['b3'],
          updatedAt: 9600,
          status: 'waiting',
        }),
      ],
    });
    const server = makeState({
      lastModified: 9700,
      availableCourts: 2,
      activeMatches: [
        makeMatch({
          matchId: 'm1',
          teamA: ['a1'],
          teamB: ['b1'],
          updatedAt: 5000,
          status: 'in-progress',
        }),
        makeMatch({
          matchId: 'm2',
          teamA: ['a2'],
          teamB: ['b2'],
          updatedAt: 5000,
          status: 'waiting',
        }),
      ],
    });
    const dirty = computeDirtyUnits(local, baseline);
    expect(dirty.has('coll:activeMatches:m1')).toBe(false);
    expect(dirty.has('coll:activeMatches:m2')).toBe(true);
    expect(dirty.has('coll:activeMatches:m3')).toBe(true);

    const merged = mergeAppState(
      buildLocalForMerge(local, server, dirty),
      server,
    );
    const byId = new Map(merged.activeMatches.map((m) => [m.matchId, m]));
    // m1 clean → server version adopted over the stale local copy.
    expect(byId.get('m1')?.status).toBe('in-progress');
    // m2 dirty → local edit wins LWW (9500 > 5000).
    expect(byId.get('m2')?.status).toBe('in-progress');
    // m3 local-only dirty → survives the merge.
    expect(byId.get('m3')?.status).toBe('waiting');
    // No match was tombstoned by the one-match-per-player invariant.
    expect(merged.activeMatches.every((m) => !m.deletedAt)).toBe(true);
    // Order: server order for shared entities, local-only appended.
    expect(merged.activeMatches.map((m) => m.matchId)).toEqual([
      'm1',
      'm2',
      'm3',
    ]);
  });

  it('missing/duplicate entity keys get stable distinct fallback units', () => {
    const dupA = makeQueueEntry({
      username: 'alice',
      queuedAt: 1,
      updatedAt: 1,
    });
    const dupB = makeQueueEntry({
      username: 'alice',
      queuedAt: 2,
      updatedAt: 2,
    });
    const noKey = {
      queueType: 'GENERAL',
      enteredAt: 3,
      updatedAt: 3,
    } as unknown as QueueEntry;
    const state = makeState({ queues: [dupA, dupB, noKey] });
    const baseline = captureBaseline(state);
    // Distinct units: bare key, occurrence suffix, index fallback.
    expect(baseline['coll:queues:alice']).toBeDefined();
    expect(baseline['coll:queues:alice#1']).toBeDefined();
    expect(baseline['coll:queues:#2']).toBeDefined();
    // Keys are deterministic — identical state fingerprints clean.
    expect(computeDirtyUnits(state, baseline).size).toBe(0);

    // Editing only the duplicate flags only its suffixed unit.
    const edited = makeState({
      queues: [dupA, { ...dupB, updatedAt: 999 }, noKey],
    });
    const dirty = computeDirtyUnits(edited, baseline);
    expect(dirty.has('coll:queues:alice#1')).toBe(true);
    expect(dirty.has('coll:queues:alice')).toBe(false);
    expect(dirty.has('coll:queues:#2')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildLocalForMerge — reset-checkpoint guard
// ---------------------------------------------------------------------------

describe('syncDirtyTracker — reset-checkpoint guard', () => {
  it('defers an uncorroborated local playersResetAt to the server when players are clean', () => {
    const local = makeState({
      playersResetAt: 9000,
      players: { alice: makePlayer() },
    });
    const server = makeState({
      playersResetAt: 5000,
      players: { alice: makePlayer({ wins: 3 }) },
    });
    const dirty = computeDirtyUnits(local, captureBaseline(local));
    const out = buildLocalForMerge(local, server, dirty);
    expect(out.playersResetAt).toBe(5000);
  });

  it('keeps the local checkpoint when the collection is dirty (pending reset)', () => {
    const baseline = captureBaseline(
      makeState({ players: { alice: makePlayer() } }),
    );
    // Local reset wiped players → coll dirty → checkpoint must survive.
    const local = makeState({ playersResetAt: 9000, players: {} });
    const server = makeState({
      playersResetAt: 5000,
      players: { alice: makePlayer() },
    });
    const dirty = computeDirtyUnits(local, baseline);
    expect(dirty.has('players:alice')).toBe(true);
    const out = buildLocalForMerge(local, server, dirty);
    expect(out.playersResetAt).toBe(9000);
  });

  it('defers a stamp-carried completedMatchesResetAt via settingsFieldTimestamps', () => {
    const local = makeState({
      completedMatchesResetAt: 0,
      settingsFieldTimestamps: { completedMatchesResetAt: 9000 },
      completedMatches: [],
    });
    const server = makeState({
      completedMatchesResetAt: 5000,
      completedMatches: [],
    });
    const dirty = computeDirtyUnits(local, captureBaseline(local));
    const out = buildLocalForMerge(local, server, dirty);
    // Effective local epoch (9000 via stamp) > server (5000) → defer.
    expect(out.completedMatchesResetAt).toBe(5000);
    expect(
      out.settingsFieldTimestamps?.['completedMatchesResetAt'],
    ).toBe(0);
  });

  it('does not fire when the server checkpoint is already newer', () => {
    const local = makeState({ queuesResetAt: 100 });
    const server = makeState({ queuesResetAt: 9000 });
    const dirty = computeDirtyUnits(local, captureBaseline(local));
    const out = buildLocalForMerge(local, server, dirty);
    // local < server → untouched; reset-advantage path handles adoption.
    expect(out.queuesResetAt).toBe(100);
  });
});
