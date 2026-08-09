import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import {
  announce,
  getNextInLine,
  buildMatchAnnounceText,
  getPlayerName,
} from 'src/services/announcer';
import { MatchmakingApp } from 'src/services/matchmaking';
import { useNotify } from 'src/composables/useNotify';
import type { QNotifyCreateOptions } from 'quasar';

type NotifyFn = (opts: QNotifyCreateOptions) => void;

interface MatchLike {
  id: string;
  status: string;
  court?: number;
  startedAt?: { getTime(): number } | null;
  createdAt: Date;
  teamA: { firstName?: string; username: string }[];
  teamB: { firstName?: string; username: string }[];
}

export interface UseAnnouncerContext {
  matches: ComputedRef<MatchLike[]> | Ref<MatchLike[]>;
  queuePriorityMode:
    | ComputedRef<'timestamp' | 'gamesPlayed'>
    | Ref<'timestamp' | 'gamesPlayed'>;
}

export function useAnnouncer(context: UseAnnouncerContext) {
  const { matches, queuePriorityMode } = context;
  const { notify: ctxNotify } = useNotify();
  const notify = ctxNotify as NotifyFn;

  const nextInLineMatch = computed(() =>
    getNextInLine(
      matches.value,
      queuePriorityMode.value,
      MatchmakingApp.state.activeMatches,
    ),
  );

  // Seed with current max startedAt so existing matches aren't re-announced.
  // When no in-progress matches exist, seed with Date.now() so already-started
  // matches from other admins don't get falsely announced on initial load.
  const existingStartedAts = matches.value
    .filter((m) => m.status === 'in-progress')
    .map((m) => m.startedAt?.getTime() || 0);
  const lastProcessedStartedAt = ref(
    existingStartedAts.length > 0
      ? Math.max(...existingStartedAts)
      : Date.now(),
  );
  const prevNextInLineId = ref<string | null>(
    nextInLineMatch.value?.matchId || null,
  );
  let pendingNextInLineTimeout: ReturnType<typeof setTimeout> | null = null;

  watch(
    () => {
      const inProgress = matches.value
        .filter((m) => m.status === 'in-progress')
        .map((m) => m.id)
        .sort()
        .join(',');
      return `${inProgress}::${nextInLineMatch.value?.matchId || ''}`;
    },
    () => {
      // 1. Announce newly started matches (startedAt is new), sorted by start time
      const newlyStarted = matches.value
        .filter(
          (m) =>
            m.status === 'in-progress' &&
            m.startedAt &&
            m.startedAt.getTime() > lastProcessedStartedAt.value,
        )
        .sort(
          (a, b) =>
            (a.startedAt?.getTime() ?? 0) - (b.startedAt?.getTime() ?? 0),
        );

      for (const m of newlyStarted) {
        const a = m.teamA.map((p) => p.firstName || p.username);
        const b = m.teamB.map((p) => p.firstName || p.username);
        const text = buildMatchAnnounceText(a, b);
        for (let i = 0; i < 2; i++) {
          announce(notify, text, m.id);
        }
      }

      if (newlyStarted.length > 0) {
        lastProcessedStartedAt.value = Math.max(
          lastProcessedStartedAt.value,
          ...newlyStarted.map((m) => m.startedAt!.getTime()),
        );
      }

      // 2. Then announce next-in-line if it changed (delayed so it doesn't
      //    evict newly-started toasts on mobile and matches TTS sequencing)
      const nextId = nextInLineMatch.value?.matchId || null;
      if (nextId && nextId !== prevNextInLineId.value) {
        const next = nextInLineMatch.value!;
        const na = next.teamA.map((u) =>
          getPlayerName(MatchmakingApp.state.players, u),
        );
        const nb = next.teamB.map((u) =>
          getPlayerName(MatchmakingApp.state.players, u),
        );
        const text = buildMatchAnnounceText(na, nb, true);
        const delay = newlyStarted.length > 0 ? 500 : 0;
        if (pendingNextInLineTimeout) clearTimeout(pendingNextInLineTimeout);
        pendingNextInLineTimeout = setTimeout(() => {
          announce(notify, text, next.matchId);
          prevNextInLineId.value = nextId;
          pendingNextInLineTimeout = null;
        }, delay);
      }
    },
  );

  // Announce match on double-click / double-tap on a match card
  const handleCustomAnnounce = (match: {
    id: string;
    teamA: { firstName?: string; username: string }[];
    teamB: { firstName?: string; username: string }[];
    court?: number;
    status?: string;
  }) => {
    // For waiting matches, only announce the next-in-line
    if (match.status === 'waiting') {
      const next = getNextInLine(
        matches.value,
        queuePriorityMode.value,
        MatchmakingApp.state.activeMatches,
      );
      if (next) {
        const na = next.teamA.map((u) =>
          getPlayerName(MatchmakingApp.state.players, u),
        );
        const nb = next.teamB.map((u) =>
          getPlayerName(MatchmakingApp.state.players, u),
        );
        const text = buildMatchAnnounceText(na, nb, true);
        announce(notify, text, next.matchId);
      }
      return;
    }

    // For in-progress matches, announce the match normally
    const a = match.teamA.map((p) => p.firstName || p.username);
    const b = match.teamB.map((p) => p.firstName || p.username);
    const text = buildMatchAnnounceText(a, b);
    announce(notify, text, match.id);
  };

  return {
    nextInLineMatch,
    handleCustomAnnounce,
  };
}
