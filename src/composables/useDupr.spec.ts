import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('quasar', () => ({
  LocalStorage: {
    getItem: vi.fn(() => null),
    set: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock('src/services/likhaClient', () => ({
  likhaClient: {
    request: vi.fn(),
    connect: vi.fn(async () => {}),
    subscribe: vi.fn(),
  },
}));

vi.mock('@likha-erp/likha-sdk', () => ({
  readItems: vi.fn(),
  readSingleton: vi.fn(),
}));

import { DuprServiceInstance } from './useDupr';
import { likhaClient } from 'src/services/likhaClient';
import { displayRatingColor, getRatingColor } from '../utils/playerHelpers';

describe('hide_internal_rating (DUPR compliance)', () => {
  beforeEach(() => {
    DuprServiceInstance.state.settings = null;
  });

  it('is false when unset, null, or false', () => {
    expect(DuprServiceInstance.hideInternalRating).toBe(false);
    DuprServiceInstance.state.settings = { hide_internal_rating: null } as never;
    expect(DuprServiceInstance.hideInternalRating).toBe(false);
    DuprServiceInstance.state.settings = {
      hide_internal_rating: false,
    } as never;
    expect(DuprServiceInstance.hideInternalRating).toBe(false);
  });

  it('is true when the workspace flag is set', () => {
    DuprServiceInstance.state.settings = { hide_internal_rating: true } as never;
    expect(DuprServiceInstance.hideInternalRating).toBe(true);
  });

  it('displayRatingColor neutralizes tier colors only when hidden', () => {
    DuprServiceInstance.state.settings = { hide_internal_rating: true } as never;
    expect(displayRatingColor(2100)).toBe('grey-6');
    DuprServiceInstance.state.settings = {
      hide_internal_rating: false,
    } as never;
    expect(displayRatingColor(2100)).toBe(getRatingColor(2100));
  });

  it('duprAppUrl follows the configured environment', () => {
    DuprServiceInstance.state.settings = { environment: 'production' } as never;
    expect(DuprServiceInstance.duprAppUrl).toBe('https://dashboard.dupr.com');
    DuprServiceInstance.state.settings = { environment: 'uat' } as never;
    expect(DuprServiceInstance.duprAppUrl).toBe('https://uat.dupr.gg');
  });

  it('seedRatings fills the display map without clobbering fresher data', () => {
    const svc = DuprServiceInstance;
    svc.state.ratingsMap = {};
    svc.seedRatings([{ duprId: 'ABC123', singles: 4.5, doubles: 3.8 }]);
    expect(svc.duprDoublesOf('ABC123')).toBe(3.8);
    expect(svc.duprSinglesOf('ABC123')).toBe(4.5);
    // Existing entries (e.g. from a batch fetch) win over later seeds
    svc.state.ratingsMap['XYZ789'] = { singles: null, doubles: 2.5 };
    svc.seedRatings([{ duprId: 'XYZ789', singles: 1.0, doubles: 1.0 }]);
    expect(svc.duprDoublesOf('XYZ789')).toBe(2.5);
    // Unknown / missing ids resolve to null, never to an internal rating
    expect(svc.duprDoublesOf('NOBODY')).toBeNull();
    expect(svc.duprDoublesOf(undefined)).toBeNull();
    expect(svc.duprDoublesOf('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// B3 — dupr_submission realtime refetch throttle (~750ms leading+trailing)
// ---------------------------------------------------------------------------
describe('useDupr — submission realtime throttle', () => {
  /** Controllable async iterable standing in for the WS subscription. */
  function makeSubscription() {
    const queued: unknown[] = [];
    const waiters: Array<(r: IteratorResult<unknown>) => void> = [];
    let ended = false;
    return {
      push(msg: unknown) {
        const waiter = waiters.shift();
        if (waiter) waiter({ value: msg, done: false });
        else queued.push(msg);
      },
      end() {
        ended = true;
        waiters.splice(0).forEach((w) => w({ value: undefined, done: true }));
      },
      iterable: {
        [Symbol.asyncIterator]() {
          return {
            next(): Promise<IteratorResult<unknown>> {
              if (queued.length)
                return Promise.resolve({
                  value: queued.shift(),
                  done: false,
                });
              if (ended)
                return Promise.resolve({ value: undefined, done: true });
              return new Promise((resolve) => waiters.push(resolve));
            },
          };
        },
      },
    };
  }

  const flushMicrotasks = async () => {
    // Let the for-await loop consume queued messages and run scheduled
    // fetches (promise .then chains) without advancing the clock.
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
    DuprServiceInstance.stopSubmissionRealtime();
    // Private throttle state — reset so each test starts at the leading edge.
    (DuprServiceInstance as unknown as { lastSubmissionRefetchAt: number })
      .lastSubmissionRefetchAt = 0;
    vi.mocked(likhaClient.subscribe).mockReset();
    vi.mocked(likhaClient.connect).mockClear();
  });

  afterEach(() => {
    DuprServiceInstance.stopSubmissionRealtime();
    vi.useRealTimers();
  });

  async function startStream() {
    const sub = makeSubscription();
    vi.mocked(likhaClient.subscribe).mockResolvedValue({
      subscription: sub.iterable,
      unsubscribe: vi.fn(),
    } as never);
    const fetchSpy = vi
      .spyOn(DuprServiceInstance, 'fetchSubmissions')
      .mockResolvedValue([]);
    await DuprServiceInstance.startSubmissionRealtime('club-1');
    await flushMicrotasks();
    return { sub, fetchSpy };
  }

  it('first message refetches immediately (leading edge)', async () => {
    const { sub, fetchSpy } = await startStream();
    sub.push({ type: 'subscription', data: { id: 's1' } });
    await flushMicrotasks();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith('club-1');
    fetchSpy.mockRestore();
  });

  it('burst of messages coalesces into one trailing refetch', async () => {
    const { sub, fetchSpy } = await startStream();
    // Leading edge on the first message.
    sub.push({ type: 'subscription' });
    await flushMicrotasks();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // Five more events inside the 750ms window → single trailing refetch.
    for (let i = 0; i < 5; i++) sub.push({ type: 'subscription' });
    await flushMicrotasks();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(750);
    await flushMicrotasks();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // Quiet period afterwards — no further fetches.
    await vi.advanceTimersByTimeAsync(2000);
    await flushMicrotasks();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    fetchSpy.mockRestore();
  });

  it('sustained burst refetches ~once per window (no starvation)', async () => {
    const { sub, fetchSpy } = await startStream();
    // One event every 100ms for 2s — 20 events total.
    for (let t = 0; t < 2000; t += 100) {
      sub.push({ type: 'subscription' });
      await vi.advanceTimersByTimeAsync(100);
      await flushMicrotasks();
    }
    // Without throttling this would be 20 fetches; leading+trailing gives
    // roughly one per 750ms window (~3 by t=2000, trailing pending).
    const calls = fetchSpy.mock.calls.length;
    expect(calls).toBeGreaterThanOrEqual(3);
    expect(calls).toBeLessThanOrEqual(5);
    expect(calls).toBeLessThan(10);
    fetchSpy.mockRestore();
  });

  it('ignores non-subscription message types', async () => {
    const { sub, fetchSpy } = await startStream();
    sub.push({ type: 'ping' });
    sub.push({ type: 'heartbeat' });
    await flushMicrotasks();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('stream end still refetches immediately and resubscribes after 10s', async () => {
    const { sub, fetchSpy } = await startStream();
    sub.push({ type: 'subscription' });
    await flushMicrotasks();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const subscribeCallsBefore = vi.mocked(likhaClient.subscribe).mock.calls
      .length;

    sub.end();
    await flushMicrotasks();
    // Immediate catch-up refetch on stream end (unchanged behavior).
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(10000);
    await flushMicrotasks();
    // Self-heal resubscribed.
    expect(vi.mocked(likhaClient.subscribe).mock.calls.length).toBe(
      subscribeCallsBefore + 1,
    );
    fetchSpy.mockRestore();
  });
});
