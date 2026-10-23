import { useEffect, useMemo, useRef, useState } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import type { Finding } from '../../../api/contracts/findings';
import type { WorkspaceAlignmentResult, WorkspaceTakesResult } from '../../../api/contracts/workspace';
import { usePort } from '../../../ports/usePort';
import { heardText, passageOf, spotOf, takeCounts, type Spot } from './spot';

export type SpotTakesRead = {
  /** Takes per note id, only for notes whose spot has several. Empty until the host answers: rows draw without a badge meanwhile. */
  counts: ReadonlyMap<string, number>;
  /** The spot of a note, or null when it has fewer than two takes (or its passage is not in the alignment). */
  spotFor: (noteId: string) => Spot | null;
  /** The host's refusal sentence for a note's takes, when it refused. */
  refusalFor: (noteId: string) => string | undefined;
};

type Answer = { spot: Spot | null } | { refusal: string };

/** Where the passage starts on the timeline: its first heard word on its item, else the note's own time. */
function startOf(alignment: WorkspaceAlignmentResult, firstToken: number, fallback: number): number {
  const token = alignment.tokens.find((t) => t.i === firstToken);
  const item = token?.item === undefined ? undefined : alignment.items.find((i) => i.index === token.item);
  if (token?.start === undefined || item?.position === undefined || item.sourceStart === undefined) return fallback;
  return item.position + (token.start - item.sourceStart) / (item.playRate || 1);
}

/**
 * The takes at the spots of a page of notes (SN-Q7). Reads the chapter's alignment once, then asks the host for the takes once per
 * distinct passage (cached by chapter and token range), and never blocks: the answer fills in as it arrives. Reads only.
 */
export function useSpotTakes(chapterId: string, notes: readonly Finding[]): SpotTakesRead {
  const workspace = usePort('workspace');
  const cache = useRef(new Map<string, Promise<WorkspaceTakesResult>>());
  const alignments = useRef(new Map<string, Promise<WorkspaceAlignmentResult>>());
  const [answers, setAnswers] = useState<ReadonlyMap<string, Answer>>(new Map());

  useEffect(() => {
    let live = true;
    const ofChapter = notes.filter((note) => (note.manuscript?.chapter_id ?? '') === chapterId && note.manuscript?.span?.paragraph_id);
    if (!chapterId || ofChapter.length === 0) {
      setAnswers(new Map());
      return;
    }
    const alignment = alignments.current.get(chapterId) ?? workspace.workspaceAlignment(chapterId);
    alignments.current.set(chapterId, alignment);
    void alignment
      .then(async (aligned) => {
        const next = new Map<string, Answer>();
        await Promise.all(
          ofChapter.map(async (note) => {
            const paragraphId = note.manuscript?.span?.paragraph_id;
            const passage = passageOf(aligned, paragraphId);
            if (!passage) return;
            const key = `${chapterId}:${passage.firstToken}:${passage.lastToken}`;
            const read = cache.current.get(key) ?? workspace.workspaceTakes(chapterId, passage.firstToken, passage.lastToken);
            cache.current.set(key, read);
            try {
              const result = await read;
              const script = aligned.paragraphs.find((p) => p.id === paragraphId)?.text ?? '';
              const at = startOf(aligned, passage.firstToken, note.time_range?.start ?? 0);
              next.set(note.id, { spot: spotOf(result, { script, at, heard: heardText(aligned.tokens, passage.firstToken, passage.lastToken) }) });
            } catch (error) {
              cache.current.delete(key);
              next.set(note.id, { refusal: apiErrorMessage(error) });
            }
          }),
        );
        if (live) setAnswers(next);
      })
      .catch(() => {
        alignments.current.delete(chapterId);
      });
    return () => {
      live = false;
    };
  }, [workspace, chapterId, notes]);

  return useMemo(() => {
    const spots = new Map<string, Spot | null>();
    for (const [id, answer] of answers) if ('spot' in answer) spots.set(id, answer.spot);
    return {
      counts: takeCounts(spots),
      spotFor: (id) => spots.get(id) ?? null,
      refusalFor: (id) => {
        const answer = answers.get(id);
        return answer && 'refusal' in answer ? answer.refusal : undefined;
      },
    };
  }, [answers]);
}
