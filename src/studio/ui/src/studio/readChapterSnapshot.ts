import type { ManuscriptChapter } from '../types';
import type { StudioStore } from './store/createStudioStore';
import type { StudioRegistry } from './slots';

/**
 * One read of the chapter list from the store, for a page that works on what it read: the first read of a page joins or serves what the store holds
 * (`ensure`), a Retry or a refresh after a take reads it now (`fresh`). A project switch resets the store while a read may be out; that read belongs to
 * the project before the switch, so it ends in an error the page can show with a Retry, and never in the next project's list.
 */
export async function readChapterSnapshot(store: StudioStore<StudioRegistry>, fresh: boolean): Promise<ManuscriptChapter[]> {
  const generation = store.generation();
  await (fresh ? store.load('chapters') : store.ensure('chapters'));
  if (store.generation() !== generation) throw new Error('The project changed while its chapters were being read.');
  const held = store.getState().slots.chapters;
  if (!held) throw store.getState().errors.chapters ?? new Error('The chapter list is not held.');
  return [...held];
}
