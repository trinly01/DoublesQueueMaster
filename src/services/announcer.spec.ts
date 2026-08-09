import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Set up window mock for node environment (vitest runs with environment: 'node')
// Must happen before any module that touches window is loaded
if (typeof globalThis.window === 'undefined') {
  (globalThis as Record<string, unknown>).window = {};
}

// Mock useDeviceSettings
vi.mock('src/composables/useDeviceSettings', () => ({
  getDeviceSetting: vi.fn(() => undefined),
}));

// Mock edgeTts — disabled by default so existing tests exercise the speechSynthesis fallback
const mockIsEdgeTtsAvailable = vi.fn(() => false);
const mockEdgeTtsSpeak = vi.fn();
vi.mock('./edgeTts', () => ({
  isEdgeTtsAvailable: () => mockIsEdgeTtsAvailable(),
  edgeTtsSpeak: (...args: unknown[]) => mockEdgeTtsSpeak(...args),
}));

// Mock quasar (needed by MatchmakingApp)
vi.mock('quasar', () => ({
  LocalStorage: {
    getItem: vi.fn(() => null),
    set: vi.fn(),
  },
}));

// ── Mock speechSynthesis ──────────────────────────────
const mockGetVoices = vi.fn();
const mockSpeak = vi.fn();
const mockCancel = vi.fn();
let onvoiceschangedCb: (() => void) | null = null;

// Set up speechSynthesis mock before importing modules that use it
beforeEach(() => {
  onvoiceschangedCb = null;
  mockGetVoices.mockReturnValue([]);
  mockSpeak.mockClear();
  mockCancel.mockClear();

  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      getVoices: mockGetVoices,
      speak: mockSpeak,
      cancel: mockCancel,
      speaking: false,
      pause: vi.fn(),
      resume: vi.fn(),
      get onvoiceschanged() {
        return onvoiceschangedCb;
      },
      set onvoiceschanged(cb: (() => void) | null) {
        onvoiceschangedCb = cb;
      },
    },
  });

  global.SpeechSynthesisUtterance = class MockUtterance {
    text: string;
    rate = 1;
    pitch = 1;
    volume = 1;
    voice: SpeechSynthesisVoice | null = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(text: string) {
      this.text = text;
    }
  } as unknown as typeof SpeechSynthesisUtterance;
});

import {
  announce,
  clearAnnouncements,
  clearSpeechQueue,
  getAnnouncements,
  setAdminMode,
  isSpeaking,
  _testGetSpeechQueue,
  _testGetPendingVoiceTexts,
  _testResetQueues,
} from './announcer';
import { MatchmakingApp } from './matchmaking';

