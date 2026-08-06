import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, computed, nextTick } from 'vue';
import { MatchmakingApp } from 'src/services/matchmaking';

// Mock useNotify
vi.mock('src/composables/useNotify', () => ({
  useNotify: () => ({
    notify: vi.fn(),
  }),
}));

// Mock announcer service
vi.mock('src/services/announcer', () => ({
  announce: vi.fn(),
  getNextInLine: vi.fn(() => null),
  buildMatchAnnounceText: vi.fn((a, b) => `${a.join(',')} vs ${b.join(',')}`),
  getPlayerName: vi.fn((players, username) => username),
  clearSpeechQueue: vi.fn(),
  isSpeaking: ref(false),
  setAdminMode: vi.fn(),
}));

// Mock quasar (needed by MatchmakingApp)
vi.mock('quasar', () => ({
  LocalStorage: {
    getItem: vi.fn(() => null),
    set: vi.fn(),
  },
}));

import { useAnnouncer } from './useAnnouncer';
import {
  announce,
  getNextInLine,
  buildMatchAnnounceText,
} from 'src/services/announcer';

interface MatchLike {
  id: string;
  status: string;
  court?: number;
  startedAt?: { getTime(): number } | null;
  createdAt: Date;
  teamA: { firstName?: string; username: string }[];
  teamB: { firstName?: string; username: string }[];
}

function makeMatches(): MatchLike[] {
  return [];
}

function makeContext(overrides: Record<string, unknown> = {}) {
  const matches = ref<MatchLike[]>(makeMatches());
  const queuePriorityMode = computed(
    () => 'gamesPlayed' as 'timestamp' | 'gamesPlayed',
  );
  return {
    context: {
      matches,
      queuePriorityMode,
      ...overrides,
    },
    matches,
    queuePriorityMode,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  MatchmakingApp.state.activeMatches = [];
});

describe('useAnnouncer — initial state', () => {
  it('seeds lastProcessedStartedAt with Date.now when no in-progress matches', () => {
    const { context } = makeContext();
    const { nextInLineMatch } = useAnnouncer(context);
    expect(nextInLineMatch.value).toBeNull();
  });
});

describe('useAnnouncer — handleCustomAnnounce', () => {
  it('announces in-progress match normally', () => {
    const { context } = makeContext();
    const { handleCustomAnnounce } = useAnnouncer(context);
    handleCustomAnnounce({
      id: 'm1',
      status: 'in-progress',
      teamA: [{ firstName: 'Alice', username: 'alice' }],
      teamB: [{ firstName: 'Bob', username: 'bob' }],
    });
    expect(buildMatchAnnounceText).toHaveBeenCalledWith(['Alice'], ['Bob']);
    expect(announce).toHaveBeenCalled();
  });

  it('announces next-in-line for waiting matches', () => {
    (getNextInLine as ReturnType<typeof vi.fn>).mockReturnValue({
      matchId: 'next1',
      teamA: ['alice'],
      teamB: ['bob'],
    });
    const { context } = makeContext();
    const { handleCustomAnnounce } = useAnnouncer(context);
    handleCustomAnnounce({
      id: 'm1',
      status: 'waiting',
      teamA: [{ firstName: 'Alice', username: 'alice' }],
      teamB: [{ firstName: 'Bob', username: 'bob' }],
    });
    expect(getNextInLine).toHaveBeenCalled();
    expect(announce).toHaveBeenCalled();
  });

  it('does not announce waiting match when no next-in-line', () => {
    (getNextInLine as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const { context } = makeContext();
    const { handleCustomAnnounce } = useAnnouncer(context);
    (announce as ReturnType<typeof vi.fn>).mockClear();
    handleCustomAnnounce({
      id: 'm1',
      status: 'waiting',
      teamA: [{ firstName: 'Alice', username: 'alice' }],
      teamB: [{ firstName: 'Bob', username: 'bob' }],
    });
    expect(announce).not.toHaveBeenCalled();
  });

  it('uses firstName fallback to username', () => {
    const { context } = makeContext();
    const { handleCustomAnnounce } = useAnnouncer(context);
    handleCustomAnnounce({
      id: 'm1',
      status: 'in-progress',
      teamA: [{ username: 'alice' }],
      teamB: [{ username: 'bob' }],
    });
    expect(buildMatchAnnounceText).toHaveBeenCalledWith(['alice'], ['bob']);
  });
});

describe('useAnnouncer — watcher', () => {
  it('announces newly started matches', async () => {
    const { context, matches } = makeContext();
    useAnnouncer(context);

    const startTime = Date.now() + 1;
    matches.value = [
      {
        id: 'm1',
        status: 'in-progress',
        startedAt: { getTime: () => startTime },
        createdAt: new Date(),
        teamA: [{ firstName: 'Alice', username: 'alice' }],
        teamB: [{ firstName: 'Bob', username: 'bob' }],
      },
    ];

    await nextTick();
    // Wait for watcher to fire
    await new Promise((r) => setTimeout(r, 10));

    expect(buildMatchAnnounceText).toHaveBeenCalledWith(['Alice'], ['Bob']);
    expect(announce).toHaveBeenCalled();
  });

  it('does not re-announce existing in-progress matches', async () => {
    const existingTime = Date.now() - 1000;
    const { context } = makeContext({
      matches: ref<MatchLike[]>([
        {
          id: 'm1',
          status: 'in-progress',
          startedAt: { getTime: () => existingTime },
          createdAt: new Date(),
          teamA: [{ firstName: 'Alice', username: 'alice' }],
          teamB: [{ firstName: 'Bob', username: 'bob' }],
        },
      ]),
    });
    useAnnouncer(context);

    await nextTick();
    await new Promise((r) => setTimeout(r, 10));

    // Should not announce since startedAt is before the seed time
    expect(announce).not.toHaveBeenCalled();
  });
});
