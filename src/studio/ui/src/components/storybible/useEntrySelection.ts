import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** The entries ticked in the Story Bible's list (#3662). */
export type EntrySelection = {
  /** The ticked entries that are in the list now, in the list's order: a tick on an entry a filter or a search has since hidden is not counted, so what is deleted is what is on screen. */
  ids: readonly string[];
  has: (id: string) => boolean;
  /** Ticks or unticks one entry; with `range` it ticks every entry between the last one pressed and this one. */
  toggle: (id: string, range?: boolean) => void;
  /** Ticks every entry in the list, or none. */
  setAll: (on: boolean) => void;
  clear: () => void;
};

/**
 * What is ticked in the list of `order` (the entries as drawn: filtered and sorted). It holds only ids, so a reload that changes an entry changes no tick, and an entry
 * the list no longer has (deleted, merged, filtered out) drops out of `ids` at once.
 */
export function useEntrySelection(order: readonly string[]): EntrySelection {
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const anchor = useRef<string | undefined>(undefined);
  const ids = useMemo(() => order.filter((id) => ticked.has(id)), [order, ticked]);
  // A tick on an entry the list no longer shows is forgotten, so it does not come back when a search is cleared, whatever else was pressed meanwhile.
  useEffect(() => {
    setTicked((now) => (ids.length === now.size ? now : new Set(ids)));
  }, [ids]);
  const has = useCallback((id: string) => ticked.has(id), [ticked]);
  const toggle = useCallback(
    (id: string, range = false) => {
      const next = new Set(ids);
      const from = anchor.current !== undefined ? order.indexOf(anchor.current) : -1;
      const to = order.indexOf(id);
      if (range && from >= 0 && to >= 0) {
        // The range takes the state the pressed entry is going to: a range over unticked entries ticks them all.
        const on = !next.has(id);
        for (const between of order.slice(Math.min(from, to), Math.max(from, to) + 1)) {
          if (on) next.add(between);
          else next.delete(between);
        }
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      anchor.current = id;
      setTicked(next);
    },
    [ids, order],
  );
  const setAll = useCallback(
    (on: boolean) => {
      anchor.current = undefined;
      setTicked(on ? new Set(order) : new Set());
    },
    [order],
  );
  const clear = useCallback(() => {
    anchor.current = undefined;
    setTicked(new Set());
  }, []);
  return useMemo(() => ({ ids, has, toggle, setAll, clear }), [ids, has, toggle, setAll, clear]);
}
