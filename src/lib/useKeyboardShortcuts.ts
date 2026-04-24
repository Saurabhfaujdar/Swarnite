import { useEffect, useCallback } from 'react';

export interface ShortcutMap {
  [key: string]: () => void;
}

/**
 * Registers global keyboard shortcuts. Each key in the map is a KeyboardEvent.key
 * value (e.g. "F2", "F5"). The handler receives `preventDefault()` automatically.
 *
 * Re-registers whenever `shortcuts` identity changes – callers should
 * wrap the map in useMemo or define it outside the render cycle.
 */
export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
  const handler = useCallback(
    (e: KeyboardEvent) => {
      // Don't intercept if user is in a textarea/contenteditable
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'TEXTAREA') return;

      const fn = shortcuts[e.key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    },
    [shortcuts],
  );

  useEffect(() => {
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handler]);
}
