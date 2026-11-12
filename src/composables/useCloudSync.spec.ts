import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref, computed, nextTick, type Ref, type ComputedRef } from 'vue';
import type { Router } from 'vue-router';
import type { AppState } from 'src/services/matchmaking';
import { MatchmakingApp } from 'src/services/matchmaking';
import {
  detectServerResetAdvantage,
  applyServerResetAdvantage,
} from 'src/services/cloudSyncHelpers';
import { CLUB_PRIVILEGE_META_TTL_MS } from 'src/services/clubMembersMapper';

// ---------------------------------------------------------------------------
// Mocks — hoisted so vi.mock factories can reference them
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  handleAuthError: vi.fn(async () => false),
  request: vi.fn(),
  readItems: vi.fn(),
  updateItem: vi.fn(),
  updateItems: vi.fn(),
  subscribe: vi.fn(),
  // Captures hooks registered via registerBeforeLogoutHook (Phase 3 #16).
  beforeLogoutHooks: [] as Array<() => void | Promise<void>>,
}));

vi.mock('src/composables/useNotify', () => ({
  useNotify: () => ({ notify: mocks.notify }),
}));

vi.mock('src/composables/useAuth', () => ({
  useAuth: () => ({
    notify: vi.fn(),
    logout: vi.fn(),
    clearLocalSession: vi.fn(),
    handleAuthError: mocks.handleAuthError,
  }),
  registerBeforeLogoutHook: (hook: () => void | Promise<void>) => {
    mocks.beforeLogoutHooks.push(hook);
    return () => {
      const i = mocks.beforeLogoutHooks.indexOf(hook);
      if (i >= 0) mocks.beforeLogoutHooks.splice(i, 1);
    };
  },
}));

vi.mock('src/services/likhaClient', () => ({
  likhaClient: {
    request: mocks.request,
    connect: vi.fn(async () => {}),
    subscribe: mocks.subscribe,
  },
  LIKHA_URL: 'https://api.test',
}));

vi.mock('@likha-erp/likha-sdk', () => ({
  readItems: mocks.readItems,
  updateItem: mocks.updateItem,
  updateItems: mocks.updateItems,
}));

vi.mock('quasar', () => {
  const store = new Map<string, unknown>();
  return {
    LocalStorage: {
      getItem: (key: string) => (store.has(key) ? store.get(key) : null),
      set: (key: string, value: unknown) => {
        store.set(key, value);
      },
      remove: (key: string) => {
        store.delete(key);
      },
      has: (key: string) => store.has(key),
    },
    useQuasar: () => ({
      notify: vi.fn(),
      screen: { lt: { sm: false } },
    }),
  };
});

import { LocalStorage } from 'quasar';
import { useCloudSync, type CloudSyncContext } from './useCloudSync';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const makeState = (over: Partial<AppState> = {}): AppState =>
  ({
    teamSize: 2,
    players: {},
    queues: [],
    activeMatches: [],
    completedMatches: [],
    ...over,
  }) as AppState;

function resetAppState() {
  const s = MatchmakingApp.state as unknown as Record<string, unknown>;
  s.players = {};
  s.queues = [];
  s.activeMatches = [];
  s.completedMatches = [];
  s.completedMatchIds = [];
  s.actionLogs = [];
  s.playersResetAt = 0;
  s.statsResetAt = 0;
  s.queuesResetAt = 0;
  s.matchesResetAt = 0;
  s.completedMatchesResetAt = 0;
  s.actionLogsResetAt = 0;
  s.settingsFieldTimestamps = {};
  s.settingsUpdatedAt = 0;
  s.lastModified = 0;
  s.clubId = 'clubA';
  s.clubUUID = 'uuid-A';
  s.availableCourts = 1;
  s.autoAdvanceMatches = true;
  MatchmakingApp.suppressSettingsLog = false;
}

interface CtxRefs {
  currentClubUUID: Ref<string>;
  currentClubId: Ref<string>;
  clubAdminIds: Ref<Set<string>>;
  clubModeratorIds: Ref<Set<string>>;
  currentUserId: Ref<string>;
  isOpenPlay: ComputedRef<boolean>;
  likhaUrl: Ref<string>;
  loadClubData: ReturnType<typeof vi.fn>;
  refreshPlayerRatings: ReturnType<typeof vi.fn>;
  router: Router;
  lastSyncedServerTimestamp: Ref<number>;
  saveLastSyncedTimestamp: ReturnType<typeof vi.fn>;
}

function makeCtx(overrides: Partial<CloudSyncContext> = {}): CtxRefs {
  const refs: CtxRefs = {
    currentClubUUID: ref('uuid-A'),
    currentClubId: ref('clubA'),
    clubAdminIds: ref(new Set(['admin1'])),
    clubModeratorIds: ref(new Set<string>()),
    currentUserId: ref('admin1'),
    isOpenPlay: computed(() => false),
    likhaUrl: ref('https://api.test'),
    loadClubData: vi.fn(async () => true),
    refreshPlayerRatings: vi.fn(async () => {}),
    router: {} as Router,
    lastSyncedServerTimestamp: ref(0),
    saveLastSyncedTimestamp: vi.fn(),
  };
  return { ...refs, ...overrides } as CtxRefs;
}

/** Seed a verified club_meta_* entry (Agent C's write shape per contract §4). */
function seedVerifiedMeta(
  clubId: string,
  adminIds: string[] = ['admin1'],
  moderatorIds: string[] = [],
) {
  LocalStorage.set(`club_meta_${clubId}`, {
    clubUUID: 'uuid-A',
    adminIds,
    moderatorIds,
    members: [],
    verified: true,
    timestamp: Date.now(),
  });
}

// ---------------------------------------------------------------------------
// likhaClient.request mock plumbing
// ---------------------------------------------------------------------------

type ReadOp = {
  __op: 'read';
  collection: string;
  opts?: { fields?: unknown[] };
};
type WriteOp = {
  __op: 'write';
  collection: string;
  id?: string;
  data: unknown;
  // CAS precondition extracted from updateItems' keysOrQuery filter —
  // undefined for unconditional updateItem writes.
  casToken?: string;
};

// Per-test server fixtures. `timestampQueue`/`fullQueue` are shifted per
// matching read; when empty the defaults below apply.
let serverTimestamp = 0;
let serverMatchmaking: AppState | undefined;
let timestampQueue: number[] = [];
let fullQueue: Array<AppState | undefined> = [];
let writeError: unknown = null;
let writeCalls: WriteOp[] = [];

// CAS simulation state: the club row's date_updated token. Reads return the
// current value; a conditional write succeeds only while its casToken still
// matches, then rotates the token (a real write bumps date_updated).
const INITIAL_DATE_UPDATED = '2025-01-01T00:00:00.000Z';
let serverDateUpdated = INITIAL_DATE_UPDATED;
// 'once' rotates the token before the first write (concurrent writer lands
// in the read→PATCH gap); 'always' does it on every write.
let casConflictMode: 'never' | 'once' | 'always' = 'never';
let writeSeq = 0;
// When true, reads omit date_updated → verify probe has no CAS token.
let suppressDateUpdated = false;
// Slim CAS-probe failure injection (PR-B B2): the probe reads
// ['date_updated', 'json(appState,matchmaking.lastModified)'] — a
// timestamp-shaped read that also asks for date_updated.
//   'throw'         → the request rejects (json() alias unsupported)
//   'omitTimestamp' → row returns without the json alias key (probe's
//                     lastModified stays undefined → blob fallback)
let casProbeMode: 'normal' | 'throw' | 'omitTimestamp' = 'normal';

const isTimestampRead = (op: ReadOp): boolean =>
  (op.opts?.fields ?? []).some(
    (f) => typeof f === 'string' && f.startsWith('json('),
  );
