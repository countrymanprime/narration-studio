import type { Marks } from '../../../api/contracts/marks';
import type { GuideEntity } from '../../../api/contracts/storyBible';
import { entryColour } from '../../../kinds/entityColour';
import type { GuideType } from '../../../types';
import { markNote } from './decorations';
import type { BoothReference } from './sections';
import type { ReferenceTarget } from './useBoothReference';

/** The entry and the mark a reference target names, as the side panel draws them; nothing when neither is there any more. */
export function referenceOf(
  target: ReferenceTarget | null,
  entities: readonly GuideEntity[],
  marks: Marks,
  types: readonly GuideType[],
): BoothReference | null {
  if (!target) return null;
  const entry = target.entryId ? entities.find((item) => item.id === target.entryId) : undefined;
  const mark = target.noteId ? marks.marks.find((item) => item.id === target.noteId) : undefined;
  return entry || mark ? { entry, colour: entry && entryColour(types, entry.category), note: mark && markNote(mark, marks) } : null;
}
