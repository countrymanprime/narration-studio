// The journalled import (ADR 0771): Add is one journal entry whose inverse is the host's `extractionReopen` for each suggestion the
// import created, run as one undo. A host refusal (a file refused before it was read, a locked entry) is the host's own sentence and
// journals nothing.

import type { ExtractionApi, ExtractionImportResult, ImportFormat } from '../../../../api/contracts/extraction';
import type { Journal, Result } from '../../../../studio/journal/createJournal';

export type ImportEnv = {
  journal: Pick<Journal, 'act'>;
  port: ExtractionApi;
  /** Called after the import and after its undo, so the page that lists the suggestions can read them again. */
  changed?: () => void;
};

const refusal = (error: unknown, fallback: string): { ok: false; refusal: { code: string; reason: string } } => ({
  ok: false,
  refusal: { code: 'host-refused', reason: error instanceof Error ? error.message : fallback },
});

/** Adds what the host's plan of `text` adds or merges. Only the text and the format hint cross; never a file name or path. */
export async function importEntries(env: ImportEnv, text: string, hint?: ImportFormat): Promise<Result<ExtractionImportResult>> {
  const touches = ['extraction'];
  const result = await env.journal.act<ExtractionImportResult>({
    label: 'Imported entries',
    touches,
    async run() {
      try {
        const done = await env.port.extractionImportCommit(text, hint);
        touches.push(...done.suggestions.map((s) => `extraction/${s.id}`), ...done.entryIds.map((id) => `storyBible/${id}`));
        return { ok: true, value: done };
      } catch (error) {
        return refusal(error, 'The host could not import that.');
      }
    },
    async undo(done) {
      for (const suggestion of done.suggestions) {
        try {
          await env.port.extractionReopen(suggestion.id);
        } catch (error) {
          return refusal(error, 'The host could not take the import back.');
        }
      }
      env.changed?.();
      return { ok: true, value: undefined };
    },
  });
  if (!result.ok) return result;
  env.changed?.();
  return { ok: true, value: result.value.value };
}