// The CAS slim probe is the only timestamp-shaped read that also asks for
// date_updated (step-1 lightweight read + staleness poll use json() alone).
const isCasProbeRead = (op: ReadOp): boolean =>
  isTimestampRead(op) &&
  (op.opts?.fields ?? []).includes('date_updated');
const isFullRead = (op: ReadOp): boolean =>
  (op.opts?.fields ?? []).includes('appState');

function defaultRead(op: ReadOp): unknown {
  if (isTimestampRead(op)) {
    const isCasProbe = isCasProbeRead(op);
    if (isCasProbe && casProbeMode === 'omitTimestamp') {
      // json() alias key absent → probe.lastModified undefined.
      return [
        suppressDateUpdated ? {} : { date_updated: serverDateUpdated },
      ];
    }
    const row: Record<string, unknown> = {
      appState_matchmaking_lastModified_json:
        timestampQueue.length > 0
          ? timestampQueue.shift()
          : serverTimestamp,
    };
    if (isCasProbe && !suppressDateUpdated) {
      row.date_updated = serverDateUpdated;
    }
    return [row];
  }
  if (isFullRead(op)) {
    const row: Record<string, unknown> = {
      appState: {
        matchmaking:
          fullQueue.length > 0 ? fullQueue.shift() : serverMatchmaking,
      },
    };
    if (!suppressDateUpdated) row.date_updated = serverDateUpdated;
    return [row];
  }
  return [];
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAppState();
  // The mocked LocalStorage store persists for the whole file — clear every
  // key the composable/helpers can write so tests stay isolated.
  for (const key of [
    'pending_sync_clubA',
    'pending_sync_clubB',
    'club_meta_clubA',
    'club_meta_clubB',
    'matchmaking_state_clubA',
    'matchmaking_state_clubB',
    'matchmaking_state',
  ]) {
    LocalStorage.remove(key);
  }
  serverTimestamp = 0;
  serverMatchmaking = undefined;
  timestampQueue = [];
  fullQueue = [];
  writeError = null;
  writeCalls = [];
  serverDateUpdated = INITIAL_DATE_UPDATED;
  casConflictMode = 'never';
  writeSeq = 0;
  suppressDateUpdated = false;
  casProbeMode = 'normal';
  mocks.beforeLogoutHooks.length = 0;

  mocks.readItems.mockImplementation(
    (collection: string, opts?: Record<string, unknown>) => ({
      __op: 'read',
      collection,
      opts,
    }),
  );
  mocks.updateItem.mockImplementation(
    (collection: string, id: string, data: unknown) => ({
      __op: 'write',
      collection,
      id,
      data,
    }),
  );
  // updateItems(collection, keysOrQuery, item): a Query keysOrQuery becomes
  // the CAS filter — extract the date_updated precondition for the mock.
  mocks.updateItems.mockImplementation(
    (collection: string, keysOrQuery: unknown, data: unknown) => {
      const filter = (
        keysOrQuery as {
          filter?: { id?: { _eq?: string }; date_updated?: { _eq?: string } };
        }
      )?.filter;
      return {
        __op: 'write',
        collection,
        id: filter?.id?._eq,
        data,
        casToken: filter?.date_updated?._eq,
      };
    },
  );
  mocks.request.mockImplementation(async (op: ReadOp | WriteOp) => {
    if (op?.__op === 'write') {
      const w = op as WriteOp;
      writeCalls.push(w);
      if (writeError) throw writeError;
      if (w.casToken !== undefined) {
        // Simulate Directus' conditional UPDATE: a concurrent writer
        // rotating date_updated between probe and PATCH makes the
        // precondition stale → empty result, no write.
        if (casConflictMode !== 'never') {
          if (casConflictMode === 'once') casConflictMode = 'never';
          serverDateUpdated = `concurrent-${++writeSeq}`;
        }
        if (w.casToken !== serverDateUpdated) return [];
        // Write lands → date_updated rotates.
        serverDateUpdated = `write-${++writeSeq}`;
        return [{ id: 'club-row' }];
      }
      return {};
    }
    const readOp = op as ReadOp;
    if (casProbeMode === 'throw' && isCasProbeRead(readOp)) {
      throw new Error('json() field function unsupported');
    }
    return defaultRead(readOp);
  });
});

afterEach(() => {
  vi.useRealTimers();
});

// ===========================================================================
// detectServerResetAdvantage — contract §1 unit specs
// ===========================================================================

describe('detectServerResetAdvantage', () => {
  it('returns all-false when neither side has checkpoints', () => {
    const advantage = detectServerResetAdvantage(makeState(), makeState());
    expect(advantage).toEqual({
      players: false,
      queues: false,
      matches: false,
      completedMatches: false,
      actionLogs: false,
      stats: false,
    });
  });

  it('returns all-false when checkpoints are equal (strict >, not >=)', () => {
    const local = makeState({
      playersResetAt: 5000,
      queuesResetAt: 5000,
      matchesResetAt: 5000,
      completedMatchesResetAt: 5000,
      actionLogsResetAt: 5000,
      statsResetAt: 5000,
    });
    const server = makeState({
      playersResetAt: 5000,
      queuesResetAt: 5000,
      matchesResetAt: 5000,
      completedMatchesResetAt: 5000,
      actionLogsResetAt: 5000,
      statsResetAt: 5000,
    });
    expect(detectServerResetAdvantage(local, server)).toEqual({
      players: false,
      queues: false,
      matches: false,
      completedMatches: false,
      actionLogs: false,
      stats: false,
    });
  });

  it('returns all-false when local checkpoints are newer', () => {
    const local = makeState({
      playersResetAt: 9000,
      queuesResetAt: 9000,
      matchesResetAt: 9000,
      completedMatchesResetAt: 9000,
      actionLogsResetAt: 9000,
      statsResetAt: 9000,
    });
    const server = makeState({
      playersResetAt: 5000,
      queuesResetAt: 5000,
      matchesResetAt: 5000,
      completedMatchesResetAt: 5000,
      actionLogsResetAt: 5000,
      statsResetAt: 5000,
    });
    expect(detectServerResetAdvantage(local, server)).toEqual({
      players: false,
      queues: false,
      matches: false,
      completedMatches: false,
      actionLogs: false,
      stats: false,
    });
  });

  it('flags every collection when all server checkpoints are newer', () => {
    const local = makeState({
      playersResetAt: 1000,
      queuesResetAt: 1000,
      matchesResetAt: 1000,
      completedMatchesResetAt: 1000,
      actionLogsResetAt: 1000,
      statsResetAt: 1000,
    });
    const server = makeState({
      playersResetAt: 2000,
      queuesResetAt: 2000,
      matchesResetAt: 2000,
      completedMatchesResetAt: 2000,
      actionLogsResetAt: 2000,
      statsResetAt: 2000,
    });
    expect(detectServerResetAdvantage(local, server)).toEqual({
      players: true,
      queues: true,
      matches: true,
      completedMatches: true,
      actionLogs: true,
      stats: true,
    });
  });

  it('flags collections independently', () => {
    const local = makeState({ playersResetAt: 100 });
    const server = makeState({
      playersResetAt: 200,
      statsResetAt: 300,
    });
    const advantage = detectServerResetAdvantage(local, server);
    expect(advantage.players).toBe(true);
    expect(advantage.stats).toBe(true);
    expect(advantage.queues).toBe(false);
    expect(advantage.matches).toBe(false);
    expect(advantage.completedMatches).toBe(false);
    expect(advantage.actionLogs).toBe(false);
  });

  it('treats missing/undefined checkpoint fields as 0', () => {
    // Server has a checkpoint, local field absent → advantage.
    const advantage = detectServerResetAdvantage(
      makeState(),
      makeState({ actionLogsResetAt: 42 }),
    );
    expect(advantage.actionLogs).toBe(true);
    expect(advantage.players).toBe(false);

    // Local has a checkpoint, server field absent → no advantage.
    const reverse = detectServerResetAdvantage(
      makeState({ queuesResetAt: 42 }),
      makeState(),
    );
    expect(reverse.queues).toBe(false);
  });

  it('does not use Date.now — comparison is pure stored-epoch values', () => {
    // A server checkpoint "in the future" relative to wall-clock still only
    // wins by value comparison; there is no now() involved. We can't assert
    // the absence of Date.now directly, but a far-future server checkpoint
    // vs local 0 must flag (value comparison, not plausibility check).
    const advantage = detectServerResetAdvantage(
      makeState(),
      makeState({ playersResetAt: 8_000_000_000_000 }),
    );
    expect(advantage.players).toBe(true);
  });

  describe('completedMatches effective winner (field vs settingsFieldTimestamps)', () => {
    it('server stamp beats local field even when server field is lower', () => {
      // Path-3 shape: local field regressed but local has NO stamp; server
      // field is 0 but its stamp survives → effective server 9000 > 8000.
      const local = makeState({ completedMatchesResetAt: 8000 });
      const server = makeState({
        completedMatchesResetAt: 0,
        settingsFieldTimestamps: { completedMatchesResetAt: 9000 },
      });
      expect(detectServerResetAdvantage(local, server).completedMatches).toBe(
        true,
      );
    });

    it('local stamp beats server field — no false advantage', () => {
      // Local stamp 9500 survives a regressed local field (0); server field
      // 9000 with no stamp → local effective 9500 > server 9000 → false.
      const local = makeState({
        completedMatchesResetAt: 0,
        settingsFieldTimestamps: { completedMatchesResetAt: 9500 },
      });
      const server = makeState({ completedMatchesResetAt: 9000 });
      expect(detectServerResetAdvantage(local, server).completedMatches).toBe(
        false,
      );
    });

    it('max() per side: higher stamp on either side wins the comparison', () => {
      // local: field 100, stamp 7000 → eff 7000
      // server: field 6000, stamp 8000 → eff 8000 → advantage
      const local = makeState({
        completedMatchesResetAt: 100,
        settingsFieldTimestamps: { completedMatchesResetAt: 7000 },
      });
      const server = makeState({
        completedMatchesResetAt: 6000,
        settingsFieldTimestamps: { completedMatchesResetAt: 8000 },
      });
      expect(detectServerResetAdvantage(local, server).completedMatches).toBe(
        true,
      );
    });

    it('equal effective values do not flag (strict >)', () => {
      const local = makeState({
        completedMatchesResetAt: 5000,
        settingsFieldTimestamps: { completedMatchesResetAt: 4000 },
      });
      const server = makeState({
        completedMatchesResetAt: 0,
        settingsFieldTimestamps: { completedMatchesResetAt: 5000 },
      });
      // local eff = max(5000,4000)=5000; server eff = max(0,5000)=5000 → equal
      expect(detectServerResetAdvantage(local, server).completedMatches).toBe(
        false,
      );
    });
  });
});

