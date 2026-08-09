import { ref } from 'vue';
import type { ActiveMatch, Player } from './matchmaking';
import { MatchmakingApp } from './matchmaking';
import { getDeviceSetting } from 'src/composables/useDeviceSettings';
import {
  isEdgeTtsAvailable,
  edgeTtsSpeak,
  resetEdgeTtsInstance,
} from './edgeTts';
import { TTS_CONFIG } from './ttsConfig';

// Per-device TTS setting: read from LocalStorage (not cloud-synced AppState)
// so each device controls its own announcer independently.
const isTtsEnabled = (): boolean => {
  const val = getDeviceSetting('ttsEnabled');
  if (val !== undefined) return val;
  return MatchmakingApp.state.ttsEnabled ?? true;
};

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
      const existing = announcements[existingIndex];
      if (Date.now() - existing.timestamp > 5000) {
        announcements[existingIndex] = { text, timestamp: Date.now(), matchId };
        return;
      }
    }
  }
  announcements.unshift({ text, timestamp: Date.now(), matchId });
  if (announcements.length > MAX_ANNOUNCEMENTS) announcements.pop();
};

// ── TTS Queue ──────────────────────────────────────────
const speechQueue: string[] = [];
export const isSpeaking = ref(false);

// Chrome onend bug workarounds (chromium/issues/509488):
// 1. Generation counter — ignore stale onend callbacks after cancel
// 2. Keep-alive timer — pause/resume every 10s to prevent engine stall
// 3. Fallback timeout — force-advance queue if onend never fires
let speakGeneration = 0;
let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
let currentAudioElement: HTMLAudioElement | null = null;

// ── Circuit Breaker (industry-standard primary/secondary failover) ──
// CLOSED: try Edge TTS for every announcement
// OPEN: skip Edge TTS, go straight to speechSynthesis (no wasted time)
// HALF_OPEN: trial call to check if Edge TTS recovered
type CircuitState = 'closed' | 'open' | 'half_open';
let circuitState: CircuitState = 'closed';
let consecutiveFailures = 0;
let lastFailureTime = 0;

const canTryEdgeTts = (): boolean => {
  switch (circuitState) {
    case 'closed':
      return true;
    case 'open':
      if (
        Date.now() - lastFailureTime >=
        TTS_CONFIG.circuitBreaker.cooldownMs
      ) {
        circuitState = 'half_open';
        return true;
      }
      return false;
    case 'half_open':
      return true;
  }
};

const recordEdgeTtsSuccess = () => {
  circuitState = 'closed';
  consecutiveFailures = 0;
};

const recordEdgeTtsFailure = () => {
  consecutiveFailures++;
  lastFailureTime = Date.now();
  if (consecutiveFailures >= TTS_CONFIG.circuitBreaker.failureThreshold) {
    circuitState = 'open';
  } else if (circuitState === 'half_open') {
    circuitState = 'open';
  }
};

// ── Wake Lock (prevent mobile screen lock from killing WebSocket) ──
let wakeLock: WakeLockSentinel | null = null;

const acquireWakeLock = async () => {
  if (!TTS_CONFIG.wakeLock) return;
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
    });
  } catch {
    // ignore — wake lock not critical, circuit breaker handles fallback
  }
};

const releaseWakeLock = async () => {
  if (wakeLock) {
    await wakeLock.release();
    wakeLock = null;
  }
};

