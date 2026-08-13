import { ref, onMounted, onUnmounted, onActivated, onDeactivated } from 'vue';

export function useWakeLock() {
  const wakeLock = ref<WakeLockSentinel | null>(null);
  const isLocked = ref(false);

  async function acquire() {
    try {
      if ('wakeLock' in navigator) {
        wakeLock.value = await navigator.wakeLock.request('screen');
        isLocked.value = true;
        wakeLock.value.addEventListener('release', () => {
          isLocked.value = false;
          wakeLock.value = null;
        });
      }
    } catch {
      // Silently fail — wake lock is a progressive enhancement
    }
  }

  function release() {
    if (wakeLock.value) {
      wakeLock.value.release();
      wakeLock.value = null;
      isLocked.value = false;
    }
  }

  async function onVisibilityChange() {
    if (document.visibilityState === 'visible' && !isLocked.value) {
      await acquire();
    }
  }

  onMounted(acquire);
  onActivated(acquire);
  onDeactivated(release);
  onUnmounted(release);

  document.addEventListener('visibilitychange', onVisibilityChange);

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
  });

  return { isLocked };
}