// ===========================================================================
// applyServerResetAdvantage — contract §2 unit specs
// ===========================================================================

describe('applyServerResetAdvantage', () => {
  it('replaces flagged collections wholesale and adopts checkpoints verbatim', () => {
    const merged = makeState({
      players: { ghost: { username: 'ghost' } } as never,
      playersResetAt: 100,
      queues: [{ id: 'lq' }] as never,
      queuesResetAt: 100,
    });
    const server = makeState({
      players: {},
      playersResetAt: 9000,
      queues: [{ id: 'sq' }] as never,
      queuesResetAt: 9000,
    });
    const advantage = {
      players: true,
      queues: true,
      matches: false,
      completedMatches: false,
      actionLogs: false,
      stats: false,
    };
    applyServerResetAdvantage(merged, server, advantage);
    expect(merged.players).toEqual({});
    expect(merged.playersResetAt).toBe(9000);
    expect(merged.queues).toEqual([{ id: 'sq' }]);
    expect(merged.queuesResetAt).toBe(9000);
  });

  it('leaves unflagged collections and checkpoints on the merge result', () => {
    const merged = makeState({
      players: { keep: { username: 'keep' } } as never,
      playersResetAt: 100,
      queuesResetAt: 100,
    });
    const server = makeState({
      players: {},
      playersResetAt: 9000,
      queuesResetAt: 9000,
    });
    const advantage = {
      players: false,
      queues: true,
      matches: false,
      completedMatches: false,
      actionLogs: false,
      stats: false,
    };
    applyServerResetAdvantage(merged, server, advantage);
    // players untouched (merge result preserved)
    expect(merged.players).toEqual({ keep: { username: 'keep' } });
    expect(merged.playersResetAt).toBe(100);
    // queues flagged → server wins
    expect(merged.queuesResetAt).toBe(9000);
  });

  it('completedMatches carries field + settingsFieldTimestamps stamp + ids', () => {
    const merged = makeState({
      completedMatches: [{ matchId: 'local' }] as never,
      completedMatchIds: ['local'],
      completedMatchesResetAt: 100,
      settingsFieldTimestamps: { completedMatchesResetAt: 100, other: 5 },
    });
    const server = makeState({
      completedMatches: [],
      completedMatchIds: [],
      completedMatchesResetAt: 0, // regressed field — stamp carries the epoch
      settingsFieldTimestamps: { completedMatchesResetAt: 9000 },
    });
    const advantage = {
      players: false,
      queues: false,
      matches: false,
      completedMatches: true,
      actionLogs: false,
      stats: false,
    };
    applyServerResetAdvantage(merged, server, advantage);
    expect(merged.completedMatches).toEqual([]);
    expect(merged.completedMatchIds).toEqual([]);
    expect(merged.completedMatchesResetAt).toBe(0); // verbatim
    expect(merged.settingsFieldTimestamps).toEqual({
      completedMatchesResetAt: 9000, // server stamp carried
      other: 5, // unrelated merged stamps preserved
    });
  });

  it('keeps merged completedMatchIds when the server blob lacks the field', () => {
    const merged = makeState({
      completedMatchIds: ['keep-me'],
      completedMatchesResetAt: 100,
    });
    const server = makeState({ completedMatchesResetAt: 9000 });
    // server.completedMatchIds === undefined → legacy blob, keep merge result
    applyServerResetAdvantage(merged, server, {
      players: false,
      queues: false,
      matches: false,
      completedMatches: true,
      actionLogs: false,
      stats: false,
    });
    expect(merged.completedMatchIds).toEqual(['keep-me']);
    expect(merged.completedMatchesResetAt).toBe(9000);
  });

  it('stats flag adopts only the checkpoint (stat blocks purge via epoch)', () => {
    const merged = makeState({
      players: { p: { username: 'p' } } as never,
      statsResetAt: 100,
    });
    const server = makeState({ statsResetAt: 9000 });
    applyServerResetAdvantage(merged, server, {
      players: false,
      queues: false,
      matches: false,
      completedMatches: false,
      actionLogs: false,
      stats: true,
    });
    expect(merged.statsResetAt).toBe(9000);
    expect(merged.players).toEqual({ p: { username: 'p' } });
  });
});

// ===========================================================================
// useCloudSync — privilege fail-closed (contract §4)
// ===========================================================================

