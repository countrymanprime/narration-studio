import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { VOICE_SAMPLE_LABEL_MAX, VOICE_SAMPLE_NOTE_MAX } from '../../../api/contracts/voiceSamples';
import { Button } from '../../primitives/Button';
import { Checkbox } from '../../primitives/Checkbox';
import { FIELD_LABEL_CLASSES } from '../../primitives/Field';
import { Icon } from '../../primitives/Icon';
import { IconButton } from '../../primitives/IconButton';
import { Select } from '../../primitives/Select';
import { TextField } from '../../primitives/TextField';
import { useRangePlayer } from '../../engine/useRangePlayer';
import { stopSample } from '../../voicesamples/samplePlayerStore';
import type { CharacterChoice } from './voiceSampleCharacters';

/** The part of the words the narrator can hear before saving: a stretch of one item's source file. */
export type Audition = {
  sourceFile: string;
  start: number;
  end: number;
  mediaUrl: (sourceFile: string) => string;
  /** Set while a linked DAW plays the chapter: Play plays the words through the page's playback (the DAW), never the app's audio. */
  through?: { play: () => void; stop: () => void };
};

type VoiceSampleValues = { characterId: string; label: string; note: string; makePrimary: boolean };

export type VoiceSampleDialogProps = {
  /** The script words the sample records, or the selection's words when it cannot be made. */
  words: string;
  /** Why the words cannot be a sample (the host's sentence); the dialog shows it and keeps Save off. */
  refusal?: string;
  /** What could not be read while the dialog opened (the character list, the sample counts); shown as a note, and the dialog still works. */
  notice?: string;
  /** Seconds of the marked words, without the handles the host adds. */
  seconds?: number;
  audition?: Audition;
  choices: readonly CharacterChoice[];
  /** How many samples each character has, by character id. */
  counts: Readonly<Record<string, number>>;
  /** How many samples a character may have. */
  limit: number;
  initialCharacterId: string;
  /** Saves the sample; a refusal or a failure comes back as its sentence and the dialog stays. */
  onSave: (values: VoiceSampleValues) => Promise<{ ok: true } | { ok: false; message: string }>;
  onCancel: () => void;
};

const COULD_NOT_PLAY = "That stretch couldn't be played. Check that its audio file is still where the project expects it.";

const alert = 'm-0 rounded-lg bg-[var(--warn-soft)] px-3 py-2.5 text-sm';

/**
 * The Voice sample dialog (the approved mock's, docs/research/mockups/voice-samples/): the character, the words with a play control, a label and a
 * note, and whether the sample becomes the character's primary. Enter saves from anywhere but the note and a button, Ctrl+Enter saves from the
 * note, Esc closes (the modal shell). A second press while it saves does nothing; a refusal from the host shows its sentence and Save stays.
 */
