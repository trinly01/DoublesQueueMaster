import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, computed } from 'vue';
import { MatchmakingApp } from 'src/services/matchmaking';
import type { AppState } from 'src/services/matchmaking';

// ---------------------------------------------------------------------------
// Shared mocks (hoisted so vi.mock factories can reference them)
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  notify: vi.fn(),
  detectAdvantage: vi.fn(),
  lsData: {} as Record<string, unknown>,
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('src/composables/useNotify', () => ({
  useNotify: () => ({ notify: mocks.notify }),
}));

vi.mock('src/composables/useAuth', () => ({
  useAuth: () => ({
    handleAuthError: vi.fn(async () => false),
  }),
}));

vi.mock('quasar', () => ({
  LocalStorage: {
    getItem: vi.fn((key: string) => mocks.lsData[key] ?? null),
    set: vi.fn((key: string, value: unknown) => {
      mocks.lsData[key] = value;
    }),
    remove: vi.fn((key: string) => {
      delete mocks.lsData[key];
    }),
    has: vi.fn((key: string) => key in mocks.lsData),
    getAllKeys: vi.fn(() => Object.keys(mocks.lsData)),
  },
}));

vi.mock('src/services/likhaClient', () => ({
  likhaClient: { request: mocks.request },
  LIKHA_URL: 'https://api.test',
}));

vi.mock('@likha-erp/likha-sdk', () => ({
  readItems: vi.fn(() => ({})),
  updateItem: vi.fn(() => ({})),
  uploadFiles: vi.fn(() => ({})),
  readMe: vi.fn(() => ({})),
  readSingleton: vi.fn(() => ({})),
}));

vi.mock('src/services/clubMembership', () => ({
  joinClub: vi.fn(async () => ({
    success: true,
    clubUUID: 'club-uuid-1',
    alreadyMember: true,
  })),
}));

// Keep the real pure helpers (mergePlayerFromDB, applyMergedState,
// collectionEqual, shouldSkipClubInfoRefresh) and stub only the Wave-1
// detection hook — Agent B implements it in cloudSyncHelpers in parallel.
vi.mock('src/services/cloudSyncHelpers', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('src/services/cloudSyncHelpers')>();
  return {
    ...actual,
    detectServerResetAdvantage: mocks.detectAdvantage,
  };
});

import { useClubData } from './useClubData';
import { LocalStorage } from 'quasar';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const CLUB_ID = 'club-1';
const CLUB_UUID = 'club-uuid-1';
const USER_ID = 'user-1';

const ALL_FLAGS = {
  players: true,
  queues: true,
  matches: true,
  completedMatches: true,
  actionLogs: true,
  stats: true,
};
const NO_FLAGS = {
  players: false,
  queues: false,
  matches: false,
  completedMatches: false,
  actionLogs: false,
  stats: false,
};

function makeServerState(overrides: Partial<AppState> = {}): AppState {
  return {
    teamSize: 2,
    players: {},
    queues: [],
    activeMatches: [],
    completedMatches: [],
    completedMatchIds: [],
    actionLogs: [],
    lastModified: 8000,
    ...overrides,
  } as AppState;
}

function makeClubPayload(serverState: AppState) {
  return [
    {
      id: CLUB_UUID,
      clubId: CLUB_ID,
      name: 'Test Club',
      logo: '',
      status: 'published',
      appState: { matchmaking: serverState },
      players: [
        {
          id: 'pj-1',
          directus_users_id: {
            id: USER_ID,
            username: 'admin1',
            first_name: 'Admin',
            last_name: 'One',
            email: 'a@test.com',
            rating: 1500,
          },
        },
      ],
      admins: [
        {
          id: 'aj-1',
          directus_users_id: { id: USER_ID, email: 'a@test.com' },
        },
      ],
      moderators: [],
    },
  ];
}