describe('useCloudSync — privilege fail-closed', () => {
  function setupSync() {
    const refs = makeCtx();
    const sync = useCloudSync(refs as unknown as CloudSyncContext);
    sync.isOnline.value = true;
    return { refs, sync };
  }

  it('blocks push when no club_meta entry exists (unverified)', async () => {
    const { sync } = setupSync();
    // No meta seeded at all.
    await sync.performCloudSync();
    expect(writeCalls).toHaveLength(0);
    expect(sync.hasPendingCloudSync.value).toBe(false);
  });

  it('blocks push when meta lacks the verified flag (legacy cache)', async () => {
    LocalStorage.set('club_meta_clubA', {
      clubUUID: 'uuid-A',
      adminIds: ['admin1'],
      moderatorIds: [],
      // verified absent → unverified → no push
    });
    const { sync } = setupSync();
    await sync.performCloudSync();
    expect(writeCalls).toHaveLength(0);
  });

  it('blocks push when meta.verified is false', async () => {
    LocalStorage.set('club_meta_clubA', {
      clubUUID: 'uuid-A',
      adminIds: ['admin1'],
      moderatorIds: [],
      verified: false,
    });
    const { sync } = setupSync();
    await sync.performCloudSync();
    expect(writeCalls).toHaveLength(0);
  });

  it('blocks push for a demoted user: refs seeded but verified meta ids exclude them', async () => {
    // UI-seeded refs still list admin1 (cached), but the verified snapshot —
    // written after a fresh server fetch — no longer contains them.
    seedVerifiedMeta('clubA', ['otherAdmin'], []);
    const { sync } = setupSync();
    await sync.performCloudSync();
    expect(writeCalls).toHaveLength(0);
    expect(sync.hasPendingCloudSync.value).toBe(false);
  });

  it('allows push when verified meta lists the user as admin', async () => {
    seedVerifiedMeta('clubA', ['admin1'], []);
    serverMatchmaking = makeState({ lastModified: 100 });
    serverTimestamp = 100;
    const { refs, sync } = setupSync();
    refs.lastSyncedServerTimestamp.value = 100;
    await sync.performCloudSync();
    expect(writeCalls).toHaveLength(1);
    expect(writeCalls[0].collection).toBe('club');
    expect(writeCalls[0].id).toBe('uuid-A');
  });

  it('allows push when verified meta lists the user as moderator', async () => {
    seedVerifiedMeta('clubA', [], ['admin1']);
    serverMatchmaking = makeState({ lastModified: 100 });
    serverTimestamp = 100;
    const { refs, sync } = setupSync();
    refs.lastSyncedServerTimestamp.value = 100;
    await sync.performCloudSync();
    expect(writeCalls).toHaveLength(1);
  });

  it('blocks push when verified meta exists but user is in neither list', async () => {
    seedVerifiedMeta('clubA', ['otherAdmin'], ['otherMod']);
    const { sync } = setupSync();
    await sync.performCloudSync();
    expect(writeCalls).toHaveLength(0);
  });

  it('blocks push when the verified meta is older than CLUB_PRIVILEGE_META_TTL_MS', async () => {
    // verified:true alone must not authorize pushes indefinitely — once
    // fresh fetches stop, the TTL expires and the gate fails closed.
    LocalStorage.set('club_meta_clubA', {
      clubUUID: 'uuid-A',
      adminIds: ['admin1'],
      moderatorIds: [],
      verified: true,
      timestamp: Date.now() - CLUB_PRIVILEGE_META_TTL_MS - 1,
    });
    const { sync } = setupSync();
    await sync.performCloudSync();
    expect(writeCalls).toHaveLength(0);
    expect(sync.hasPendingCloudSync.value).toBe(false);
  });

  it('blocks push when the verified meta timestamp is future-dated', async () => {
    // Clock skew backwards → negative age → treated as unverified.
    LocalStorage.set('club_meta_clubA', {
      clubUUID: 'uuid-A',
      adminIds: ['admin1'],
      moderatorIds: [],
      verified: true,
      timestamp: Date.now() + 60_000,
    });
    const { sync } = setupSync();
    await sync.performCloudSync();
    expect(writeCalls).toHaveLength(0);
  });

  it('blocks push when verified meta lacks a timestamp', async () => {
    LocalStorage.set('club_meta_clubA', {
      clubUUID: 'uuid-A',
      adminIds: ['admin1'],
      moderatorIds: [],
      verified: true,
      // timestamp absent → isClubPrivilegeMetaVerified fails closed
    });
    const { sync } = setupSync();
    await sync.performCloudSync();
    expect(writeCalls).toHaveLength(0);
  });
});

// ===========================================================================
// useCloudSync — reset-advantage adoption at hook points (contract §2)
// ===========================================================================

describe('useCloudSync — reset advantage adoption', () => {
  const RESET_MSG = 'Club data was reset — unsynced changes discarded';

  function setupPrivilegedSync() {
    seedVerifiedMeta('clubA', ['admin1'], []);
    const refs = makeCtx();
    const sync = useCloudSync(refs as unknown as CloudSyncContext);
    sync.isOnline.value = true;
    return { refs, sync };
  }

  it('hook b: pre-push merge wholesale-adopts flagged collections from server', async () => {
    const { refs, sync } = setupPrivilegedSync();

    // Local: dirty privileged device with a post-reset local player edit and
    // an older players checkpoint.
    MatchmakingApp.state.players = {
      ghost: {
        username: 'ghost',
        createdAt: 9500, // post-server-reset — LWW merge would KEEP it
        updatedAt: 9500,
      } as never,
    };
    MatchmakingApp.state.playersResetAt = 1000;
    MatchmakingApp.state.lastModified = 5000;
    refs.lastSyncedServerTimestamp.value = 4000;

    // Server: adopted a newer players reset; players collection is empty.
    serverMatchmaking = makeState({
      players: {},
      playersResetAt: 9000,
      lastModified: 6000,
    });
    serverTimestamp = 6000;
    // The CAS verify probe re-reads the same row (lm 6000) → agrees with the
    // observed timestamp → no fresh re-merge before the conditional PATCH.

    await sync.performCloudSync();

    // Wholesale adoption: the post-reset local player is DISCARDED (server's
    // empty players wins) — plain mergeAppState would have kept it.
    expect(MatchmakingApp.state.players).toEqual({});
    expect(MatchmakingApp.state.playersResetAt).toBe(9000);
    // Unflagged collections stay on LWW merge — queuesResetAt untouched (0).
    expect(MatchmakingApp.state.queuesResetAt).toBe(0);
    // User notified.
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: RESET_MSG }),
    );
    // Push went out with the adopted checkpoint.
    expect(writeCalls).toHaveLength(1);
    const pushed = (writeCalls[0].data as { appState: { matchmaking: AppState } })
      .appState.matchmaking;
    expect(pushed.playersResetAt).toBe(9000);
    expect(pushed.players).toEqual({});
  });

  it('hook b: unflagged reset advantage does not fire notify or adopt', async () => {
    const { refs, sync } = setupPrivilegedSync();
    MatchmakingApp.state.lastModified = 5000;
    refs.lastSyncedServerTimestamp.value = 4000;
    // Server moved but has NO checkpoint advantage → plain merge path.
    serverMatchmaking = makeState({ lastModified: 6000 });
    serverTimestamp = 6000;

    await sync.performCloudSync();

    expect(mocks.notify).not.toHaveBeenCalledWith(
      expect.objectContaining({ message: RESET_MSG }),
    );
    expect(writeCalls).toHaveLength(1);
  });

  it('hook c: verify re-merge adopts reset advantage from fresh server state', async () => {
    const { refs, sync } = setupPrivilegedSync();
    MatchmakingApp.state.lastModified = 5000;
    MatchmakingApp.state.clubId = 'clubA';
    refs.lastSyncedServerTimestamp.value = 4000;

    // First server read: moved but no reset advantage.
    const firstRead = makeState({ lastModified: 6000 });
    // The CAS verify probe reports the server moved AGAIN mid-sync (lm 7000
    // vs observed 6000); the fresh state then carries the reset advantage.
    const freshRead = makeState({
      players: {},
      playersResetAt: 9000,
      actionLogsResetAt: 9000,
      actionLogs: [],
      lastModified: 7000,
    });
    fullQueue = [firstRead, freshRead];

    await sync.performCloudSync();

    expect(MatchmakingApp.state.playersResetAt).toBe(9000);
    expect(MatchmakingApp.state.actionLogsResetAt).toBe(9000);
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: RESET_MSG }),
    );
    expect(writeCalls).toHaveLength(1);
  });

  it('hook a: realtime/poll path adopts reset advantage for privileged+dirty device', async () => {
    const { refs, sync } = setupPrivilegedSync();

    // Dirty privileged local state.
    MatchmakingApp.state.players = {
      localOnly: {
        username: 'localOnly',
        createdAt: 9500,
        updatedAt: 9500,
      } as never,
    };
    MatchmakingApp.state.playersResetAt = 1000;
    MatchmakingApp.state.lastModified = 8000;
    refs.lastSyncedServerTimestamp.value = 5000;

    // Server payload arriving via poll: newer reset adopted, players wiped.
    serverTimestamp = 9000;
    serverMatchmaking = makeState({
      players: {},
      playersResetAt: 9500,
      lastModified: 9000,
    });

    await sync.pollServerState();

    expect(MatchmakingApp.state.players).toEqual({});
    expect(MatchmakingApp.state.playersResetAt).toBe(9500);
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: RESET_MSG }),
    );
    // Durable marker armed — the merge result still owes the server a push.
    expect(LocalStorage.getItem('pending_sync_clubA')).not.toBeNull();
  });
});

