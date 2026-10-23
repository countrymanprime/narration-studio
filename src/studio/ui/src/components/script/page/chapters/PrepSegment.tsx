import { PREP_STATES, type PrepState } from '../../../../api/contracts/scriptPrep';
import type { ChapterNameInput } from '../../../../chapterName';
import { chapterName } from '../../../../chapterName';
import { ToggleGroup } from '../../../primitives/ToggleGroup';
import { PREP_LABELS } from '../data/scriptCommands';
import { useScriptCommands, useScriptPrep } from '../data/useScriptData';

// The card's "My prep" control: one button per state with the chapter's own pressed. A press goes through the journalled command,
// which says "{chapter}: {state}" for assistive tech; a refused press is the host's sentence in a toast and the state stays.
export function PrepSegment({ chapter }: { chapter: ChapterNameInput & { id: string } }) {
  const prep = useScriptPrep();
  const { setPrep } = useScriptCommands();
  return (
    <ToggleGroup
      label={`Prep state for ${chapterName(chapter)}`}
      look="segmented"
      value={prep.prepOf(chapter.id)}
      options={PREP_STATES.map((state) => ({ value: state, label: PREP_LABELS[state] }))}
      onChange={(state) => void setPrep(chapter, state as PrepState)}
    />
  );
}
