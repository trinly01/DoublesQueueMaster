import {
  useQuasar,
  type QNotifyCreateOptions,
  type QNotifyUpdateOptions,
} from 'quasar';

// Module-level queue shared across all components
// $q.notify() returns a function that dismisses when called with no args
const activeNotifications: Array<(props?: QNotifyUpdateOptions) => void> = [];

export function useNotify() {
  const $q = useQuasar();

  function notify(opts: QNotifyCreateOptions) {
    const isMobile = $q.screen.lt.sm;
    const max = isMobile ? 2 : 3;
    const position = isMobile ? 'top' : 'top-right';

    // Enforce max concurrent notifications
    while (activeNotifications.length >= max) {
      const oldest = activeNotifications.shift();
      oldest?.();
    }

    const merged: QNotifyCreateOptions = {
      position,
      ...opts,
    };

    // Add close action on mobile
    if (isMobile) {
      merged.actions = [
        ...(merged.actions || []),
        { icon: 'close', color: 'white', handler: () => {} },
      ];
    }

    const n = $q.notify(merged);
    activeNotifications.push(n);
  }

  return { notify };
}