// ===========================================================================
// useCloudSync — poll-on-failed-push (pending blocks push-dedup, not pull)
// ===========================================================================

describe('useCloudSync — poll while pending', () => {
  function setupSync() {
    seedVerifiedMeta('clubA', ['admin1'], []);
    const refs = makeCtx();
    const sync = useCloudSync(refs as unknown as CloudSyncContext);
    sync.isOnline.value = true;
    return { refs, sync };
  }

  it('skips the poll while a push is merely armed (not failed)', async () => {
    const { sync } = setupSync();
    sync.hasPendingCloudSync.value = true; // armed, pushFailed === false
    await sync.pollServerState();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('pulls server state while pending-from-failure', async () => {
    const { refs, sync } = setupSync();
    refs.lastSyncedServerTimestamp.value = 100;

    // Server read + CAS verify probe succeed, but the PUSH fails.
    serverMatchmaking = makeState({ lastModified: 100 });
    serverTimestamp = 100;
    writeError = new Error('network down');

    await sync.performCloudSync();
    expect(sync.hasPendingCloudSync.value).toBe(true);
    expect(writeCalls).toHaveLength(1);

    // Now the server moves (another admin pushed). The poll must pull even
    // though hasPendingCloudSync is still true.
    mocks.request.mockClear();
    serverTimestamp = 500;
    serverMatchmaking = makeState({
      queues: [{ id: 'sq', updatedAt: 500 }] as never,
      lastModified: 500,
    });

    await sync.pollServerState();

    // Poll performed reads (timestamp probe + full pull) instead of skipping.
    expect(mocks.request).toHaveBeenCalled();
    const readOps = mocks.readItems.mock.calls.length;
    expect(readOps).toBeGreaterThan(0);
    // applyServerMatchmaking ran: lastSynced advanced to the pulled ts.
    expect(refs.lastSyncedServerTimestamp.value).toBe(500);
  });

  it('keeps unpushed edits through repeated pull-merges while pending-from-failure', async () => {
    const { refs, sync } = setupSync();
    refs.lastSyncedServerTimestamp.value = 100;

    // Local dirty edit that has never reached the server.
    MatchmakingApp.state.queues = [
      { id: 'localQ', username: 'p1', updatedAt: 900 } as never,
    ];
    MatchmakingApp.state.lastModified = 900;

    serverMatchmaking = makeState({ lastModified: 100 });
    serverTimestamp = 100;
    writeError = new Error('network down');
    await sync.performCloudSync();
    expect(sync.hasPendingCloudSync.value).toBe(true);

    // First pull-merge: server moved to 500. Local edit must survive the
    // merge (dirty via hasPendingCloudSync even though lastModified may now
    // equal lastSynced after the merge).
    mocks.request.mockClear();
    serverTimestamp = 500;
    serverMatchmaking = makeState({
      queues: [{ id: 'serverQ', username: 'p2', updatedAt: 500 }] as never,
      lastModified: 500,
    });
    await sync.pollServerState();

    const queueIds = (
      MatchmakingApp.state.queues as unknown as Array<{ id: string }>
    ).map((q) => q.id);
    // Local unpushed entry survived the merge alongside the server entry.
    expect(queueIds).toContain('localQ');

    // Second pull while STILL pending-from-failure: lastModified == lastSynced
    // now, but pending keeps the device on the merge branch — the edit must
    // not be overwritten by a server-wins branch.
    mocks.request.mockClear();
    serverTimestamp = 600;
    serverMatchmaking = makeState({
      queues: [{ id: 'serverQ2', username: 'p3', updatedAt: 600 }] as never,
      lastModified: 600,
    });
    await sync.pollServerState();

    const queueIds2 = (
      MatchmakingApp.state.queues as unknown as Array<{ id: string }>
    ).map((q) => q.id);
    expect(queueIds2).toContain('localQ');
  });
});

// ===========================================================================
// useCloudSync — durable per-club pending marker (Phase 3 #15)
// ===========================================================================

describe('useCloudSync — pending-sync durability', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('re-arms hasPendingCloudSync on mount when a pending marker exists', async () => {
    LocalStorage.set('pending_sync_clubA', Date.now());
    const refs = makeCtx();
    MatchmakingApp.state.clubId = 'clubA';
    const sync = useCloudSync(refs as unknown as CloudSyncContext);
    sync.isOnline.value = true;
    await nextTick();
    expect(sync.hasPendingCloudSync.value).toBe(true);
  });

  it('does not re-arm when no marker exists', async () => {
    const refs = makeCtx();
    MatchmakingApp.state.clubId = 'clubA';
    const sync = useCloudSync(refs as unknown as CloudSyncContext);
    sync.isOnline.value = true;
    await nextTick();
    expect(sync.hasPendingCloudSync.value).toBe(false);
  });

  it('does not re-arm for a different club’s marker', async () => {
    LocalStorage.set('pending_sync_clubB', Date.now());
    const refs = makeCtx(); // currentClubId = 'clubA'
    MatchmakingApp.state.clubId = 'clubA';
    const sync = useCloudSync(refs as unknown as CloudSyncContext);
    sync.isOnline.value = true;
    await nextTick();
    expect(sync.hasPendingCloudSync.value).toBe(false);
  });

  it('does not re-arm while local state belongs to a different club', async () => {
    LocalStorage.set('pending_sync_clubA', Date.now());
    const refs = makeCtx();
    MatchmakingApp.state.clubId = 'clubB'; // state not yet switched to A
    const sync = useCloudSync(refs as unknown as CloudSyncContext);
    sync.isOnline.value = true;
    await nextTick();
    expect(sync.hasPendingCloudSync.value).toBe(false);
  });

  it('clears the durable marker after a successful push', async () => {
    seedVerifiedMeta('clubA', ['admin1'], []);
    LocalStorage.set('pending_sync_clubA', Date.now());
    const refs = makeCtx();
    refs.lastSyncedServerTimestamp.value = 100;
    serverMatchmaking = makeState({ lastModified: 100 });
    serverTimestamp = 100;
    const sync = useCloudSync(refs as unknown as CloudSyncContext);
    sync.isOnline.value = true;
    await nextTick();
    expect(sync.hasPendingCloudSync.value).toBe(true); // re-armed

    await sync.performCloudSync();
    expect(writeCalls).toHaveLength(1);
    expect(LocalStorage.getItem('pending_sync_clubA')).toBeNull();
    expect(sync.hasPendingCloudSync.value).toBe(false);
  });

  it('keeps the durable marker after a failed push', async () => {
    seedVerifiedMeta('clubA', ['admin1'], []);
    const refs = makeCtx();
    refs.lastSyncedServerTimestamp.value = 100;
    serverMatchmaking = makeState({ lastModified: 100 });
    serverTimestamp = 100;
    writeError = new Error('boom');
    const sync = useCloudSync(refs as unknown as CloudSyncContext);
    sync.isOnline.value = true;

    await sync.performCloudSync();
    expect(writeCalls).toHaveLength(1);
    expect(LocalStorage.getItem('pending_sync_clubA')).not.toBeNull();
    expect(sync.hasPendingCloudSync.value).toBe(true);
  });
});

// ===========================================================================
// useCloudSync — CAS precondition on the push (conditional PATCH)
// ===========================================================================

describe('useCloudSync — CAS precondition', () => {
  const RESET_MSG = 'Club data was reset — unsynced changes discarded';

  function setupCasSync() {
    seedVerifiedMeta('clubA', ['admin1'], []);
    const refs = makeCtx();
    const sync = useCloudSync(refs as unknown as CloudSyncContext);
    sync.isOnline.value = true;
    return { refs, sync };
  }

  it('pushes via a conditional PATCH carrying the verify-read date_updated', async () => {
    const { refs, sync } = setupCasSync();
    refs.lastSyncedServerTimestamp.value = 100;
    serverMatchmaking = makeState({ lastModified: 100 });
    serverTimestamp = 100;

    await sync.performCloudSync();

    expect(writeCalls).toHaveLength(1);
    expect(writeCalls[0].collection).toBe('club');
    expect(writeCalls[0].id).toBe('uuid-A');
    // The CAS token came from the verify probe's date_updated field.
    expect(writeCalls[0].casToken).toBe(INITIAL_DATE_UPDATED);
    expect(sync.hasPendingCloudSync.value).toBe(false);
  });

  it('on CAS conflict re-fetches, reset-merges, and re-pushes once', async () => {
    const { refs, sync } = setupCasSync();
    refs.lastSyncedServerTimestamp.value = 100;
    serverTimestamp = 100;

    // A concurrent writer lands between our verify read and the PATCH.
    casConflictMode = 'once';
    // Full reads in order: initial merge read → CAS-retry blob fallback.
    // The slim CAS probes (json()+date_updated) don't consume the blob
    // queue; lastModified stays 100 throughout so the timestamp compare
    // alone would NOT merge — only the forced post-conflict merge adopts
    // the reset advantage carried by the retry blob.
    fullQueue = [
      makeState({ lastModified: 100 }),
      makeState({
        lastModified: 100,
        actionLogsResetAt: 9000,
        actionLogs: [],
      }),
    ];

    await sync.performCloudSync();

    // Exactly two PATCH attempts — bounded retry, no loop.
    expect(writeCalls).toHaveLength(2);
    expect(writeCalls[0].casToken).toBe(INITIAL_DATE_UPDATED);
    // The retry used the rotated token observed on the re-probe.
    expect(writeCalls[1].casToken).toBe('concurrent-1');
    // mergeWithResetAdvantage ran on the retry → advantage adopted + user told.
    expect(MatchmakingApp.state.actionLogsResetAt).toBe(9000);
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: RESET_MSG }),
    );
    // Second write landed → normal success bookkeeping.
    expect(sync.hasPendingCloudSync.value).toBe(false);
    expect(LocalStorage.getItem('pending_sync_clubA')).toBeNull();
  });

  it('gives up after the bounded retry and keeps pending armed', async () => {
    const { refs, sync } = setupCasSync();
    refs.lastSyncedServerTimestamp.value = 100;
    serverMatchmaking = makeState({ lastModified: 100 });
    serverTimestamp = 100;
    casConflictMode = 'always'; // every write finds a newer row token

    await sync.performCloudSync();

    // Two PATCH attempts max, then the sync fails closed into pending.
    expect(writeCalls).toHaveLength(2);
    expect(sync.hasPendingCloudSync.value).toBe(true);
    expect(LocalStorage.getItem('pending_sync_clubA')).not.toBeNull();
  });

  it('aborts the push when the verify probe yields no CAS token', async () => {
    const { refs, sync } = setupCasSync();
    refs.lastSyncedServerTimestamp.value = 100;
    serverMatchmaking = makeState({ lastModified: 100 });
    serverTimestamp = 100;
    suppressDateUpdated = true; // row read carries no date_updated

    await sync.performCloudSync();

    // No unconditional fallback — the clobber window stays closed.
    expect(writeCalls).toHaveLength(0);
    expect(sync.hasPendingCloudSync.value).toBe(true);
  });
});

