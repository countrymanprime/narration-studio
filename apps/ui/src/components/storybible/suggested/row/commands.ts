// The journalled decisions on a suggestion (ADR 0771): Accept, Reject and Mark reviewed are each one journal entry, and the inverse
// of each is the host's `extractionReopen`, which puts the suggestion back to the status the 75% rule gave it. They take the port
// and the journal as arguments, so the row calls them through `useSuggestionDecisions` and writes no journalling of its own.
// A host refusal (a locked entry, a name another entry owns) comes back as the host's own sentence and journals nothing.

import type { ExtractionApi, ExtractionDecision } from '../../../../api/contracts/extraction';
import type { Journal, Result } from '../../../../studio/journal/createJournal';

export type DecisionEnv = {
  journal: Pick<Journal, 'act'>;
  port: ExtractionApi;
  /** Called with what a decision, or the undo of one, did, so the page can show the suggestion as it is now. */
  changed?: (decision: ExtractionDecision) => void;
};

/** The host's sentence as the refusal; the mock and the Wails client both reject with an `Error` carrying it. */
async function attempt(call: () => Promise<ExtractionDecision>): Promise<Result<ExtractionDecision>> {
  try {
    return { ok: true, value: await call() };
  } catch (error) {
    return { ok: false, refusal: { code: 'host-refused', reason: error instanceof Error ? error.message : 'The host refused that change.' } };
  }
}

/** Runs one decision as one journal entry. A decision touches the suggestion, and the Story Bible entries the host says it changed. */
async function decide(env: DecisionEnv, id: string, label: string, call: () => Promise<ExtractionDecision>): Promise<Result<ExtractionDecision>> {
  const touches = [`extraction/${id}`];
  const result = await env.journal.act<ExtractionDecision>({
    label,
    touches,
    async run() {
      const decided = await attempt(call);
      if (decided.ok) touches.push(...decided.value.entryIds.map((entryId) => `storyBible/${entryId}`));
      return decided;
    },
    async undo() {
      const reopened = await attempt(() => env.port.extractionReopen(id));
      if (reopened.ok) env.changed?.(reopened.value);
      return reopened;
    },
  });
  if (!result.ok) return result;
  env.changed?.(result.value.value);
  return { ok: true, value: result.value.value };
}

/** Accepts a suggestion; `text`, when given, is what the narrator edited it to (Save and accept). */
export const acceptSuggestion = (env: DecisionEnv, id: string, text?: string): Promise<Result<ExtractionDecision>> =>
  decide(env, id, 'Accepted a suggestion', () => env.port.extractionAccept(id, text));

export const rejectSuggestion = (env: DecisionEnv, id: string): Promise<Result<ExtractionDecision>> =>
  decide(env, id, 'Rejected a suggestion', () => env.port.extractionReject(id));

/** Makes an automatic acceptance the narrator's. */
export const reviewSuggestion = (env: DecisionEnv, id: string): Promise<Result<ExtractionDecision>> =>
  decide(env, id, 'Marked a suggestion reviewed', () => env.port.extractionReview(id));