const stopTimers = () => {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
  if (fallbackTimer) {
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
};

const getPostSpeechDelay = (text: string): number =>
  text.includes('dinking only')
    ? 1200
    : text.includes('Please prepare')
      ? 2000
      : 400;

const pickFemaleVoice = (): SpeechSynthesisVoice | null => {
  const voices = window.speechSynthesis.getVoices();

  // 1. Prefer Female English voice with Filipina or Filipino accent
  const femaleFilipina = voices.find(
    (v) =>
      v.lang.toLowerCase().startsWith('en') &&
      /female/i.test(v.name) &&
      (/filipina|filipino|philippine|pinoy/i.test(v.name) ||
        /\bph\b|philippines/i.test(v.lang.toLowerCase())),
  );
  if (femaleFilipina) return femaleFilipina;

  // 2. Any female English voice
  const femaleEnglish = voices.find(
    (v) =>
      v.lang.toLowerCase().startsWith('en') &&
      (/female|samantha|karen|moira|tessa|serena|zira/i.test(v.name) ||
        v.name.includes('Google US English')),
  );
  if (femaleEnglish) return femaleEnglish;

  // 3. Any English voice
  return voices.find((v) => v.lang.toLowerCase().startsWith('en')) || null;
};

const speechSynthesisSpeak = (text: string, currentGen: number) => {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = TTS_CONFIG.speechSynthesis.rate;
  utterance.pitch = TTS_CONFIG.speechSynthesis.pitch;
  utterance.volume = TTS_CONFIG.speechSynthesis.volume;

  const voice = pickFemaleVoice();
  if (voice) utterance.voice = voice;

  // GC prevention — #1 workaround for Chrome onend bug (chromium/issues/509488)
  // Keeping a reference prevents V8 from collecting the utterance before onend fires.
  console.log(utterance);

  utterance.onend = () => {
    if (currentGen !== speakGeneration) return; // stale callback after cancel
    stopTimers();
    const delay = getPostSpeechDelay(text);
    setTimeout(playNextInQueue, delay);
  };
  utterance.onerror = (e) => {
    if (currentGen !== speakGeneration) return;
    console.error('[TTS] error:', e.error);
    stopTimers();
    playNextInQueue();
  };

  // Chrome keep-alive: pause/resume every 10s to prevent onend stall
  keepAliveTimer = setInterval(() => {
    if (!window.speechSynthesis.speaking) return;
    window.speechSynthesis.pause();
    window.speechSynthesis.resume();
  }, 10000);

  // Fallback: if onend never fires, force-advance after estimated duration
  const estimatedMs = Math.max(text.length * 100, 3000) + 5000;
  fallbackTimer = setTimeout(() => {
    if (currentGen !== speakGeneration) return;
    console.warn('[TTS] onend timeout, force-advancing queue');
    stopTimers();
    playNextInQueue();
  }, estimatedMs);

  window.speechSynthesis.speak(utterance);
};

const playNextInQueue = async () => {
  stopTimers();

  if (speechQueue.length === 0) {
    isSpeaking.value = false;
    releaseWakeLock();
    return;
  }
  if (isTtsEnabled() === false) {
    speechQueue.length = 0;
    isSpeaking.value = false;
    releaseWakeLock();
    return;
  }
  isSpeaking.value = true;
  acquireWakeLock();
  const currentGen = speakGeneration;
  const text = speechQueue.shift()!;

  // Try Edge TTS first (Filipina voice — en-PH-RosaNeural)
  // Circuit breaker: skip if OPEN, trial if HALF_OPEN, normal if CLOSED
  if (isEdgeTtsAvailable() && canTryEdgeTts()) {
    try {
      const { audio, cleanup } = await edgeTtsSpeak(text);
      if (currentGen !== speakGeneration) {
        cleanup();
        return; // cancelled while fetching
      }
      recordEdgeTtsSuccess();
      currentAudioElement = audio;

      audio.onended = () => {
        if (currentGen !== speakGeneration) return;
        cleanup();
        currentAudioElement = null;
        const delay = getPostSpeechDelay(text);
        setTimeout(playNextInQueue, delay);
      };
      audio.onerror = () => {
        if (currentGen !== speakGeneration) return;
        cleanup();
        currentAudioElement = null;
        speechSynthesisSpeak(text, currentGen);
      };
      return; // Edge TTS playing, done
    } catch (e) {
      recordEdgeTtsFailure();
      if (circuitState === 'open') {
        console.warn('[TTS] Edge TTS circuit OPEN, using speechSynthesis');
      } else {
        console.warn('[TTS] Edge TTS failed, using speechSynthesis:', e);
      }
      currentAudioElement = null;
    }
  }

  // Fallback: speechSynthesis (existing code with Chrome bug workarounds)
  speechSynthesisSpeak(text, currentGen);
};

export const enqueueSpeak = (text: string) => {
  if (isTtsEnabled() === false) return;
  speechQueue.push(text);
  if (!isSpeaking.value) playNextInQueue();
};

export const clearSpeechQueue = () => {
  speakGeneration++;
  stopTimers();
  if (currentAudioElement) {
    currentAudioElement.pause();
    currentAudioElement = null;
  }
  speechQueue.length = 0;
  pendingVoiceTexts.length = 0;
  isSpeaking.value = false;
  window.speechSynthesis.cancel();
  releaseWakeLock();
};

// Test-only exports (not used in production code)
export const _testGetSpeechQueue = (): readonly string[] => speechQueue;
export const _testGetPendingVoiceTexts = (): readonly string[] =>
  pendingVoiceTexts;
export const _testResetQueues = () => {
  speakGeneration++;
  stopTimers();
  if (currentAudioElement) {
    currentAudioElement.pause();
    currentAudioElement = null;
  }
  speechQueue.length = 0;
  pendingVoiceTexts.length = 0;
  voicesReadyHandlerSetUp = false;
  circuitState = 'closed';
  consecutiveFailures = 0;
  lastFailureTime = 0;
};

export const _testGetCircuitState = (): CircuitState => circuitState;

// ── Visibilitychange recovery ──────────────────────────
// When screen wakes: reset Edge TTS instance (fresh WebSocket),
// force circuit breaker to HALF_OPEN (immediate retry),
// re-acquire wake lock, and advance stalled queue.
export const onVisibilityChange = async () => {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible')
    return;
  if (isSpeaking.value) acquireWakeLock();
  resetEdgeTtsInstance();
  circuitState = 'half_open';
  lastFailureTime = 0; // bypass cooldown
  if (currentAudioElement?.paused) {
    currentAudioElement = null;
    playNextInQueue();
  }
};

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', onVisibilityChange);
}