// ===========================================================================
// useCloudSync — realtime role fields (contract §4 freshness)
// ===========================================================================

describe('useCloudSync — realtime role fields', () => {
  const adminJunction = (id: string) => ({ directus_users_id: { id } });

  function mockSubscriptionSequence(messages: unknown[]) {
    mocks.subscribe.mockImplementation(async () => ({
      subscription: (async function* () {
        for (const m of messages) yield m;
        await new Promise(() => {}); // keep the stream open
      })(),
      unsubscribe: vi.fn(),
    }));
  }

  function setupRealtime() {
    seedVerifiedMeta('clubA', ['admin1'], []);
    const refs = makeCtx();
    const sync = useCloudSync(refs as unknown as CloudSyncContext);
    sync.isOnline.value = true;
    return { refs, sync };
  }

  const roleMsg = (admins: unknown[], moderators: unknown[] = []) => ({
    type: 'subscription',
    event: 'update',
    data: [
      {
        id: 'uuid-A',
        admins,
        moderators,
        appState: { matchmaking: makeState({ lastModified: 1 }) },
      },
    ],
  });

  const metaVerified = () =>
    (
      LocalStorage.getItem('club_meta_clubA') as {
        verified?: boolean;
      } | null
    )?.verified;

  it('subscribes with the admins/moderators M2M fields', async () => {
    mockSubscriptionSequence([]);
    const { sync } = setupRealtime();
    await sync.startRealtime();
    expect(mocks.subscribe).toHaveBeenCalledWith(
      'club',
      expect.objectContaining({
        query: expect.objectContaining({
          fields: expect.arrayContaining([
            'admins.directus_users_id.id',
            'moderators.directus_users_id.id',
          ]),
        }),
      }),
    );
  });

  it('seeds the role baseline on first payload without refreshing', async () => {
    mockSubscriptionSequence([roleMsg([adminJunction('admin1')])]);
    const { refs, sync } = setupRealtime();
    await sync.startRealtime();
    // lastSynced advancing proves the message was processed end-to-end.
    await vi.waitFor(() =>
      expect(refs.lastSyncedServerTimestamp.value).toBe(1),
    );
    expect(refs.loadClubData).not.toHaveBeenCalled();
    expect(metaVerified()).toBe(true);
  });

  it('invalidates verified privilege and refreshes when roles change', async () => {
    mockSubscriptionSequence([
      roleMsg([adminJunction('admin1')]), // baseline: admin1 is admin
      roleMsg([], [adminJunction('admin1')]), // demoted admin → moderator
    ]);
    const { refs, sync } = setupRealtime();
    await sync.startRealtime();
    await vi.waitFor(() =>
      expect(refs.loadClubData).toHaveBeenCalledWith('clubA'),
    );
    // Fail-closed: verified flipped off until loadClubData re-verifies.
    expect(metaVerified()).toBe(false);
  });

  it('does not refresh when the role payload is unchanged', async () => {
    mockSubscriptionSequence([
      roleMsg([adminJunction('admin1')]),
      roleMsg([adminJunction('admin1')]),
    ]);
    const { refs, sync } = setupRealtime();
    await sync.startRealtime();
    await vi.waitFor(() =>
      expect(refs.lastSyncedServerTimestamp.value).toBe(1),
    );
    // Give the second (identical) message a beat to be processed.
    await new Promise((r) => setTimeout(r, 30));
    expect(refs.loadClubData).not.toHaveBeenCalled();
    expect(metaVerified()).toBe(true);
  });

  it('ignores payloads that omit the role fields entirely', async () => {
    mockSubscriptionSequence([
      {
        type: 'subscription',
        event: 'update',
        data: [
          {
            id: 'uuid-A',
            appState: { matchmaking: makeState({ lastModified: 2 }) },
          },
        ],
      },
      {
        type: 'subscription',
        event: 'update',
        data: [
          {
            id: 'uuid-A',
            appState: { matchmaking: makeState({ lastModified: 3 }) },
          },
        ],
      },
    ]);
    const { refs, sync } = setupRealtime();
    await sync.startRealtime();
    await vi.waitFor(() =>
      expect(refs.lastSyncedServerTimestamp.value).toBe(3),
    );
    expect(refs.loadClubData).not.toHaveBeenCalled();
    expect(metaVerified()).toBe(true);
  });
});

