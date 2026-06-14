import { ref } from 'vue';
import type { ActiveMatch, Player } from './matchmaking';
import { MatchmakingApp } from './matchmaking';

// ── Admin-only voice flag ──────────────────────────────
let isAdminMode = false;
export const setAdminMode = (val: boolean) => {
  isAdminMode = val;
};

// ── Announcement History (in-memory only) ──────────────
export interface AnnouncementRecord {
  text: string;
  timestamp: number;
  matchId?: string;
}
const announcements: AnnouncementRecord[] = [];
const MAX_ANNOUNCEMENTS = 50;

export const getAnnouncements = (): AnnouncementRecord[] =>
  [...announcements].reverse();
export const clearAnnouncements = () => {
  announcements.length = 0;
};
const pushAnnouncement = (text: string, matchId?: string) => {
  if (matchId) {
    const existingIndex = announcements.findIndex((a) => a.matchId === matchId);
    if (existingIndex !== -1) {
      announcements[existingIndex] = { text, timestamp: Date.now(), matchId };
      return;
    }
  }
  announcements.unshift({ text, timestamp: Date.now(), matchId });
  if (announcements.length > MAX_ANNOUNCEMENTS) announcements.pop();
};

// ── TTS Queue ──────────────────────────────────────────
const speechQueue: string[] = [];
export const isSpeaking = ref(false);

const pickFemaleVoice = (): SpeechSynthesisVoice | null => {
  const voices = window.speechSynthesis.getVoices();
  const female = voices.find(
    (v) =>
      v.lang.startsWith('en') &&
      (/female|samantha|karen|moira|tessa|serena|zira/i.test(v.name) ||
        v.name.includes('Google US English')),
  );
  if (female) return female;
  return voices.find((v) => v.lang.startsWith('en')) || null;
};

const playNextInQueue = () => {
  if (speechQueue.length === 0) {
    isSpeaking.value = false;
    return;
  }
  if (MatchmakingApp.state.ttsEnabled === false) {
    speechQueue.length = 0;
    isSpeaking.value = false;
    return;
  }
  isSpeaking.value = true;
  const text = speechQueue.shift()!;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.65;
  utterance.pitch = 1.1;
  utterance.volume = 1;

  const voice = pickFemaleVoice();
  if (voice) utterance.voice = voice;

  utterance.onend = () => {
    const delay = text.includes('dinking only')
      ? 1200
      : text.includes('Please prepare')
        ? 2000
        : 400;
    setTimeout(playNextInQueue, delay);
  };
  utterance.onerror = (e) => {
    console.error('[TTS] error:', e.error);
    playNextInQueue();
  };

  window.speechSynthesis.speak(utterance);
};

export const enqueueSpeak = (text: string) => {
  if (MatchmakingApp.state.ttsEnabled === false) return;
  speechQueue.push(text);
  if (!isSpeaking.value) playNextInQueue();
};

export const clearSpeechQueue = () => {
  speechQueue.length = 0;
  window.speechSynthesis.cancel();
};

// ── Announce (visual + TTS) ─────────────────────────────
export const announce = (
  notify: (opts: { type: string; message: string; timeout?: number }) => void,
  text: string,
  matchId?: string,
) => {
  pushAnnouncement(text, matchId);
  notify({ type: 'info', message: text, timeout: 3000 });

  if (!isAdminMode) return;
  if (MatchmakingApp.state.ttsEnabled === false) return;

  if (!('speechSynthesis' in window)) {
    console.warn('[TTS] speechSynthesis not supported');
    return;
  }

  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    enqueueSpeak(text);
  } else {
    window.speechSynthesis.onvoiceschanged = () => {
      enqueueSpeak(text);
      window.speechSynthesis.onvoiceschanged = null;
    };
    setTimeout(() => {
      enqueueSpeak(text);
    }, 250);
  }
};

// ── Name Resolution ──────────────────────────────────────
export const getPlayerName = (
  players: Record<string, Player>,
  username: string,
): string => {
  const p = players[username];
  return p?.firstName || p?.name || username;
};

// ── Match Description ────────────────────────────────────
export const buildMatchDescription = (
  match: ActiveMatch,
  players: Record<string, Player>,
): string => {
  const teamA = match.teamA.map((u) => getPlayerName(players, u));
  const teamB = match.teamB.map((u) => getPlayerName(players, u));
  const teamAStr = teamA.length > 1 ? `${teamA[0]}, and ${teamA[1]}` : teamA[0];
  const teamBStr = teamB.length > 1 ? `${teamB[0]}, and ${teamB[1]}` : teamB[0];
  return `${teamAStr}... versus... ${teamBStr}`;
};

// ── Next in Line (waiting status match, no court assigned) ─
// Finds the next match that is still in 'waiting' status AND has no court assigned.
// Matches already assigned to a court are queued up and should not be "next in line".
// createdAt = when the match was first generated
// startedAt = when the match began play (only set after status changes to 'in-progress')
export const getNextInLine = (
  matches: Array<{
    id: string;
    status: string;
    createdAt: Date;
    court?: number;
    minGamesPlayed?: number;
    oldestQueueEntryAt?: number;
  }>,
  queuePriorityMode: string,
  activeMatches: ActiveMatch[],
): ActiveMatch | null => {
  // Filter to only matches waiting for a court (no court assigned yet)
  const waiting = matches
    .filter((m) => m.status === 'waiting' && !m.court)
    .sort((a, b) => {
      if (queuePriorityMode === 'gamesPlayed') {
        const aGames = a.minGamesPlayed ?? 0;
        const bGames = b.minGamesPlayed ?? 0;
        if (aGames !== bGames) return aGames - bGames;
      }
      const aTime = a.oldestQueueEntryAt ?? a.createdAt.getTime();
      const bTime = b.oldestQueueEntryAt ?? b.createdAt.getTime();
      return aTime - bTime;
    });

  if (!waiting[0]) return null;
  return activeMatches.find((am) => am.matchId === waiting[0].id) || null;
};

// ── Reusable match text builder ──────────────────────────
export const buildMatchAnnounceText = (
  teamA: string[],
  teamB: string[],
  court?: number,
  isNextInLine?: boolean,
): string => {
  const aStr =
    teamA.length > 1 ? `${teamA[0]}, and ${teamA[1]}` : teamA[0] || '';
  const bStr =
    teamB.length > 1 ? `${teamB[0]}, and ${teamB[1]}` : teamB[0] || '';
  if (isNextInLine) {
    return `Next in line, please prepare..... ${aStr}... versus... ${bStr}....`;
  }
  return `Court ${court ?? '?'}. ${aStr}... versus... ${bStr}... One minute dinking only....`;
};

// ── Match Start Announcement ─────────────────────────────
export const announceMatchStart = (
  notify: (opts: { type: string; message: string; timeout?: number }) => void,
  match: ActiveMatch,
  court: number,
  _allMatches: ActiveMatch[],
  players: Record<string, Player>,
) => {
  const a = match.teamA.map((u) => getPlayerName(players, u));
  const b = match.teamB.map((u) => getPlayerName(players, u));
  const text = buildMatchAnnounceText(a, b, court);

  // Announce the newly started match 2 times (ideal for noisy clubs)
  for (let i = 0; i < 2; i++) {
    announce(notify, text, match.matchId);
  }
};