function makeContext() {
  const lastSyncedServerTimestamp = ref(0);
  return {
    lastSyncedServerTimestamp,
    context: {
      likhaUrl: ref('https://api.test'),
      currentUserId: ref(USER_ID),
      isOpenPlay: computed(() => false),
      getDataFetchBar: () => null,
      lastSyncedServerTimestamp,
      saveLastSyncedTimestamp: vi.fn(),
      setClubSwitchInProgress: vi.fn(),
      stopRealtime: vi.fn(),
    },
  };
}

function resetMatchmakingState() {
  const s = MatchmakingApp.state;
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
  s.clubId = '';
  s.clubUUID = '';
  s.lastModified = Date.now(); // dirty → privileged merge path eligible
  MatchmakingApp.onStateChange = null;
  MatchmakingApp.suppressSettingsLog = false;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.lsData = {};
  resetMatchmakingState();
});

// ---------------------------------------------------------------------------
// loadClubData — detectServerResetAdvantage adoption (contract §1/§2)
// ---------------------------------------------------------------------------
describe('useClubData — server reset advantage adoption', () => {
  it('wholesale-adopts flagged collections, adopts checkpoints verbatim, and repopulates completedMatches', async () => {
    // Local: pre-reset dirty state with older checkpoints.
    MatchmakingApp.state.players = {
      alice: {
        username: 'alice',
        level: 1,
        rating: 1400,
        matchesPlayed: 4,
        wins: 2,
        losses: 2,
        createdAt: 2000,
        updatedAt: 2000,
        statsUpdatedAt: 2000,
      } as never,
    };
    MatchmakingApp.state.queues = [
      {
        username: 'alice',
        queueType: 'GENERAL',
        enteredAt: 2000,
        createdAt: 2000,
        updatedAt: 2000,
      } as never,
    ];
    MatchmakingApp.state.completedMatches = [
      {
        matchId: 'old-match',
        matchType: 'doubles',
        teamA: [],
        teamB: [],
        teamAScore: 0,
        teamBScore: 0,
        completedAt: 100,
        updatedAt: 100,
        club: CLUB_UUID,
      } as never,
    ];
    MatchmakingApp.state.playersResetAt = 1000;
    MatchmakingApp.state.statsResetAt = 1000;
    MatchmakingApp.state.queuesResetAt = 1000;
    MatchmakingApp.state.matchesResetAt = 1000;
    MatchmakingApp.state.completedMatchesResetAt = 1000;
    MatchmakingApp.state.actionLogsResetAt = 1000;
    MatchmakingApp.state.settingsFieldTimestamps = {
      completedMatchesResetAt: 1000,
    };

    // Server: post-reset state — empty collections but WITH post-reset
    // completed matches (the case the old isRemoteReset never repopulated).
    const serverMatch = {
      matchId: 'new-match',
      matchType: 'doubles',
      teamA: [],
      teamB: [],
      teamAScore: 11,
      teamBScore: 9,
      completedAt: 6000,
      updatedAt: 6000,
      club: CLUB_UUID,
    } as never;
    const serverState = makeServerState({
      completedMatches: [serverMatch],
      completedMatchIds: ['new-match'],
      actionLogs: [
        {
          id: 'log-1',
          action: 'reset_all',
          performedBy: 'other-admin',
          performedById: 'user-2',
          timestamp: 5000,
        },
      ],
      playersResetAt: 5000,
      statsResetAt: 5000,
      queuesResetAt: 5000,
      matchesResetAt: 5000,
      completedMatchesResetAt: 5000,
      actionLogsResetAt: 5000,
      settingsFieldTimestamps: { completedMatchesResetAt: 5000 },
      lastModified: 8000,
    });
    mocks.request.mockResolvedValue(makeClubPayload(serverState));
    mocks.detectAdvantage.mockReturnValue(ALL_FLAGS);

    const { context, lastSyncedServerTimestamp } = makeContext();
    const { loadClubData, clubAdminIds, isCurrentUserMember } =
      useClubData(context);

    const applied = await loadClubData(CLUB_ID);
    expect(applied).toBe(true);

    const s = MatchmakingApp.state;
    // Flagged collections ← server wholesale (local pre-reset data discarded).
    expect(s.players).toEqual({});
    expect(s.queues).toEqual([]);
    expect(s.activeMatches).toEqual([]);
    // THE bug fix: post-reset completed matches are repopulated, not wiped.
    expect(s.completedMatches).toHaveLength(1);
    expect(s.completedMatches[0].matchId).toBe('new-match');
    expect(s.completedMatchIds).toEqual(['new-match']);
    expect(s.actionLogs?.map((l) => l.id)).toEqual(['log-1']);
    // Checkpoints adopted verbatim from the server.
    expect(s.playersResetAt).toBe(5000);
    expect(s.statsResetAt).toBe(5000);
    expect(s.queuesResetAt).toBe(5000);
    expect(s.matchesResetAt).toBe(5000);
    expect(s.completedMatchesResetAt).toBe(5000);
    expect(s.actionLogsResetAt).toBe(5000);
    // Per-field stamp carried consistently with the adopted epoch.
    expect(s.settingsFieldTimestamps?.['completedMatchesResetAt']).toBe(5000);
    // Concurrency token advanced to the server version.
    expect(lastSyncedServerTimestamp.value).toBe(8000);
    // User-facing notify fired.
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'info',
        message: expect.stringMatching(/reset/i),
      }),
    );
    // Privilege + membership seeded from the fresh fetch.
    expect(clubAdminIds.value.has(USER_ID)).toBe(true);
    expect(isCurrentUserMember.value).toBe(true);
  });

  it('adopts the server checkpoint verbatim even when it is lower than local (no Math.max inflation)', async () => {
    // Local checkpoint artificially higher — with real detection this can't
    // flag, but the mock lets us prove adoption is verbatim, not max().
    MatchmakingApp.state.players = {
      alice: {
        username: 'alice',
        level: 1,
        rating: 1400,
        matchesPlayed: 1,
        wins: 1,
        losses: 0,
        createdAt: 9000,
        updatedAt: 9000,
      } as never,
    };
    MatchmakingApp.state.completedMatchesResetAt = 9000;
    MatchmakingApp.state.settingsFieldTimestamps = {
      completedMatchesResetAt: 9000,
    };

    const serverState = makeServerState({
      completedMatches: [],
      completedMatchesResetAt: 5000,
      settingsFieldTimestamps: { completedMatchesResetAt: 5000 },
    });
    mocks.request.mockResolvedValue(makeClubPayload(serverState));
    mocks.detectAdvantage.mockReturnValue({
      ...NO_FLAGS,
      completedMatches: true,
    });

    const { context } = makeContext();
    const { loadClubData } = useClubData(context);
    await loadClubData(CLUB_ID);

    // Verbatim adoption — NOT Math.max(9000, 5000).
    expect(MatchmakingApp.state.completedMatchesResetAt).toBe(5000);
    // Stamp = max(server stamp, adopted value) = server effective epoch.
    expect(
      MatchmakingApp.state.settingsFieldTimestamps?.['completedMatchesResetAt'],
    ).toBe(5000);
  });

  it('leaves unflagged collections on the normal LWW merge', async () => {
    // Local player + queue entry that post-date the server queues reset.
    MatchmakingApp.state.players = {
      alice: {
        username: 'alice',
        level: 1,
        rating: 1400,
        matchesPlayed: 1,
        wins: 1,
        losses: 0,
        createdAt: 2000,
        updatedAt: 2000,
      } as never,
    };
    MatchmakingApp.state.queues = [
      {
        username: 'alice',
        queueType: 'GENERAL',
        enteredAt: 6000,
        createdAt: 6000,
        updatedAt: 6000,
      } as never,
    ];
    MatchmakingApp.state.queuesResetAt = 1000;

    const serverState = makeServerState({
      players: {
        bob: {
          username: 'bob',
          level: 1,
          rating: 1300,
          matchesPlayed: 2,
          wins: 1,
          losses: 1,
          createdAt: 3000,
          updatedAt: 3000,
        } as never,
      },
      queues: [],
      queuesResetAt: 5000,
    });
    mocks.request.mockResolvedValue(makeClubPayload(serverState));
    mocks.detectAdvantage.mockReturnValue({
      ...NO_FLAGS,
      queues: true,
    });

    const { context } = makeContext();
    const { loadClubData } = useClubData(context);
    await loadClubData(CLUB_ID);

    const s = MatchmakingApp.state;
    // queues flagged → wholesale server version (local post-reset entry
    // discarded even though it post-dates the checkpoint).
    expect(s.queues).toEqual([]);
    expect(s.queuesResetAt).toBe(5000);
    // players unflagged → normal merge keeps BOTH sides' players.
    expect(Object.keys(s.players).sort()).toEqual(['alice', 'bob']);
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/reset/i) }),
    );
  });

  it('runs the normal merge with no notify when there is no advantage', async () => {
    MatchmakingApp.state.players = {
      alice: {
        username: 'alice',
        level: 1,
        rating: 1400,
        matchesPlayed: 1,
        wins: 1,
        losses: 0,
        createdAt: 2000,
        updatedAt: 2000,
      } as never,
    };
    const serverState = makeServerState({
      players: {
        bob: {
          username: 'bob',
          level: 1,
          rating: 1300,
          matchesPlayed: 2,
          wins: 1,
          losses: 1,
          createdAt: 3000,
          updatedAt: 3000,
        } as never,
      },
    });
    mocks.request.mockResolvedValue(makeClubPayload(serverState));
    mocks.detectAdvantage.mockReturnValue(NO_FLAGS);

    const { context } = makeContext();
    const { loadClubData } = useClubData(context);
    await loadClubData(CLUB_ID);

    expect(Object.keys(MatchmakingApp.state.players).sort()).toEqual([
      'alice',
      'bob',
    ]);
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// club_meta_* verified flag (contract §4 write side)
// ---------------------------------------------------------------------------
describe('useClubData — club_meta privilege cache', () => {
  it('writes verified:true + timestamp after a fresh admins/moderators fetch', async () => {
    const serverState = makeServerState();
    mocks.request.mockResolvedValue(makeClubPayload(serverState));
    mocks.detectAdvantage.mockReturnValue(NO_FLAGS);

    const { context } = makeContext();
    const { loadClubData } = useClubData(context);
    await loadClubData(CLUB_ID);

    const setMock = LocalStorage.set as unknown as ReturnType<typeof vi.fn>;
    const metaCall = setMock.mock.calls.find(
      (c) => c[0] === `club_meta_${CLUB_ID}`,
    );
    expect(metaCall).toBeDefined();
    const meta = metaCall![1] as Record<string, unknown>;
    expect(meta.verified).toBe(true);
    expect(typeof meta.timestamp).toBe('number');
    expect(meta.adminIds).toContain(USER_ID);
  });

  it('restoreFromCache seeds UI from a legacy meta entry that has no verified field', () => {
    // Legacy cache: state + meta written before the verified flag existed.
    mocks.lsData[`matchmaking_state_${CLUB_ID}`] = {
      teamSize: 2,
      players: {},
      queues: [],
      activeMatches: [],
      completedMatches: [],
    };
    mocks.lsData[`club_meta_${CLUB_ID}`] = {
      clubUUID: CLUB_UUID,
      adminIds: [USER_ID],
      moderatorIds: [],
      members: [{ id: USER_ID, firstName: 'Admin', isAdmin: true }],
      clubName: 'Test Club',
      clubLogo: '',
      clubStatus: 'published',
      timestamp: Date.now(),
      // NOTE: no `verified` field — legacy entry.
    };

    const { context } = makeContext();
    const {
      restoreFromCache,
      clubAdminIds,
      isCurrentUserMember,
      currentClubUUID,
    } = useClubData(context);

    const restored = restoreFromCache(CLUB_ID);
    expect(restored).toBe(true);
    // UI seeds regardless — the push gate (Agent B side) is what treats
    // missing `verified` as unverified.
    expect(clubAdminIds.value.has(USER_ID)).toBe(true);
    expect(isCurrentUserMember.value).toBe(true);
    expect(currentClubUUID.value).toBe(CLUB_UUID);
  });
});
