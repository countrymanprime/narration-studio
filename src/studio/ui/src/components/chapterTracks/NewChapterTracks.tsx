import { useEffect, useMemo, useState } from 'react';
import type { ChapterCreateChoice, ChapterCreateOptions, ChapterCreateVoice } from '../../api/contracts/chapterTrackMap';
import { plural } from '../../plural';
import { Checkbox } from '../primitives/Checkbox';
import { SectionLabel } from '../primitives/SectionLabel';

/** The tracks a new chapter folder is made with besides the Narrator: the project's known voices and Extras, ticked or not, in the order the folder gets them (#3748). */
export type NewChapterPick = { voices: ChapterCreateVoice[]; extras: ChapterCreateVoice };

/** The pick the host sent (the last one made, or every voice and Extras), as the checklist starts; null while it is not read or the project makes no folders. */
export function useNewChapterPick(
  enabled: boolean,
  read: () => Promise<ChapterCreateOptions>,
): {
  pick: NewChapterPick | null;
  setPick: (pick: NewChapterPick) => void;
  failed: boolean;
  choice: ChapterCreateChoice | undefined;
  /** The Narrator's track name as the host sends it, the first track the folder is made with. */
  narrator: string;
} {
  const [pick, setPick] = useState<NewChapterPick | null>(null);
  const [narrator, setNarrator] = useState('Narrator');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    read().then(
      (options) => {
        if (!live) return;
        setFailed(false);
        setNarrator(options.narrator);
        setPick(options.folders ? { voices: options.voices, extras: options.extras } : null);
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [enabled, read]);
  const choice = useMemo(
    () => (pick ? { voices: pick.voices.filter((voice) => voice.checked).map((voice) => voice.name), extras: pick.extras.checked } : undefined),
    [pick],
  );
  return { pick, setPick, failed, choice, narrator };
}

/**
 * The checklist of a new chapter folder's tracks (CS-M7): the Narrator as a fact (it is always made, CS-B7), an "All N" checkbox over the voices when
 * there are two or more, the voices in a list that scrolls inside its own capped height so the dialog's buttons stay on screen, and Extras last.
 */
export function NewChapterTracks({
  narrator,
  pick,
  onChange,
  disabled,
}: {
  narrator: string;
  pick: NewChapterPick;
  onChange: (pick: NewChapterPick) => void;
  disabled?: boolean;
}) {
  const ticked = pick.voices.filter((voice) => voice.checked).length;
  const many = pick.voices.length > 1;
  const setVoice = (name: string, checked: boolean) =>
    onChange({ ...pick, voices: pick.voices.map((voice) => (voice.name === name ? { ...voice, checked } : voice)) });
  return (
    <div role="group" aria-label="Tracks in the new folder" className="flex flex-col gap-1">
      <SectionLabel as="p">Tracks in the new folder, in this order</SectionLabel>
      <p className="text-sm">{narrator} (always)</p>
      {many && (
        <Checkbox
          checked={ticked === pick.voices.length}
          indeterminate={ticked > 0 && ticked < pick.voices.length}
          disabled={disabled}
          onChange={(checked) => onChange({ ...pick, voices: pick.voices.map((voice) => ({ ...voice, checked })) })}
        >
          All {plural(pick.voices.length, 'voice')}
        </Checkbox>
      )}
      {pick.voices.length > 0 && (
        <ul className="m-0 flex max-h-32 list-none flex-col gap-0 overflow-y-auto p-0 pl-6">
          {pick.voices.map((voice) => (
            <li key={voice.name} className="min-w-0">
              <Checkbox checked={voice.checked} disabled={disabled} onChange={(checked) => setVoice(voice.name, checked)}>
                <span dir="auto" className="break-words" title={voice.name}>
                  {voice.name}
                </span>
              </Checkbox>
            </li>
          ))}
        </ul>
      )}
      {pick.extras.name !== '' && (
        <Checkbox checked={pick.extras.checked} disabled={disabled} onChange={(checked) => onChange({ ...pick, extras: { ...pick.extras, checked } })}>
          {pick.extras.name}
        </Checkbox>
      )}
    </div>
  );
}
