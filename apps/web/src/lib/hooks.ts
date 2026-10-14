'use client';

import { useEffect, useState } from 'react';

/** `value`, but only after it has stopped changing for `delayMs` (for search-as-you-type). */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/**
 * Previous/next paging over a cursor-paginated endpoint. Cursors only go forward, so the
 * cursors of pages already visited are kept to step back. Changing `resetKey` (e.g. the
 * filters) returns to the first page.
 */
export function useCursorPager(resetKey: string) {
  const [state, setState] = useState({
    key: resetKey,
    stack: [undefined] as (string | undefined)[],
  });
  // Adjusting state while rendering (rather than in an effect) avoids one fetch of a stale page.
  if (state.key !== resetKey) setState({ key: resetKey, stack: [undefined] });

  const stack = state.key === resetKey ? state.stack : [undefined];
  return {
    cursor: stack.at(-1),
    page: stack.length,
    hasPrevious: stack.length > 1,
    next: (cursor: string) => setState((s) => ({ ...s, stack: [...s.stack, cursor] })),
    previous: () => setState((s) => ({ ...s, stack: s.stack.slice(0, -1) })),
  };
}

/** One piece of state for "which of this page's dialogs is open". */
export function useDialogs<T extends string>() {
  const [open, setOpen] = useState<T | null>(null);
  return {
    open,
    show: (which: T) => setOpen(which),
    close: () => setOpen(null),
    props: (which: T) => ({
      open: open === which,
      onOpenChange: (next: boolean) => setOpen(next ? which : null),
    }),
  };
}
