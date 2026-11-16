import { expect } from 'vitest';
import type { SaveResult } from './unsavedDrafts';

/**
 * The contract on a holder's `save` (see `UnsavedDraft.save`): once it resolves true the editor renders clean, so the registry's look after the saves finds nothing
 * still held. Every screen's holder test calls this with the registry's `save` after mounting its editor with text typed in, so a holder that clears late fails here and
 * not as "changed while saving" in front of a narrator (#3446).
 */
export async function expectHolderCleanAfterSave(save: () => Promise<SaveResult>): Promise<void> {
  const outcome = await save();
  expect(outcome.saved, 'the save did not succeed').toBe(true);
  expect(
    outcome.late.map((held) => held.label),
    'the editor was still dirty after its own save resolved',
  ).toEqual([]);
}
