import { useEffect, useState } from 'react';
import type { Journal } from '../../studio/journal/createJournal';

/** One history row, newest first, as the journal reports it. */
export type JournalRow = Awaited<ReturnType<Journal['entries']>>[number];

/**
 * The journal's rows, read once and again after every change. `entries()` is async (a DAW entry's refusal asks the DAW), so an
 * answer that arrives after an unmount or after a newer read began is dropped. `null` until the first read lands.
 */
export function useJournalEntries(journal: Pick<Journal, 'entries' | 'subscribe'>): JournalRow[] | null {
  const [rows, setRows] = useState<JournalRow[] | null>(null);
  useEffect(() => {
    let latest = 0;
    let live = true;
    const read = () => {
      const mine = ++latest;
      void journal.entries().then((next) => {
        if (live && mine === latest) setRows(next);
      });
    };
    read();
    const unsubscribe = journal.subscribe(read);
    return () => {
      live = false;
      unsubscribe();
    };
  }, [journal]);
  return rows;
}
