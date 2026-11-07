import { useEffect, useState } from 'react';
import { usePort } from '../../../ports/usePort';
import type { ChapterDoc } from '../model';
import { findingsAt } from './findingLink';

/**
 * The Proof note that names the flagged words (the one Accept dismisses, research note A2), read from the chapter's notes when the card opens: its id is
 * what a marker is put on, since a marker is the DAW's note of a finding (#2830). `undefined` while the notes are read, `null` when none names the
 * words or they could not be read.
 */
export function useFlagNote(doc: ChapterDoc, chapterId: string, keys: readonly string[]): string | null | undefined {
  const findings = usePort('findings');
  const [note, setNote] = useState<string | null | undefined>(undefined);
  const flagged = keys.join('|');
  useEffect(() => {
    let live = true;
    setNote(undefined);
    if (keys.length === 0) {
      setNote(null);
      return;
    }
    findings.findingsList({ chapterId }).then(
      (listed) => live && setNote(findingsAt(doc, chapterId, listed.findings, keys)[0]?.id ?? null),
      () => live && setNote(null),
    );
    return () => {
      live = false;
    };
    // The card is for one flag: the keys, not the document's identity, say when to read again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findings, chapterId, flagged]);
  return note;
}
