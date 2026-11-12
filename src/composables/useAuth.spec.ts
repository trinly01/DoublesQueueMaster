import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Router } from 'vue-router';

const mocks = vi.hoisted(() => ({
  localStorageRemove: vi.fn(),
  localStorageGetAllKeys: vi.fn<() => string[]>(() => []),
  likhaLogout: vi.fn(),
  notify: vi.fn(),
}));

// Mock quasar before importing useAuth
vi.mock('quasar', () => ({
  LocalStorage: {
    getItem: vi.fn(() => null),
    set: vi.fn(),
    remove: mocks.localStorageRemove,
    getAllKeys: mocks.localStorageGetAllKeys,
    hasItem: vi.fn(() => false),
  },
}));

vi.mock('src/services/likhaClient', () => ({
  likhaClient: {
    logout: (...args: unknown[]) => mocks.likhaLogout(...args),
  },
  clearAuthSession: vi.fn(),
}));

vi.mock('src/services/playerProfile', () => ({
  PlayerProfile: { clearProfile: vi.fn() },
}));

vi.mock('src/composables/useNotify', () => ({
  useNotify: () => ({ notify: mocks.notify }),
}));

import { useAuth, registerBeforeLogoutHook } from './useAuth';
import { clearAuthSession } from 'src/services/likhaClient';

const makeRouter = () =>
  ({ push: vi.fn(), replace: vi.fn() }) as unknown as Router & {
    push: ReturnType<typeof vi.fn>;
  };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.likhaLogout.mockResolvedValue(undefined);
  mocks.localStorageGetAllKeys.mockReturnValue([]);
});

describe('useAuth — logout ordering (RESET_DECISION #16)', () => {
  it('runs pre-logout hooks BEFORE likhaClient.logout clears credentials', async () => {
    const hook = vi.fn().mockResolvedValue(undefined);
    const unregister = registerBeforeLogoutHook(hook);
    try {
      const router = makeRouter();
      await useAuth().logout(router);

      expect(hook).toHaveBeenCalledTimes(1);
      expect(mocks.likhaLogout).toHaveBeenCalledTimes(1);
      // Flush must precede the server logout — the SDK logout wipes stored
      // credentials, so a sync flush after it would 401 and drop the push.
      expect(hook.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.likhaLogout.mock.invocationCallOrder[0],
      );
      expect(clearAuthSession).toHaveBeenCalledTimes(1);
      expect(router.push).toHaveBeenCalledWith('/login');
    } finally {
      unregister();
    }
  });

  it('still completes logout when a hook throws or hangs past the timeout', async () => {
    vi.useFakeTimers();
    try {
      const badHook = vi.fn().mockRejectedValue(new Error('sync failed'));
      const hungHook = vi.fn(() => new Promise<void>(() => {}));
      const unregisterBad = registerBeforeLogoutHook(badHook);
      const unregisterHung = registerBeforeLogoutHook(hungHook);
      const router = makeRouter();
      const pending = useAuth().logout(router);
      // Let microtasks flush, then advance past the flush timeout — the
      // hung hook must not trap logout.
      await vi.advanceTimersByTimeAsync(6000);
      await pending;
      unregisterBad();
      unregisterHung();
      expect(badHook).toHaveBeenCalledTimes(1);
      expect(router.push).toHaveBeenCalledWith('/login');
      expect(clearAuthSession).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('unregistered hooks do not run', async () => {
    const hook = vi.fn();
    const unregister = registerBeforeLogoutHook(hook);
    unregister();
    const router = makeRouter();
    await useAuth().logout(router);
    expect(hook).not.toHaveBeenCalled();
  });
});

describe('useAuth — handleAuthError', () => {
  it('ignores non-401 errors', async () => {
    const router = makeRouter();
    const handled = await useAuth().handleAuthError(
      { response: { status: 500 } },
      router,
    );
    expect(handled).toBe(false);
    expect(mocks.likhaLogout).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('logs out on 401', async () => {
    const router = makeRouter();
    const handled = await useAuth().handleAuthError(
      { response: { status: 401 } },
      router,
    );
    expect(handled).toBe(true);
    expect(router.push).toHaveBeenCalledWith('/login');
  });
});
