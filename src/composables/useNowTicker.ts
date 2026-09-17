import { ref, onScopeDispose, type Ref } from 'vue';

// Shared 1-second ticker — MatchCard and MatchResult each used to run their
// own setInterval per component instance. A single module-level interval
// serves all subscribers; it stops when the last subscriber unmounts.
const now = ref(Date.now());
let subscribers = 0;
let timer: ReturnType<typeof setInterval> | null = null;

export function useNowTicker(intervalMs = 1000): Ref<number> {
  subscribers++;
  if (!timer) {
    now.value = Date.now();
    timer = setInterval(() => {
      now.value = Date.now();
    }, intervalMs);
  }

  onScopeDispose(() => {
    subscribers--;
    if (subscribers <= 0 && timer) {
      clearInterval(timer);
      timer = null;
      subscribers = 0;
    }
  });

  return now;
}
