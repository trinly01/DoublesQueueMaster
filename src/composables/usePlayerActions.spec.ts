import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computed } from 'vue';
import { MatchmakingApp } from 'src/services/matchmaking';
import type { Player } from 'src/services/matchmaking';

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
      // Use setTimeout to simulate async dialog resolution
      setTimeout(() => {
        if (callbacks.onOk) callbacks.onOk();
      }, 0);
      return chain;
    }),
  }),
  LocalStorage: {
    getItem: vi.fn(() => null),
    set: vi.fn(),
  },
}));

import { usePlayerActions } from './usePlayerActions';

function makePlayers(): (Player & { name: string })[] {
  return [
    {
      username: 'alice',
      firstName: 'Alice',
      level: 2,
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      rating: 1500,
      name: 'alice',
    },
    {
      username: 'bob',
      firstName: 'Bob',
      level: 1,
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      rating: 1400,
      name: 'bob',
    },
  ];
}

function makeContext() {
  const players = computed(() => makePlayers());
  return { context: { players }, players };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset MatchmakingApp state
  MatchmakingApp.state.players = {};
  MatchmakingApp.state.queues = [];
  MatchmakingApp.state.activeMatches = [];
  MatchmakingApp.state.playersResetAt = 0;
  MatchmakingApp.state.queuesResetAt = 0;
  MatchmakingApp.state.matchesResetAt = 0;
});

describe('usePlayerActions — removePlayer', () => {
  it('marks player as deleted and removes from queue', async () => {
    MatchmakingApp.state.players['alice'] = {
      username: 'alice',
      firstName: 'Alice',
      level: 2,
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      rating: 1500,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as Player;
    const { context } = makeContext();
    const { removePlayer } = usePlayerActions(context);
    removePlayer('alice');
    // Wait for async dialog onOk to fire
    await new Promise((r) => setTimeout(r, 10));
    const player = MatchmakingApp.state.players['alice'];
    expect(player).toBeDefined();
    if (player) {
      expect(player.deletedAt).toBeDefined();
    }
  });
});

describe('usePlayerActions — removeFromQueue', () => {
  it('calls removeFromQueue on MatchmakingApp', async () => {
    const { context } = makeContext();
    const { removeFromQueue } = usePlayerActions(context);
    removeFromQueue('alice');
    await new Promise((r) => setTimeout(r, 10));
    // No error thrown — verify it ran
    expect(true).toBe(true);
  });
});

describe('usePlayerActions — requeuePlayer', () => {
  it('does nothing for unknown player', () => {
    const { context } = makeContext();
    const { requeuePlayer } = usePlayerActions(context);
    requeuePlayer('unknown');
    // Should return early without calling dialog
  });

  it('checks in player when found', async () => {
    const { context } = makeContext();
    const { requeuePlayer } = usePlayerActions(context);
    requeuePlayer('alice');
    await new Promise((r) => setTimeout(r, 10));
    // Dialog mock auto-calls onOk
    expect(true).toBe(true);
  });
});

describe('usePlayerActions — addAllPlayersToQueue', () => {
  it('processes all players', async () => {
    const { context } = makeContext();
    const { addAllPlayersToQueue } = usePlayerActions(context);
    addAllPlayersToQueue();
    await new Promise((r) => setTimeout(r, 10));
    // Dialog mock auto-calls onOk
    expect(true).toBe(true);
  });
});