// ===========================================================================
// useCloudSync — realtime appState coalescing (PR-B B1)
// ===========================================================================

describe('useCloudSync — realtime coalescing', () => {
  const adminJunction = (id: string) => ({ directus_users_id: { id } });

  function mockSubscriptionSequence(messages: unknown[]) {
    mocks.subscribe.mockImplementation(async () => ({
      subscription: (async function* () {
        for (const m of messages) yield m;
        await new Promise(() => {}); // keep the stream open
      })(),
      unsubscribe: vi.fn(),
    }));
  }

  function setupRealtime() {
    seedVerifiedMeta('clubA', ['admin1'], []);
    const refs = makeCtx();
    const sync = useCloudSync(refs as unknown as CloudSyncContext);
    sync.isOnline.value = true;
    return { refs, sync };
  }

  const appStateMsg = (
    matchmaking: AppState,
    extra: Record<string, unknown> = {},
  ) => ({
    type: 'subscription',
    event: 'update',
    data: [{ id: 'uuid-A', appState: { matchmaking }, ...extra }],
  });

  const roleAppStateMsg = (
    admins: unknown[],
    moderators: unknown[],
    lastModified: number,
  ) =>
    appStateMsg(makeState({ lastModified }), {
      admins,
      moderators,
    });

  const metaVerified = () =>
    (
      LocalStorage.getItem('club_meta_clubA') as {
        verified?: boolean;
      } | null
    )?.verified;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('selects by MAX lastModified, not arrival order (echo edge case)', async () => {
    // Remote write W (ts=300) arrives FIRST, then our own push echo E
    // (ts=100 == lastSynced) lands in the same window. Last-arrived-wins
    // would buffer E — applyServerMatchmaking then echo-suppresses it and
    // W is lost entirely. Max-ts keeps W.
    const remoteW = makeState({
      lastModified: 300,
      queues: [{ id: 'remoteW', updatedAt: 300 } as never],
    });
    const ownEcho = makeState({ lastModified: 100 });
    mockSubscriptionSequence([appStateMsg(remoteW), appStateMsg(ownEcho)]);
    const { refs, sync } = setupRealtime();
    refs.lastSyncedServerTimestamp.value = 100; // S — echo ts matches

    await sync.startRealtime();
    await vi.advanceTimersByTimeAsync(60); // receipt + 50ms flush window

    expect(refs.lastSyncedServerTimestamp.value).toBe(300);
    const queueIds = (
      MatchmakingApp.state.queues as unknown as Array<{ id: string }>
    ).map((q) => q.id);
    expect(queueIds).toContain('remoteW');
  });

  it('coalesces a burst into a single newest-wins apply', async () => {
    const persistSpy = vi.spyOn(MatchmakingApp, 'persistSilently');
    mockSubscriptionSequence([
      appStateMsg(
        makeState({
          lastModified: 200,
          queues: [{ id: 'q200', updatedAt: 200 } as never],
        }),
      ),
      appStateMsg(
        makeState({
          lastModified: 300,
          queues: [{ id: 'q300', updatedAt: 300 } as never],
        }),
      ),
      // Older payload arriving last must not displace the max-ts winner.
      appStateMsg(
        makeState({
          lastModified: 100,
          queues: [{ id: 'q100', updatedAt: 100 } as never],
        }),
      ),
    ]);
    const { refs, sync } = setupRealtime();

    await sync.startRealtime();
    await vi.advanceTimersByTimeAsync(60);

    expect(refs.lastSyncedServerTimestamp.value).toBe(300);
    const queueIds = (
      MatchmakingApp.state.queues as unknown as Array<{ id: string }>
    ).map((q) => q.id);
    expect(queueIds).toEqual(['q300']);
    // One flush — not one apply per message.
    expect(persistSpy).toHaveBeenCalledTimes(1);
    persistSpy.mockRestore();
  });

  it('does not apply anything before the trailing window elapses', async () => {
    mockSubscriptionSequence([
      appStateMsg(
        makeState({
          lastModified: 500,
          queues: [{ id: 'q500', updatedAt: 500 } as never],
        }),
      ),
    ]);
    const { refs, sync } = setupRealtime();

    await sync.startRealtime();
    await vi.advanceTimersByTimeAsync(10); // inside the 50ms window
    expect(refs.lastSyncedServerTimestamp.value).toBe(0);

    await vi.advanceTimersByTimeAsync(50); // window elapses → flush
    expect(refs.lastSyncedServerTimestamp.value).toBe(500);
  });

  it('flushes the buffered payload immediately on the pagehide/visibilitychange path', async () => {
    mockSubscriptionSequence([
      appStateMsg(
        makeState({
          lastModified: 700,
          queues: [{ id: 'q700', updatedAt: 700 } as never],
        }),
      ),
    ]);
    const { refs, sync } = setupRealtime();

    await sync.startRealtime();
    await vi.advanceTimersByTimeAsync(10); // received; window not elapsed
    expect(refs.lastSyncedServerTimestamp.value).toBe(0);

    // handlePageHide / handleVisibilityChange both call this — timers are
    // unreliable in hidden tabs so the flush cannot wait for the window.
    sync.flushRealtimeMatchmaking();
    expect(refs.lastSyncedServerTimestamp.value).toBe(700);
  });

  it('handles role-field diffs per-message at receipt, ahead of the flush', async () => {
    mockSubscriptionSequence([
      roleAppStateMsg([adminJunction('admin1')], [], 1), // baseline
      roleAppStateMsg([], [adminJunction('mod1')], 2), // admin→mod change
    ]);
    const { refs, sync } = setupRealtime();

    await sync.startRealtime();
    // 10ms — inside the coalesce window: appState is still buffered, but
    // the role diff already ran at RECEIPT.
    await vi.advanceTimersByTimeAsync(10);
    expect(refs.loadClubData).toHaveBeenCalledWith('clubA');
    expect(metaVerified()).toBe(false);
    expect(refs.lastSyncedServerTimestamp.value).toBe(0);

    await vi.advanceTimersByTimeAsync(50);
    // Max-ts appState (lm=2) applied on flush.
    expect(refs.lastSyncedServerTimestamp.value).toBe(2);
  });

  it('stamps stream health on receipt — the coalesce window is not staleness', async () => {
    mockSubscriptionSequence([
      roleAppStateMsg([adminJunction('admin1')], [], 1), // baseline
      roleAppStateMsg([], [adminJunction('mod1')], 2), // receipt proof
    ]);
    const { refs, sync } = setupRealtime();

    await sync.startRealtime();
    await vi.advanceTimersByTimeAsync(10);
    // Receipt proven: the role handler ran (it fires before buffering).
    expect(refs.loadClubData).toHaveBeenCalledWith('clubA');
    // The 50ms flush has NOT run — lastSynced still 0 — yet the poll must
    // see a healthy stream because lastRealtimeMessageAt stamped on receipt.
    expect(refs.lastSyncedServerTimestamp.value).toBe(0);
    mocks.request.mockClear();
    await sync.pollServerState();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('non-appState messages bypass the buffer without clearing it', async () => {
    mockSubscriptionSequence([
      appStateMsg(
        makeState({
          lastModified: 400,
          queues: [{ id: 'q400', updatedAt: 400 } as never],
        }),
      ),
      // Stripped payload — no appState.matchmaking. Must neither enter the
      // buffer nor evict the pending max-ts payload.
      {
        type: 'subscription',
        event: 'update',
        data: [{ id: 'uuid-A' }],
      },
      appStateMsg(
        makeState({
          lastModified: 500,
          queues: [{ id: 'q500', updatedAt: 500 } as never],
        }),
      ),
    ]);
    const { refs, sync } = setupRealtime();

    await sync.startRealtime();
    await vi.advanceTimersByTimeAsync(60);

    expect(refs.lastSyncedServerTimestamp.value).toBe(500);
    const queueIds = (
      MatchmakingApp.state.queues as unknown as Array<{ id: string }>
    ).map((q) => q.id);
    expect(queueIds).toEqual(['q500']);
  });
});

// ===========================================================================
// useCloudSync — CAS slim probe (PR-B B2)
// ===========================================================================

describe('useCloudSync — CAS slim probe', () => {
  function setupCasProbeSync() {
    seedVerifiedMeta('clubA', ['admin1'], []);
    const refs = makeCtx();
    const sync = useCloudSync(refs as unknown as CloudSyncContext);
    sync.isOnline.value = true;
    return { refs, sync };
  }

  const readFieldSets = () =>
    mocks.readItems.mock.calls.map(
      (c) =>
        (((c[1] as { fields?: unknown[] } | undefined)?.fields ??
          []) as unknown[]),
    );
  // Reads shaped like the slim CAS probe: date_updated + json() alias.
  const slimProbeReads = () =>
    readFieldSets().filter(
      (f) =>
        f.includes('date_updated') &&
        f.some((x) => typeof x === 'string' && x.startsWith('json(')),
    );
  // Reads that fetch the appState blob (step-1 merge read, CAS blob
  // fallback, full-probe fallback, poll pull).
  const blobReads = () =>
    readFieldSets().filter((f) => f.includes('appState'));

  it('verifies with the slim probe — no appState blob read when unchanged', async () => {
    const { refs, sync } = setupCasProbeSync();
    refs.lastSyncedServerTimestamp.value = 100;
    serverMatchmaking = makeState({ lastModified: 100 });
    serverTimestamp = 100;

    await sync.performCloudSync();

    expect(writeCalls).toHaveLength(1);
    expect(writeCalls[0].casToken).toBe(INITIAL_DATE_UPDATED);
    // Step-1 (realtime inactive) does the only blob read; the CAS verify
    // must not re-fetch appState — the slim probe covers token+moved-check.
    expect(blobReads()).toHaveLength(1);
    expect(slimProbeReads().length).toBeGreaterThanOrEqual(1);
  });

  it('fetches the full blob only when the probe timestamp moved', async () => {
    const { refs, sync } = setupCasProbeSync();
    refs.lastSyncedServerTimestamp.value = 100;
    serverTimestamp = 300; // slim probe reports the server moved
    // Step-1 blob read → lm 200; CAS blob fallback → lm 300 carrying a
    // reset advantage the verify re-merge must adopt (hook c path).
    fullQueue = [
      makeState({ lastModified: 200 }),
      makeState({
        lastModified: 300,
        queuesResetAt: 9000,
        queues: [],
      }),
    ];

    await sync.performCloudSync();

    expect(writeCalls).toHaveLength(1);
    // Exactly two blob reads: step-1 merge read + CAS blob fallback.
    expect(blobReads()).toHaveLength(2);
    expect(MatchmakingApp.state.queuesResetAt).toBe(9000);
  });

  it('falls back to the full probe when the slim probe request fails', async () => {
    const { refs, sync } = setupCasProbeSync();
    refs.lastSyncedServerTimestamp.value = 100;
    serverMatchmaking = makeState({ lastModified: 100 });
    serverTimestamp = 100;
    casProbeMode = 'throw'; // json() alias rejected outright

    await sync.performCloudSync();

    // Full-probe fallback still yields the CAS token → push lands.
    expect(writeCalls).toHaveLength(1);
    expect(writeCalls[0].casToken).toBe(INITIAL_DATE_UPDATED);
    // Step-1 blob read + the fallback probe's appState+date_updated read.
    expect(blobReads().length).toBeGreaterThanOrEqual(2);
  });

  it('falls back to the blob read when the json() alias is absent', async () => {
    const { refs, sync } = setupCasProbeSync();
    refs.lastSyncedServerTimestamp.value = 100;
    serverMatchmaking = makeState({ lastModified: 100 });
    serverTimestamp = 100;
    casProbeMode = 'omitTimestamp'; // probe row lacks the alias key

    await sync.performCloudSync();

    expect(writeCalls).toHaveLength(1);
    expect(writeCalls[0].casToken).toBe(INITIAL_DATE_UPDATED);
    // probe.lastModified undefined → blob required → second blob read.
    expect(blobReads()).toHaveLength(2);
  });
});

// ===========================================================================
// useCloudSync — pre-logout flush hook (Phase 3 #16)
// ===========================================================================

describe('useCloudSync — pre-logout flush hook', () => {
  function setupSync() {
    const refs = makeCtx();
    const sync = useCloudSync(refs as unknown as CloudSyncContext);
    sync.isOnline.value = true;
    return { refs, sync };
  }

  it('registers exactly one before-logout hook per composable instance', () => {
    setupSync();
    expect(mocks.beforeLogoutHooks).toHaveLength(1);
  });

  it('flushes a durable pending push while the token is still valid', async () => {
    seedVerifiedMeta('clubA', ['admin1'], []);
    LocalStorage.set('pending_sync_clubA', Date.now());
    const { sync } = setupSync();

    const hook = mocks.beforeLogoutHooks.at(-1);
    expect(hook).toBeDefined();
    await hook!();

    // The pending push went out through the normal gated path.
    expect(writeCalls).toHaveLength(1);
    expect(writeCalls[0].collection).toBe('club');
    expect(writeCalls[0].id).toBe('uuid-A');
    expect(sync.hasPendingCloudSync.value).toBe(false);
    expect(LocalStorage.getItem('pending_sync_clubA')).toBeNull();
  });

  it('flushes an armed debounced push immediately, bypassing the timer', async () => {
    seedVerifiedMeta('clubA', ['admin1'], []);
    vi.useFakeTimers();
    const { sync } = setupSync();

    // Arm the debounce the way a local mutation does (1500ms timer).
    MatchmakingApp.onStateChange?.();
    expect(sync.hasPendingCloudSync.value).toBe(true);

    const hook = mocks.beforeLogoutHooks.at(-1)!;
    await hook();

    // Flushed now — the armed timer was cleared, not waited out.
    expect(writeCalls).toHaveLength(1);
    expect(sync.hasPendingCloudSync.value).toBe(false);
  });

  it('no-ops when there is no pending work', async () => {
    setupSync();
    const hook = mocks.beforeLogoutHooks.at(-1)!;
    await hook();
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
