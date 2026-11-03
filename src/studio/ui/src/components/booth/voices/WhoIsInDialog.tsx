import { useMemo, useState } from 'react';
import type { Voice } from '../../engine/voices';
import { Button } from '../../primitives/Button';
import { Checkbox } from '../../primitives/Checkbox';
import { Dialog } from '../../primitives/Dialog';
import { Field } from '../../primitives/Field';
import { Kbd } from '../../primitives/Kbd';
import { RadioGroup, type RadioOption } from '../../primitives/RadioGroup';
import { SectionLabel } from '../../primitives/SectionLabel';
import { Select } from '../../primitives/Select';
import { SpeakerTag } from '../../primitives/SpeakerTag';
import { StatusBadge } from '../../primitives/StatusBadge';
import { defaultTrackName, keyForNewTrack, type Cast, type WhoCharacter } from './whoIsIn';

/** What opened the dialog: a number key with no track behind it, or a character with no track (the voice list's row, the side list's +). */
export type WhoAsk = { kind: 'key'; key: number } | { kind: 'character'; character: WhoCharacter; choice?: WhoChoice };

export type WhoChoice = 'new' | 'existing' | 'narrator';

export type WhoIsInDialogProps = {
  ask: WhoAsk;
  voices: readonly Voice[];
  cast: Cast;
  /** Adds a track named `name` for `characterIds`; resolves true when it was added (the dialog then closes). */
  onAdd: (name: string, characterIds: string[]) => Promise<boolean>;
  /** Puts `characterIds` on the voice `voice` and chooses it; resolves true when it was chosen. */
  onUse: (voice: Voice, characterIds: string[]) => Promise<boolean>;
  /** Records on the Narrator voice this time: chooses it and assigns nothing. */
  onNarrator: (voice: Voice) => void;
  onClose: () => void;
};

const keyName = (key: string) => `Num ${key}`;
const voiceName = (voice: Voice) => voice.name.trim() || 'Unnamed track';
const lineCount = (lines: number) => `${lines} ${lines === 1 ? 'line' : 'lines'}`;
const same = (a: string, b: string) =>
  a.split(/\s+/).filter(Boolean).join(' ').toLocaleLowerCase() === b.split(/\s+/).filter(Boolean).join(' ').toLocaleLowerCase();

/** One character to tick: its speaker tag, then the key of the voice that records it or how many lines it speaks here. */
function CharacterRow({ character, ticked, onTick }: { character: WhoCharacter; ticked: boolean; onTick: (ticked: boolean) => void }) {
  return (
    <Checkbox checked={ticked} onChange={onTick} data-character={character.id}>
      <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 break-words">
          <SpeakerTag label={character.name} speakerId={character.id} />
        </span>
        {character.key !== undefined ? (
          <StatusBadge tone="neutral" label={character.key ? `on ${keyName(character.key)}` : 'on a track'} />
        ) : character.lines > 0 ? (
          <StatusBadge tone="neutral" label={lineCount(character.lines)} />
        ) : null}
      </span>
    </Checkbox>
  );
}

/** A capped, scrolling group of characters to tick (frontend-primitives rule 6). */
function CharacterGroup({
  label,
  characters,
  ticked,
  onTick,
}: {
  label: string;
  characters: readonly WhoCharacter[];
  ticked: ReadonlySet<string>;
  onTick: (id: string, ticked: boolean) => void;
}) {
  if (characters.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>{label}</SectionLabel>
      <div
        role="group"
        aria-label={label}
        className="flex max-h-[11rem] flex-col gap-2 overflow-auto rounded-[var(--radius-button)] border border-[var(--line)] p-2"
      >
        {characters.map((character) => (
          <CharacterRow key={character.id} character={character} ticked={ticked.has(character.id)} onTick={(next) => onTick(character.id, next)} />
        ))}
      </div>
    </div>
  );
}

/**
 * "Who is in Num N?" and "Who records the King of Hearts?" (docs/research/mockups/booth-voices/, #who; docs/prds/booth-voice-tracks.prd.md,
 * phase 5). A number key with no track behind it asks who the new track is for: tick the characters (this chapter's first, then the
 * rest of the book), name it (the one character's name, or Extras) and Add track, which makes it the folder's last child and the next
 * free key. Or put the ticked characters on an existing track, or record on the Narrator this time. A character with no track asks
 * the same three, for that character. Opened only while no take runs: a key during a take stops it first.
 */