beforeEach(() => {
  vi.clearAllMocks();
  clearAnnouncements();
  _testResetQueues();
  isSpeaking.value = false;

  // Edge TTS disabled by default — existing tests exercise speechSynthesis fallback
  mockIsEdgeTtsAvailable.mockReturnValue(false);
  mockEdgeTtsSpeak.mockReset();

  setAdminMode(true);
  MatchmakingApp.state.ttsEnabled = true;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('announce() — voice loading double-enqueue fix', () => {
  it('enqueues text exactly once when voices not loaded (both onvoiceschanged and setTimeout fire)', () => {
    vi.useFakeTimers();

    const notify = vi.fn();
    announce(notify, 'Test announcement 1', 'm1');

    // Text should be in pending queue, not yet in speech queue
    expect(_testGetPendingVoiceTexts().length).toBe(1);
    expect(_testGetSpeechQueue().length).toBe(0);

    // Fire onvoiceschanged (Path A)
    if (onvoiceschangedCb) onvoiceschangedCb();

    // Advance past setTimeout (Path B)
    vi.advanceTimersByTime(300);

    // Pending queue should be drained, speech queue consumed by playNextInQueue
    expect(_testGetPendingVoiceTexts().length).toBe(0);
    expect(_testGetSpeechQueue().length).toBe(0);
    // Should have spoken exactly once
    expect(mockSpeak).toHaveBeenCalledTimes(1);
    expect((mockSpeak.mock.calls[0][0] as { text: string }).text).toBe(
      'Test announcement 1',
    );

    vi.useRealTimers();
  });

  it('preserves order for multiple calls when voices not loaded', () => {
    vi.useFakeTimers();

    const notify = vi.fn();
    announce(notify, 'First', 'm1');
    announce(notify, 'Second', 'm2');
    announce(notify, 'Third', 'm3');

    // All 3 should be in pending queue
    expect(_testGetPendingVoiceTexts().length).toBe(3);

    // Fire onvoiceschanged to flush all pending
    if (onvoiceschangedCb) onvoiceschangedCb();

    // Pending drained, all 3 should be in speech queue in order
    // (playNextInQueue consumes the first one via speak, remaining stay in queue)
    expect(_testGetPendingVoiceTexts().length).toBe(0);
    expect(mockSpeak).toHaveBeenCalledTimes(1);
    expect((mockSpeak.mock.calls[0][0] as { text: string }).text).toBe('First');
    // Remaining 2 should be in speechQueue waiting
    expect(_testGetSpeechQueue().length).toBe(2);
    expect(_testGetSpeechQueue()[0]).toBe('Second');
    expect(_testGetSpeechQueue()[1]).toBe('Third');

    vi.useRealTimers();
  });

  it('enqueues directly when voices already loaded', () => {
    vi.useFakeTimers();
    mockGetVoices.mockReturnValue([
      { name: 'Test Voice', lang: 'en-US' } as SpeechSynthesisVoice,
    ]);

    const notify = vi.fn();
    announce(notify, 'Direct enqueue test', 'm1');

    // Should not go through pending queue
    expect(_testGetPendingVoiceTexts().length).toBe(0);
    // Should have called speak directly
    expect(mockSpeak).toHaveBeenCalledTimes(1);
    expect((mockSpeak.mock.calls[0][0] as { text: string }).text).toBe(
      'Direct enqueue test',
    );

    vi.useRealTimers();
  });

  it('does not enqueue via setTimeout if onvoiceschanged already flushed', () => {
    vi.useFakeTimers();

    const notify = vi.fn();
    announce(notify, 'Single flush test', 'm1');

    // Fire onvoiceschanged first
    if (onvoiceschangedCb) onvoiceschangedCb();
    expect(mockSpeak).toHaveBeenCalledTimes(1);

    // Advance past setTimeout — should NOT speak again
    vi.advanceTimersByTime(300);
    expect(mockSpeak).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('does not enqueue via onvoiceschanged if setTimeout already flushed', () => {
    vi.useFakeTimers();

    const notify = vi.fn();
    announce(notify, 'Timeout flush test', 'm1');

    // Advance past setTimeout first
    vi.advanceTimersByTime(300);
    expect(mockSpeak).toHaveBeenCalledTimes(1);

    // Fire onvoiceschanged — should NOT speak again
    if (onvoiceschangedCb) onvoiceschangedCb();
    expect(mockSpeak).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});

describe('playNextInQueue — Chrome onend bug workarounds', () => {
  it('force-advances queue on fallback timeout when onend never fires', () => {
    vi.useFakeTimers();
    mockGetVoices.mockReturnValue([
      { name: 'Test Voice', lang: 'en-US' } as SpeechSynthesisVoice,
    ]);

    const notify = vi.fn();
    // Enqueue two texts
    announce(notify, 'First text here', 'm1');
    announce(notify, 'Second text here', 'm2');

    // First text should be speaking
    expect(mockSpeak).toHaveBeenCalledTimes(1);
    expect((mockSpeak.mock.calls[0][0] as { text: string }).text).toBe(
      'First text here',
    );

    // Don't fire onend — advance past fallback timeout
    // estimatedMs = max(15 * 100, 3000) + 5000 = 8000
    vi.advanceTimersByTime(8500);

    // Should have force-advanced to second text
    expect(mockSpeak).toHaveBeenCalledTimes(2);
    expect((mockSpeak.mock.calls[1][0] as { text: string }).text).toBe(
      'Second text here',
    );

    vi.useRealTimers();
  });

  it('clearSpeechQueue increments generation, stale onend ignored', () => {
    vi.useFakeTimers();
    mockGetVoices.mockReturnValue([
      { name: 'Test Voice', lang: 'en-US' } as SpeechSynthesisVoice,
    ]);

    const notify = vi.fn();
    announce(notify, 'Text to cancel', 'm1');

    // Should be speaking
    expect(mockSpeak).toHaveBeenCalledTimes(1);
    const utterance = mockSpeak.mock.calls[0][0] as {
      onend: (() => void) | null;
    };

    // Cancel the queue
    clearSpeechQueue();
    expect(isSpeaking.value).toBe(false);
    expect(_testGetSpeechQueue().length).toBe(0);

    // Fire stale onend — should NOT advance queue or set isSpeaking
    if (utterance.onend) utterance.onend();

    // isSpeaking should still be false (stale callback ignored)
    expect(isSpeaking.value).toBe(false);
    // No additional speak calls
    expect(mockSpeak).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('keep-alive timer is cleared on normal onend', () => {
    vi.useFakeTimers();
    mockGetVoices.mockReturnValue([
      { name: 'Test Voice', lang: 'en-US' } as SpeechSynthesisVoice,
    ]);

    const notify = vi.fn();
    announce(notify, 'Short text', 'm1');

    expect(mockSpeak).toHaveBeenCalledTimes(1);
    const utterance = mockSpeak.mock.calls[0][0] as {
      onend: (() => void) | null;
    };

    // Fire onend normally
    if (utterance.onend) utterance.onend();

    // Advance past keep-alive interval (10s) — should not cause issues
    // since timers were cleared on onend
    vi.advanceTimersByTime(15000);

    // pause/resume should not have been called after onend cleared timers
    // (speaking is false, so even if interval fired, it would early-return)
    expect(isSpeaking.value).toBe(false);

    vi.useRealTimers();
  });
});

describe('playNextInQueue — Edge TTS path', () => {
  it('uses Edge TTS when available and advances queue on audio onended', async () => {
    vi.useFakeTimers();
    mockGetVoices.mockReturnValue([
      { name: 'Test Voice', lang: 'en-US' } as SpeechSynthesisVoice,
    ]);
    mockIsEdgeTtsAvailable.mockReturnValue(true);

    // Mock edgeTtsSpeak to return a fake audio element
    const fakeAudio = {
      onended: null as (() => void) | null,
      onerror: null as (() => void) | null,
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
    };
    const fakeCleanup = vi.fn();
    mockEdgeTtsSpeak.mockResolvedValue({
      audio: fakeAudio,
      cleanup: fakeCleanup,
    });

    const notify = vi.fn();
    announce(notify, 'Edge TTS test', 'm1');

    // Wait for async playNextInQueue to resolve
    await vi.waitFor(() => {
      expect(mockEdgeTtsSpeak).toHaveBeenCalledTimes(1);
    });

    // Should NOT have used speechSynthesis
    expect(mockSpeak).not.toHaveBeenCalled();
    expect(isSpeaking.value).toBe(true);

    // Simulate audio ending
    if (fakeAudio.onended) fakeAudio.onended();

    expect(fakeCleanup).toHaveBeenCalled();

    // onended schedules playNextInQueue via setTimeout — advance past delay
    // (default delay for non-matching text is 400ms)
    vi.advanceTimersByTime(500);
    expect(isSpeaking.value).toBe(false);

    vi.useRealTimers();
  });

  it('falls back to speechSynthesis when Edge TTS throws error', async () => {
    vi.useFakeTimers();
    mockGetVoices.mockReturnValue([
      { name: 'Test Voice', lang: 'en-US' } as SpeechSynthesisVoice,
    ]);
    mockIsEdgeTtsAvailable.mockReturnValue(true);
    mockEdgeTtsSpeak.mockRejectedValue(new Error('Network error'));

    const notify = vi.fn();
    announce(notify, 'Fallback test', 'm1');

    // Wait for edgeTtsSpeak to be called and fail
    await vi.waitFor(() => {
      expect(mockEdgeTtsSpeak).toHaveBeenCalledTimes(1);
    });

    // Should fall back to speechSynthesis
    await vi.waitFor(() => {
      expect(mockSpeak).toHaveBeenCalledTimes(1);
    });
    expect((mockSpeak.mock.calls[0][0] as { text: string }).text).toBe(
      'Fallback test',
    );

    vi.useRealTimers();
  });

  it('falls back to speechSynthesis when isEdgeTtsAvailable returns false', () => {
    vi.useFakeTimers();
    mockGetVoices.mockReturnValue([
      { name: 'Test Voice', lang: 'en-US' } as SpeechSynthesisVoice,
    ]);
    mockIsEdgeTtsAvailable.mockReturnValue(false);

    const notify = vi.fn();
    announce(notify, 'Offline fallback test', 'm1');

    expect(mockEdgeTtsSpeak).not.toHaveBeenCalled();
    expect(mockSpeak).toHaveBeenCalledTimes(1);
    expect((mockSpeak.mock.calls[0][0] as { text: string }).text).toBe(
      'Offline fallback test',
    );

    vi.useRealTimers();
  });

  it('clearSpeechQueue stops current audio element', async () => {
    vi.useFakeTimers();
    mockGetVoices.mockReturnValue([
      { name: 'Test Voice', lang: 'en-US' } as SpeechSynthesisVoice,
    ]);
    mockIsEdgeTtsAvailable.mockReturnValue(true);

    const fakeAudio = {
      onended: null as (() => void) | null,
      onerror: null as (() => void) | null,
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
    };
    const fakeCleanup = vi.fn();
    mockEdgeTtsSpeak.mockResolvedValue({
      audio: fakeAudio,
      cleanup: fakeCleanup,
    });

    const notify = vi.fn();
    announce(notify, 'Audio stop test', 'm1');

    await vi.waitFor(() => {
      expect(mockEdgeTtsSpeak).toHaveBeenCalledTimes(1);
    });

    expect(isSpeaking.value).toBe(true);

    // Cancel while audio is playing
    clearSpeechQueue();

    expect(fakeAudio.pause).toHaveBeenCalled();
    expect(isSpeaking.value).toBe(false);

    // Fire stale onended — should be ignored
    if (fakeAudio.onended) fakeAudio.onended();
    expect(isSpeaking.value).toBe(false);

    vi.useRealTimers();
  });

  it('ignores stale audio onended after generation increment', async () => {
    vi.useFakeTimers();
    mockGetVoices.mockReturnValue([
      { name: 'Test Voice', lang: 'en-US' } as SpeechSynthesisVoice,
    ]);
    mockIsEdgeTtsAvailable.mockReturnValue(true);

    const fakeAudio = {
      onended: null as (() => void) | null,
      onerror: null as (() => void) | null,
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
    };
    const fakeCleanup = vi.fn();
    mockEdgeTtsSpeak.mockResolvedValue({
      audio: fakeAudio,
      cleanup: fakeCleanup,
    });

    const notify = vi.fn();
    announce(notify, 'Stale callback test', 'm1');

    await vi.waitFor(() => {
      expect(mockEdgeTtsSpeak).toHaveBeenCalledTimes(1);
    });

    // Cancel (increments generation)
    clearSpeechQueue();

    // Fire stale onended
    if (fakeAudio.onended) fakeAudio.onended();

    // cleanup should NOT have been called by onended (only by clearSpeechQueue path)
    // and isSpeaking should remain false
    expect(isSpeaking.value).toBe(false);

    vi.useRealTimers();
  });
});

describe('pushAnnouncement — dedup fix', () => {
  it('keeps both records when same matchId announced 2x within 5 seconds', () => {
    vi.useFakeTimers();
    const notify = vi.fn();
    mockGetVoices.mockReturnValue([
      { name: 'Test Voice', lang: 'en-US' } as SpeechSynthesisVoice,
    ]);

    announce(notify, 'First announcement', 'm1');
    announce(notify, 'Second announcement (repeat)', 'm1');

    const records = getAnnouncements();
    // Both should be present (dedup only applies after 5s)
    expect(records.length).toBe(2);

    vi.useRealTimers();
  });

  it('overwrites old record when same matchId announced after 5 seconds', () => {
    vi.useFakeTimers();

    const notify = vi.fn();
    mockGetVoices.mockReturnValue([
      { name: 'Test Voice', lang: 'en-US' } as SpeechSynthesisVoice,
    ]);

    announce(notify, 'Old announcement', 'm1');

    // Advance past 5 seconds
    vi.advanceTimersByTime(6000);

    announce(notify, 'New announcement', 'm1');

    const records = getAnnouncements();
    // Old record should be overwritten (dedup applies after 5s)
    expect(records.length).toBe(1);
    expect(records[0].text).toBe('New announcement');

    vi.useRealTimers();
  });
});