// ── Pending voice-loading queue ─────────────────────────
// When speechSynthesis voices aren't loaded yet, texts are buffered here.
// Both onvoiceschanged and the setTimeout fallback call flushPendingVoiceTexts,
// so whichever fires first drains the queue — no duplicates, order preserved.
const pendingVoiceTexts: string[] = [];
let voicesReadyHandlerSetUp = false;

const flushPendingVoiceTexts = () => {
  while (pendingVoiceTexts.length > 0) {
    enqueueSpeak(pendingVoiceTexts.shift()!);
  }
};

const ensureVoicesReadyHandler = () => {
  if (voicesReadyHandlerSetUp) return;
  voicesReadyHandlerSetUp = true;
  window.speechSynthesis.onvoiceschanged = () => {
    flushPendingVoiceTexts();
  };
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
  if (isTtsEnabled() === false) return;

  if (!('speechSynthesis' in window)) {
    console.warn('[TTS] speechSynthesis not supported');
    return;
  }

  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    enqueueSpeak(text);
  } else {
    pendingVoiceTexts.push(text);
    ensureVoicesReadyHandler();
    setTimeout(() => {
      flushPendingVoiceTexts();
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
  isNextInLine?: boolean,
): string => {
  const aStr =
    teamA.length > 1 ? `${teamA[0]}, and ${teamA[1]}` : teamA[0] || '';
  const bStr =
    teamB.length > 1 ? `${teamB[0]}, and ${teamB[1]}` : teamB[0] || '';
  if (isNextInLine) {
    return `Next in line, please prepare..... ${aStr}... versus... ${bStr}....`;
  }
  return `${aStr}... versus... ${bStr}... Please take the next open court. One minute dinking only....`;
};

// ── Match Start Announcement ─────────────────────────────
export const announceMatchStart = (
  notify: (opts: { type: string; message: string; timeout?: number }) => void,
  match: ActiveMatch,
  _allMatches: ActiveMatch[],
  players: Record<string, Player>,
) => {
  const a = match.teamA.map((u) => getPlayerName(players, u));
  const b = match.teamB.map((u) => getPlayerName(players, u));
  const text = buildMatchAnnounceText(a, b);

  // Announce the newly started match 2 times (ideal for noisy clubs)
  for (let i = 0; i < 2; i++) {
    announce(notify, text, match.matchId);
  }
};