export function WhoIsInDialog({ ask, voices, cast, onAdd, onUse, onNarrator, onClose }: WhoIsInDialogProps) {
  const narrator = voices.find((voice) => voice.narrator);
  const others = voices.filter((voice) => !voice.narrator);
  const asked = ask.kind === 'character' ? ask.character : undefined;
  const [choice, setChoice] = useState<WhoChoice>(ask.kind === 'character' ? (ask.choice ?? 'new') : 'new');
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set(asked ? [asked.id] : cast.noTrack.map((character) => character.id)));
  const everyone = useMemo(() => [...cast.inChapter, ...cast.elsewhere, ...(asked ? [asked] : [])], [cast, asked]);
  const tickedCharacters = everyone.filter((character, at) => ticked.has(character.id) && everyone.findIndex((each) => each.id === character.id) === at);
  // The name follows the ticks until the narrator types one.
  const [typed, setTyped] = useState<string | null>(null);
  const name = typed ?? defaultTrackName(tickedCharacters);
  const [existing, setExisting] = useState(others[0]?.guid ?? '');
  const [busy, setBusy] = useState(false);

  const nameProblem =
    name.trim() === ''
      ? 'The new track needs a name.'
      : voices.some((voice) => same(voice.name, name))
        ? `This chapter already has a track named “${name.trim()}”.`
        : undefined;
  const newKey = keyForNewTrack(voices, name);
  const target = others.find((voice) => voice.guid === existing);
  const blocked = choice === 'new' ? Boolean(nameProblem) : choice === 'existing' ? !target : !narrator;
  const title = asked ? `Who records ${asked.name}?` : `Who is in ${keyName(String(ask.kind === 'key' ? ask.key : ''))}?`;
  const action = choice === 'new' ? 'Add track' : choice === 'existing' ? 'Use this track' : 'Arm';

  const options: RadioOption<WhoChoice>[] = [
    {
      value: 'new',
      label: <span className="inline-flex flex-wrap items-center gap-2">A new track{newKey ? <Kbd keys={[keyName(newKey)]} /> : null}</span>,
    },
    {
      value: 'existing',
      label: 'An existing track',
      disabled: others.length === 0,
      description: others.length === 0 ? 'This chapter has no other track yet.' : undefined,
    },
    {
      value: 'narrator',
      label: (
        <span className="inline-flex flex-wrap items-center gap-2">The Narrator, this time{narrator?.key ? <Kbd keys={[keyName(narrator.key)]} /> : null}</span>
      ),
      disabled: !narrator,
      description: narrator ? undefined : 'This chapter has no track named Narrator.',
    },
  ];

  const press = async () => {
    if (busy || blocked) return;
    const ids = tickedCharacters.map((character) => character.id);
    if (choice === 'narrator' && narrator) {
      onNarrator(narrator);
      return;
    }
    setBusy(true);
    try {
      const done = choice === 'new' ? await onAdd(name.trim(), ids) : target ? await onUse(target, ids) : false;
      if (done) onClose();
    } finally {
      setBusy(false);
    }
  };
  const tick = (id: string, next: boolean) =>
    setTicked((now) => {
      const out = new Set(now);
      if (next) out.add(id);
      else out.delete(id);
      return out;
    });

  return (
    <Dialog
      title={title}
      size="form"
      dismissOnOutsidePress={false}
      onClose={busy ? undefined : onClose}
      escapeCloses={!busy}
      actionsAlign="between"
      actions={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button pending={busy} disabled={blocked} onClick={() => void press()} data-who-action={choice}>
            {action}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void press();
        }}
      >
        <RadioGroup label={asked ? `How to record ${asked.name}` : 'How to record them'} value={choice} onChange={setChoice} options={options} />
        {choice === 'existing' && others.length > 0 ? (
          <Select
            label="Track"
            fullWidth
            value={existing}
            onChange={setExisting}
            options={others.map((voice) => ({ value: voice.guid, label: voice.key ? `${keyName(voice.key)} · ${voiceName(voice)}` : voiceName(voice) }))}
          />
        ) : null}
        {!asked && choice !== 'narrator' ? (
          <>
            <CharacterGroup label="In this chapter" characters={cast.inChapter} ticked={ticked} onTick={tick} />
            <CharacterGroup label="Elsewhere in the book" characters={cast.elsewhere} ticked={ticked} onTick={tick} />
          </>
        ) : null}
        {choice === 'new' ? <Field label="Track name" value={name} onChange={setTyped} error={nameProblem} /> : null}
      </form>
    </Dialog>
  );
}
