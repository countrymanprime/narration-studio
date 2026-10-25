import type { DawResult } from '../../../../api/contracts/daw';
import type { ReplaceAudioApi, Replacement } from '../../../../api/contracts/replace';
import type { DawClient } from '../../../../ports/daw';
import type { Command, Result } from '../../../../studio/journal/createJournal';
import { clock } from '../../bar/clock';

/** What the dialog asks for: the words as token indices, their stretch in seconds of their file, the fade at each seam and the level change. */
export interface ReplaceAsk {
  chapterId: string;
  firstToken: number;
  lastToken: number;
  /** How many words, and where they start in the chapter, for the history's label. */
  words: number;
  start: number;
  narrator: string;
  fileId: string;
  sourceStart: number;
  sourceEnd: number;
  fadeMs: number;
  gainDb: number;
}

export interface ReplaceDeps {
  api: Pick<ReplaceAudioApi, 'dawReplaceRange' | 'editingReplacementRemove'>;
  daw: Pick<DawClient, 'undoLast'>;
  /** The chapter's replacements after the edit or its undo, so the page names the other narrator on the words. */
  onReplacements: (replacements: Replacement[]) => void;
}

export interface ReplaceDone {
  id: string;
  message: string;
  undoSteps: number;
}

/** The kind of DAW change a replacement is, in the DAW port's words (`DawActionKind`). */
export const REPLACE_KIND = 'replace_range';

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const refusal = (code: string, reason: string): Result<never> => ({ ok: false, refusal: { code, reason } });
const failed = (e: unknown): DawResult => ({ ok: false, changed: false, message: why(e), undoSteps: 0, refused: why(e) });

/** The history entry's name: "Replaced 13 words with Eric Leach's audio at 0:54". */
export function replaceLabel(words: number, narrator: string, start: number): string {
  return `Replaced ${plural(words, 'word', 'words')} with ${narrator}'s audio at ${clock(start)}`;
}

/**
 * Replaces the words with their stretch as one history entry (#2251). The host checks and records it; the inverse asks the DAW to undo the one
 * point the replacement made, and only then forgets the record, so the words never read as the narrator's own over audio that is still theirs.
 * The journal runs the inverse only while the DAW's last action is this replacement (docs/architecture/ui-state-and-journal.md#the-journal-and-undo);
 * after that, Put my audio back is the way back.
 */
export function replaceCommand(deps: ReplaceDeps, ask: ReplaceAsk): Command<ReplaceDone> {
  return {
    label: replaceLabel(ask.words, ask.narrator, ask.start),
    touches: [`editing/${ask.chapterId}/replacements`],
    daw: true,
    dawAction: ({ undoSteps }) => (undoSteps === 1 ? { kind: REPLACE_KIND, steps: 1 } : undefined),
    async run() {
      let answer;
      try {
        answer = await deps.api.dawReplaceRange(
          ask.chapterId,
          ask.firstToken,
          ask.lastToken,
          ask.fileId,
          ask.sourceStart,
          ask.sourceEnd,
          ask.fadeMs,
          ask.gainDb,
        );
      } catch (e) {
        return refusal('host_refused', why(e));
      }
      const { result } = answer;
      if (!result.ok) return refusal(result.code ?? 'daw_refused', result.refused ?? result.message);
      deps.onReplacements(answer.replacements.replacements);
      // The DAW made the edit but the host could not record it: the message says so, and Undo stays the way back.
      return { ok: true, value: { id: answer.replacementId, message: result.message, undoSteps: result.undoSteps } };
    },
    async undo({ id }) {
      const res = await deps.daw.undoLast(REPLACE_KIND, 1).catch(failed);
      if (!res.ok) return refusal('daw_refused', res.refused ?? res.message);
      if (!id) return { ok: true, value: id };
      try {
        deps.onReplacements((await deps.api.editingReplacementRemove(ask.chapterId, id)).replacements);
      } catch (e) {
        return refusal('host_refused', why(e));
      }
      return { ok: true, value: id };
    },
  };
}
