import { useEffect, useState } from 'react';
import type { ChapterDoc } from '../model';
import { usePort } from '../../../ports/usePort';
import { docFromHeard } from './docFromHeard';

export type EditingDocState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; doc: ChapterDoc; /** Why nothing was transcribed, when `doc.aligned` is false. */ reason: string | null };

/** The chapter's script document: its paragraphs from the workspace port and what was heard from the alignment port, built once per answer. */
export function useEditingDoc(chapterId: string): EditingDocState {
  const workspace = usePort('workspace');
  const alignment = usePort('alignment');
  const [state, setState] = useState<{ chapterId: string; value: EditingDocState }>({ chapterId, value: { status: 'loading' } });

  useEffect(() => {
    let live = true;
    Promise.all([workspace.workspaceAlignment(chapterId), alignment.heard(chapterId)])
      .then(([ws, answer]) => {
        if (live) setState({ chapterId, value: { status: 'ready', doc: docFromHeard(ws.paragraphs, answer), reason: answer.heard ? null : answer.reason } });
      })
      .catch((e: unknown) => {
        if (live) setState({ chapterId, value: { status: 'error', message: e instanceof Error ? e.message : String(e) } });
      });
    return () => {
      live = false;
    };
  }, [workspace, alignment, chapterId]);

  return state.chapterId === chapterId ? state.value : { status: 'loading' };
}
