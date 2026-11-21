import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChapterCreateChoice, ChapterCreateOptions, ChapterCreateVoice } from '../../api/contracts/chapterTrackMap';
import { plural } from '../../plural';
import { Checkbox } from '../primitives/Checkbox';
import { SectionLabel } from '../primitives/SectionLabel';

/** The tracks a new chapter folder is made with besides the Narrator: the project's known voices and Extras, ticked or not, in the order the folder gets them (#3748). `omitted` is how many known voices the list leaves off at its cap. */
export type NewChapterPick = { voices: ChapterCreateVoice[]; extras: ChapterCreateVoice; omitted?: number };

/** The pick the host answered, with the ticks the narrator already made kept for the voices still in it: a read again never undoes a tick, and a voice that is new takes the host's. */
export function mergePick(host: NewChapterPick, mine: NewChapterPick | null): NewChapterPick {
  if (!mine) return host;
  const ticked = new Map(mine.voices.map((voice) => [voice.name, voice.checked]));
  return {
    ...host,
    voices: host.voices.map((voice) => ({ ...voice, checked: ticked.get(voice.name) ?? voice.checked })),
    extras: { ...host.extras, checked: mine.extras.checked },
  };
}

/** The pick sent with Create: the ticked voices, the unticked ones the list showed (what is remembered as left out), and Extras. */
export function choiceOf(pick: NewChapterPick): ChapterCreateChoice {
  return {
    voices: pick.voices.filter((voice) => voice.checked).map((voice) => voice.name),
    skipped: pick.voices.filter((voice) => !voice.checked).map((voice) => voice.name),
    extras: pick.extras.checked,
  };
}

/**
 * The pick the host sent (the last one made, or every voice and Extras), as the checklist starts; null while it is not read or the project makes no
 * folders. `loading` is true until the first answer or failure, so a Create pressed before the list is there can wait for it; `reload` reads it again
 * (Check again, the window regaining focus) and keeps the ticks already made.
 */
export function useNewChapterPick(
  enabled: boolean,
  read: () => Promise<ChapterCreateOptions>,
): {
  pick: NewChapterPick | null;
  setPick: (pick: NewChapterPick) => void;
  failed: boolean;
  loading: boolean;
  reload: () => void;
  choice: ChapterCreateChoice | undefined;
  /** The Narrator's track name as the host sends it, the first track the folder is made with. */
  narrator: string;
} {
  const [pick, setPick] = useState<NewChapterPick | null>(null);
  const [narrator, setNarrator] = useState('Narrator');
  const [failed, setFailed] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [again, setAgain] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    read().then(
      (options) => {
        if (!live) return;
        setFailed(false);
        setAnswered(true);
        setNarrator(options.narrator);
        const host = options.folders ? { voices: options.voices, extras: options.extras, omitted: options.omitted } : null;
        setPick((mine) => (host ? mergePick(host, mine) : null));
      },
      () => {
        if (!live) return;
        setFailed(true);
        setAnswered(true);
      },
    );
    return () => {
      live = false;
    };
  }, [enabled, read, again]);
  const reload = useCallback(() => setAgain((n) => n + 1), []);
  // The list is read again when the window regains focus: the project may have changed behind it (a voice added, the pick set in Settings).
  useEffect(() => {
    if (!enabled) return;
    window.addEventListener('focus', reload);
    return () => window.removeEventListener('focus', reload);
  }, [enabled, reload]);
  const choice = useMemo(() => (pick ? choiceOf(pick) : undefined), [pick]);
  return { pick, setPick, failed, loading: enabled && !answered, reload, choice, narrator };
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
    <div role="group" aria-label="Tracks in the new folder" className="flex min-w-0 flex-col gap-1">
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
        <ul className={`scroll-y-edges m-0 flex max-h-32 min-w-0 list-none flex-col gap-0 overflow-y-auto p-0 ${many ? 'pl-6' : ''}`}>
          {pick.voices.map((voice) => (
            <li key={voice.name} className="min-w-0">
              <Checkbox checked={voice.checked} disabled={disabled} onChange={(checked) => setVoice(voice.name, checked)}>
                <span dir="auto" className="[overflow-wrap:anywhere]">
                  {voice.name}
                </span>
              </Checkbox>
            </li>
          ))}
        </ul>
      )}
      {pick.omitted ? <p className="text-sm text-[var(--text-muted)]">{plural(pick.omitted, 'more voice')} not listed.</p> : null}
      {pick.extras.name !== '' && (
        <Checkbox checked={pick.extras.checked} disabled={disabled} onChange={(checked) => onChange({ ...pick, extras: { ...pick.extras, checked } })}>
          {pick.extras.name}
        </Checkbox>
      )}
    </div>
  );
}
