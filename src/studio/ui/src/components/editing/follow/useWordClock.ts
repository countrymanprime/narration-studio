import { useEffect, useMemo, useState } from 'react';
import type { DawCapabilities, WordTimes } from '../../../api/contracts/daw';
import { usePort } from '../../../ports/usePort';
import type { ChapterDoc } from '../model';
import { buildWordClock, type WordClock } from './wordClock';
import { useVisible } from './useDawPlayPosition';

/**
 * The Editing page's map between its words and the DAW's project seconds: the host's word table (`WorkspaceWordTimes`) laid over the page's words. The
 * table is asked for on opening, when the window is shown, and each time the DAW reports an edit of the project (`daw_project_edited`, REAPER's change
 * counter), so a move, a trim, a rate change, a split or a deleted section is in it as soon as the host reads it. A read that fails keeps the table
 * the page has; a DAW that cannot make one (not answering, `track_state` off, no linked track) leaves the page with no map, and the DAW is not followed.
 */
export function useWordClock(chapterId: string, doc: ChapterDoc, tokenOf: (key: string) => number | undefined, caps: DawCapabilities | null): WordClock | null {
  const sync = usePort('dawTransportSync');
  const visible = useVisible();
  const enabled = !!caps?.reachable && !!caps.capabilities['track_state']?.available;
  const [table, setTable] = useState<WordTimes | null>(null);

  useEffect(() => {
    setTable(null);
    if (!enabled || !visible) return;
    let alive = true;
    let reading = false;
    let again = false;
    let held = -1;
    const read = (): void => {
      if (reading) {
        again = true;
        return;
      }
      reading = true;
      sync.workspaceWordTimes(chapterId).then(
        (answer) => {
          reading = false;
          if (!alive) return;
          held = answer.available ? answer.changeCount : -1;
          setTable(answer.available ? answer : null);
          if (again) {
            again = false;
            read();
          }
        },
        () => {
          reading = false;
          again = false;
        },
      );
    };
    read();
    const stop = sync.subscribeDawProjectEdited((edit) => {
      if (edit.changeCount !== held) read();
    });
    return () => {
      alive = false;
      stop();
    };
  }, [sync, chapterId, enabled, visible]);

  return useMemo(() => (table ? buildWordClock(table, doc, tokenOf) : null), [table, doc, tokenOf]);
}