export function VoiceSampleDialog({
  words,
  refusal,
  notice,
  seconds,
  audition,
  choices,
  counts,
  limit,
  initialCharacterId,
  onSave,
  onCancel,
}: VoiceSampleDialogProps) {
  const [characterId, setCharacterId] = useState(initialCharacterId);
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [primaryChoice, setPrimaryChoice] = useState<boolean | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState('');
  const busy = useRef(false);
  const player = useRangePlayer(audition?.mediaUrl ?? ((file) => file), { pre: 0, post: 0 });
  // Through the DAW the dialog hears no end, so it shows the words playing for their length; the page's toast says when the DAW cannot.
  const [inDaw, setInDaw] = useState(false);
  const dawTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(dawTimer.current), []);
  const playing = player.isPlaying || inDaw;

  const character = choices.find((c) => c.id === characterId);
  const name = character?.name ?? 'this character';
  const count = counts[characterId] ?? 0;
  const full = count >= limit;
  // On by default for a character with no sample yet, as the PRD says; once the narrator touches it their choice stays.
  const makePrimary = primaryChoice ?? count === 0;
  const blocked = Boolean(refusal) || full;

  const play = (): void => {
    if (!audition) return;
    const through = audition.through;
    if (through) {
      window.clearTimeout(dawTimer.current);
      if (inDaw) {
        through.stop();
        return setInDaw(false);
      }
      stopSample();
      through.play();
      setInDaw(true);
      dawTimer.current = window.setTimeout(() => setInDaw(false), Math.max(0, audition.end - audition.start) * 1000);
      return;
    }
    if (player.isPlaying) return player.stop();
    // One sound at a time: a voice sample that is playing stops, as the range player stops when a sample starts.
    stopSample();
    player.play({ sourceFile: audition.sourceFile, rangeStart: audition.start, rangeEnd: audition.end });
  };

  const submit = async (): Promise<void> => {
    if (busy.current || blocked) return;
    busy.current = true;
    setSaving(true);
    setFailure('');
    player.stop();
    if (inDaw) {
      audition?.through?.stop();
      setInDaw(false);
    }
    try {
      const answer = await onSave({ characterId, label: label.trim(), note: note.trim(), makePrimary });
      if (!answer.ok) setFailure(answer.message);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    void submit();
  };
  // Enter saves from a field or the select; a button keeps its own Enter, and the note keeps it for a new line (Ctrl+Enter saves there).
  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>): void => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    const target = event.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.tagName === 'A') return;
    if (target.tagName === 'TEXTAREA' && !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    void submit();
  };

  const countText = full ? `${name} has ${limit} samples. Delete one first.` : `${count} of ${limit} samples`;
  return (
    <form className="flex flex-col gap-3" onSubmit={onSubmit} onKeyDown={onKeyDown} data-voice-sample-dialog>
      {refusal ? (
        <p className={alert} role="alert" data-voice-sample-refusal>
          {refusal}
        </p>
      ) : null}
      {refusal ? null : (
        <>
          {notice ? (
            <p className={alert} role="status" data-voice-sample-notice>
              {notice}
            </p>
          ) : null}
          <div className="flex flex-col gap-1">
            <label htmlFor="voice-sample-character" className={FIELD_LABEL_CLASSES}>
              Character
            </label>
            <Select
              id="voice-sample-character"
              fullWidth
              autoFocus
              value={characterId}
              onChange={(next) => {
                setCharacterId(next);
                setFailure('');
              }}
              options={choices.map((c) => ({ value: c.id, label: c.name, ...(c.group ? { group: c.group } : {}) }))}
            />
            <span className="text-sm text-[var(--text-muted)]" data-voice-sample-count>
              {countText}
            </span>
          </div>
        </>
      )}
      <div className="flex items-center gap-3 rounded-lg bg-[var(--info-soft)] px-3 py-2">
        <IconButton label={playing ? 'Stop' : 'Play range'} aria-pressed={playing} disabledReason={audition ? undefined : 'Nothing to play'} onClick={play}>
          <Icon name={playing ? 'stop' : 'play'} />
        </IconButton>
        <q className="min-w-0 flex-1 font-serif text-lg" dir="auto" data-voice-sample-words>
          {words}
        </q>
        <span className="font-mono text-sm text-[var(--text-muted)]">{seconds === undefined ? '—' : `${seconds.toFixed(1)} s`}</span>
      </div>
      {player.loadError ? (
        <p className={alert} role="status">
          {COULD_NOT_PLAY}
        </p>
      ) : null}
      {refusal ? null : (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor="voice-sample-label" className={FIELD_LABEL_CLASSES}>
              Label <span className="font-normal">(optional)</span>
            </label>
            <TextField
              id="voice-sample-label"
              dir="auto"
              maxLength={VOICE_SAMPLE_LABEL_MAX}
              value={label}
              onChange={setLabel}
              placeholder="Furious, to the court"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="voice-sample-note" className={FIELD_LABEL_CLASSES}>
              Note <span className="font-normal">(optional)</span>
            </label>
            {/* native-control-ok: Field's textarea has no length limit or text direction, and no primitive offers a bare textarea */}
            <textarea
              id="voice-sample-note"
              dir="auto"
              rows={3}
              maxLength={VOICE_SAMPLE_NOTE_MAX}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="How you did it: pitch up, clipped, no breaths"
              className="box-border min-h-20 w-full rounded-[var(--control-radius)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-[0.6rem] text-[0.88rem] leading-[1.35] text-[var(--text)]"
            />
          </div>
          <Checkbox checked={makePrimary} onChange={setPrimaryChoice} disabled={blocked}>
            Make primary for {name}
          </Checkbox>
          <p className="m-0 text-sm text-[var(--text-muted)]">
            Copies the raw recording, as it was before editing, into this project. Nothing leaves your computer.
          </p>
        </>
      )}
      {failure ? (
        <p className={alert} role="alert" data-voice-sample-failure>
          {failure}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" pending={saving} disabled={blocked}>
          Save sample
        </Button>
      </div>
    </form>
  );
}
