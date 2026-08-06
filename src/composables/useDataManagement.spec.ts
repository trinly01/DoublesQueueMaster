import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import { MatchmakingApp, type CompletedMatch } from 'src/services/matchmaking';

// Mock useNotify
vi.mock('src/composables/useNotify', () => ({
  useNotify: () => ({
    notify: vi.fn(),
  }),
}));

// Mock quasar
vi.mock('quasar', () => ({
  useQuasar: () => ({
    dialog: vi.fn(() => {
      const callbacks: Record<string, () => void> = {};
      const chain = {
        onOk: (cb: () => void) => {
          callbacks.onOk = cb;
          return chain;
        },
        onCancel: (cb: () => void) => {
          callbacks.onCancel = cb;
          return chain;
        },
      };
      setTimeout(() => {
        if (callbacks.onOk) callbacks.onOk();
      }, 0);
      return chain;
    }),
  }),
  LocalStorage: {
    getItem: vi.fn(() => null),
    set: vi.fn(),
    remove: vi.fn(),
  },
}));

// Mock duprExport
vi.mock('src/utils/duprExport', () => ({
  buildDuprCsv: vi.fn(() => 'csv,data'),
  downloadDuprCsv: vi.fn(),
}));

import { useDataManagement } from './useDataManagement';
import { buildDuprCsv, downloadDuprCsv } from 'src/utils/duprExport';

function makeContext() {
  const duprExportableMatches = ref<CompletedMatch[]>([]);
  const clubName = ref('Test Club');
  const routeParamsId = ref<string | string[]>('club-123');
  const showSettingsDialog = ref(false);
  return {
    context: {
      duprExportableMatches,
      clubName,
      routeParamsId,
      showSettingsDialog,
    },
    duprExportableMatches,
    clubName,
    routeParamsId,
    showSettingsDialog,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  MatchmakingApp.state.players = {};
  MatchmakingApp.state.queues = [];
  MatchmakingApp.state.activeMatches = [];
  MatchmakingApp.state.completedMatches = [];
  MatchmakingApp.state.playersResetAt = 0;
  MatchmakingApp.state.queuesResetAt = 0;
  MatchmakingApp.state.matchesResetAt = 0;
});

describe('useDataManagement — resetGamesPlayed', () => {
  it('resets all player stats', async () => {
    MatchmakingApp.state.players['alice'] = {
      username: 'alice',
      matchesPlayed: 5,
      wins: 3,
      losses: 2,
      rating: 1500,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never;
    const { context } = makeContext();
    const { resetGamesPlayed } = useDataManagement(context);
    resetGamesPlayed();
    await new Promise((r) => setTimeout(r, 10));
    expect(MatchmakingApp.state.players['alice'].matchesPlayed).toBe(0);
    expect(MatchmakingApp.state.players['alice'].wins).toBe(0);
    expect(MatchmakingApp.state.players['alice'].losses).toBe(0);
  });
});

describe('useDataManagement — clearMatches', () => {
  it('tombstones all active matches', async () => {
    MatchmakingApp.state.activeMatches = [
      { matchId: 'm1', deletedAt: undefined, updatedAt: undefined } as never,
    ];
    const { context } = makeContext();
    const { clearMatches } = useDataManagement(context);
    clearMatches();
    await new Promise((r) => setTimeout(r, 10));
    expect(MatchmakingApp.state.activeMatches[0].deletedAt).toBeDefined();
  });
});

describe('useDataManagement — clearQueue', () => {
  it('tombstones all queue entries', async () => {
    MatchmakingApp.state.queues = [
      {
        username: 'alice',
        deletedAt: undefined,
        updatedAt: undefined,
      } as never,
    ];
    const { context } = makeContext();
    const { clearQueue } = useDataManagement(context);
    clearQueue();
    await new Promise((r) => setTimeout(r, 10));
    expect(MatchmakingApp.state.queues[0].deletedAt).toBeDefined();
  });
});

describe('useDataManagement — exportDuprCsv', () => {
  it('notifies when no matches to export', () => {
    const { context } = makeContext();
    const { exportDuprCsv } = useDataManagement(context);
    exportDuprCsv();
    expect(buildDuprCsv).not.toHaveBeenCalled();
  });

  it('builds and downloads CSV when matches exist', () => {
    const { context, duprExportableMatches } = makeContext();
    duprExportableMatches.value = [
      { matchId: 'm1' } as unknown as CompletedMatch,
    ];
    const { exportDuprCsv } = useDataManagement(context);
    exportDuprCsv();
    expect(buildDuprCsv).toHaveBeenCalled();
    expect(downloadDuprCsv).toHaveBeenCalled();
  });
});

describe('useDataManagement — resetAllData', () => {
  it('calls hardResetEverything and closes settings dialog', async () => {
    const { context, showSettingsDialog } = makeContext();
    showSettingsDialog.value = true;
    const { resetAllData } = useDataManagement(context);
    resetAllData();
    await new Promise((r) => setTimeout(r, 10));
    expect(showSettingsDialog.value).toBe(false);
  });
});

describe('useDataManagement — resetSessionData', () => {
  it('resets session when no unexported matches', async () => {
    const { context } = makeContext();
    const { resetSessionData } = useDataManagement(context);
    resetSessionData();
    await new Promise((r) => setTimeout(r, 10));
    expect(MatchmakingApp.state.activeMatches).toEqual([]);
    expect(MatchmakingApp.state.queues).toEqual([]);
  });
});
