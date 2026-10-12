import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PassageMark } from '../../../api/contracts/passageMap';
import type { PassageTake, WorkspaceAlignmentResult } from '../../../api/contracts/workspace';
import { mapPassages } from '../../../api/passageMapSpans';
import { usePort } from '../../../ports/usePort';
import type { LinePassage, LineTake } from '../takes/types';

interface ParagraphRange {
  id: string;
  text: string;
  firstToken: number;
  lastToken: number;
  /** Whether the alignment heard any of its words. */
  heard: boolean;
}

/** The first and last alignment tokens of each paragraph, in the order of the chapter. */
function paragraphTokens(ws: WorkspaceAlignmentResult): ParagraphRange[] {
  const out: ParagraphRange[] = [];
  for (const p of ws.paragraphs) {
    const own = ws.tokens.filter((t) => t.p === p.id);
    if (own.length) {
      const indexes = own.map((t) => t.i);
      out.push({ id: p.id, text: p.text, firstToken: Math.min(...indexes), lastToken: Math.max(...indexes), heard: own.some((t) => t.item !== undefined) });
    }
  }
  return out;
}

/**
 * The paragraphs whose takes are asked for: those the alignment heard, and the passages the Booth's passage map recorded
 * (two or more of its takes read them, a roll back included), which need no alignment (TK-1 part 2). Any other paragraph
 * has no takes to set side by side, so it is not asked.
 */
function linesToAsk(ranges: readonly ParagraphRange[], marks: readonly PassageMark[]): ParagraphRange[] {
  const booth = mapPassages(marks, ranges);
  return ranges.filter((r) => r.heard || booth.has(r.id));
}

const takeOf = (c: PassageTake): LineTake => ({
  id: c.id,
  label: c.label,
  active: c.active,
  usable: c.usable,
  ...(c.reason ? { reason: c.reason } : {}),
  sourceFile: c.sourceFile,
  sourceStart: c.sourceStart,
  sourceLength: c.sourceLength,
});

export interface Lines {
  /** The lines with takes, by paragraph id. A line's id is its paragraph's, so the script, the takes and the stack records name one line. */
  byId: ReadonlyMap<string, LinePassage>;
  /** The host's passage id for each line, so a link that names a passage finds its line. */
  passageIds: ReadonlyMap<string, string>;
  /** Asks for the evidence of a line's takes (when they are opened). */
  measure: (id: string) => void;
}

/**
 * The takes of every line of the chapter, from the workspace's `workspaceTakes` (it reads only and works with the DAW closed), and the evidence of
 * the lines whose takes were opened, from the takes port. A line the workspace offers no takes for has none here. The lines asked for are the
 * paragraphs the alignment heard and the passages the Booth's passage map recorded; the host places a take the map stamped exactly.
 */
export function useLines(chapterId: string, ws: WorkspaceAlignmentResult | null): Lines {
  const workspace = usePort('workspace');
  const takesPort = usePort('takes');
  const passageMap = usePort('passageMap');
  const [lines, setLines] = useState<{ byId: Map<string, LinePassage>; passageIds: Map<string, string> }>({ byId: new Map(), passageIds: new Map() });
  const [evidence, setEvidence] = useState<Record<string, Record<string, LineTake['evidence']>>>({});
  const ranges = useMemo(() => (ws ? paragraphTokens(ws) : []), [ws]);

  useEffect(() => {
    let live = true;
    setLines({ byId: new Map(), passageIds: new Map() });
    setEvidence({});
    void passageMap
      .passageMapList(chapterId)
      .then(
        (marks) => marks,
        (): PassageMark[] => [],
      )
      .then((marks) =>
        Promise.all(
          linesToAsk(ranges, marks).map((r) =>
            workspace.workspaceTakes(chapterId, r.firstToken, r.lastToken).then(
              (answer) => ({ r, answer }),
              () => null,
            ),
          ),
        ),
      )
      .then((all) => {
        if (!live) return;
        const byId = new Map<string, LinePassage>();
        const passageIds = new Map<string, string>();
        for (const one of all) {
          if (!one || one.answer.candidates.length === 0) continue;
          const { r, answer } = one;
          byId.set(r.id, { id: r.id, chapterId, firstToken: r.firstToken, lastToken: r.lastToken, script: r.text, takes: answer.candidates.map(takeOf) });
          if (answer.passageId) passageIds.set(answer.passageId, r.id);
        }
        setLines({ byId, passageIds });
      });
    return () => {
      live = false;
    };
  }, [workspace, passageMap, chapterId, ranges]);

  const measure = useCallback(
    (id: string) => {
      const line = lines.byId.get(id);
      if (!line || evidence[id]) return;
      void takesPort.evidence(chapterId, line.firstToken, line.lastToken).then(
        (answer) => setEvidence((e) => ({ ...e, [id]: Object.fromEntries(answer.takes.map((t) => [t.id, t])) })),
        () => undefined,
      );
    },
    [lines, evidence, takesPort, chapterId],
  );

  const byId = useMemo(() => {
    const out = new Map<string, LinePassage>();
    for (const [id, line] of lines.byId) {
      const ev = evidence[id];
      out.set(id, ev ? { ...line, takes: line.takes.map((t) => (ev[t.id] ? { ...t, evidence: ev[t.id] } : t)) } : line);
    }
    return out;
  }, [lines, evidence]);

  return { byId, passageIds: lines.passageIds, measure };
}
