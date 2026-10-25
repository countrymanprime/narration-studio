import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { Narrator, ReplaceAudioApi, ReplaceFilePeaks, ReplacePlan } from '../../../../api/contracts/replace';
import { REPLACE_MAX_GAIN_DB, REPLACE_MAX_SECONDS, REPLACE_MIN_SECONDS } from '../../../../api/contracts/replace';
import { Button } from '../../../primitives/Button';
import { Field, FIELD_LABEL_CLASSES } from '../../../primitives/Field';
import { NumberInput } from '../../../primitives/NumberInput';
import { SectionLabel } from '../../../primitives/SectionLabel';
import { Select } from '../../../primitives/Select';
import { clock } from '../../bar/clock';
import type { ReplaceAsk } from './replaceCommand';

/** The fades at each seam the dialog offers, in milliseconds (the host takes 0 to 500); 10 ms is the cut's default seam. */
const REPLACE_FADES = [0, 5, 10, 25, 50] as const;
const DEFAULT_FADE = 10;

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const sec = (n: number): string => `${n.toFixed(2)} s`;
const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const round = (n: number): number => Math.round(n * 100) / 100;

/** A control with its caption shown above it; the control carries the same words as its accessible name, so the caption is hidden from a screen reader. */
function Captioned({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="flex max-w-full min-w-0 flex-col gap-1.5">
      <span className={FIELD_LABEL_CLASSES} aria-hidden="true">
        {caption}
      </span>
      {children}
    </div>
  );
}

/** The dialog's title: how many words are replaced. */
export const replaceTitle = (n: number): string => `Replace ${plural(n, 'word', 'words')} with another narrator's audio`;

export interface ReplaceDialogProps {
  api: Pick<ReplaceAudioApi, 'replaceNarrators' | 'replaceNarratorAdd' | 'replaceAddFile' | 'replaceFilePeaks' | 'replacePlan'>;
  chapterId: string;
  firstToken: number;
  lastToken: number;
  /** The words as the script shows them, and how many. */
  text: string;
  words: number;
  /** The words' time in the chapter, for the summary. */
  start: number;
  end: number;
  dawName: string;
  onCancel: () => void;
  onConfirm: (ask: ReplaceAsk) => void;
}

/**
 * The question asked before words are replaced with another narrator's audio (#2251; the draft mock in docs/research/mockups/replace-audio, first
 * version: REAPER, both ranges by hand). It names the other narrator, once for the project; picks a file of theirs, which goes into the DAW on a
 * muted track of its own the first time; sets the stretch of it by hand on its waveform; and shows the host's plan: the loudness measured against
 * the project's target with the level change it proposes (which the narrator can change), and how far the later audio moves. Nothing changes in
 * the DAW until Replace; Cancel has the focus.
 */
export function ReplaceDialog({ api, chapterId, firstToken, lastToken, text, words, start, end, dawName, onCancel, onConfirm }: ReplaceDialogProps) {
  const [narrators, setNarrators] = useState<Narrator[] | null>(null);
  const [narratorId, setNarratorId] = useState('');
  const [fileId, setFileId] = useState('');
  const [newName, setNewName] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [peaks, setPeaks] = useState<ReplaceFilePeaks | null>(null);
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(0);
  const [plan, setPlan] = useState<ReplacePlan | null>(null);
  const [planError, setPlanError] = useState('');
  const [gain, setGain] = useState(0);
  const [gainTouched, setGainTouched] = useState(false);
  const [fade, setFade] = useState<number>(DEFAULT_FADE);
  const mine = end - start;

  const take = useCallback((list: Narrator[], pick?: { narrator?: string; file?: string }) => {
    setNarrators(list);
    const narrator = list.find((n) => n.id === pick?.narrator) ?? list.find((n) => n.files.length > 0) ?? list[0];
    setNarratorId(narrator?.id ?? '');
    const file = narrator?.files.find((f) => f.id === pick?.file) ?? narrator?.files[0];
    setFileId(file?.id ?? '');
  }, []);
  useEffect(() => {
    let live = true;
    api.replaceNarrators().then(
      (list) => live && take(list.narrators),
      (e: unknown) => live && setNote(why(e)),
    );
    return () => {
      live = false;
    };
  }, [api, take]);

  const narrator = narrators?.find((n) => n.id === narratorId);
  const file = narrator?.files.find((f) => f.id === fileId);
  // A new file starts with a stretch as long as the words, from its start, for the narrator to move.
  useEffect(() => {
    setPeaks(null);
    setPlan(null);
    if (!file) return;
    setFrom(0);
    setTo(round(Math.min(file.length, Math.max(mine, REPLACE_MIN_SECONDS))));
    let live = true;
    api.replaceFilePeaks(file.id).then(
      (p) => live && setPeaks(p),
      () => live && setPeaks({ fileId: file.id, length: file.length, reason: 'no waveform' }),
    );
    return () => {
      live = false;
    };
  }, [api, file?.id, file?.length, mine]); // eslint-disable-line react-hooks/exhaustive-deps -- a file is chosen by its id; its record object changes on every list

  // The host's plan for the stretch as it stands, asked again a moment after it last moved.
  useEffect(() => {
    if (!file || !(to > from)) return;
    let live = true;
    const timer = setTimeout(() => {
      api.replacePlan(chapterId, firstToken, lastToken, file.id, from, to).then(
        (p) => {
          if (!live) return;
          setPlan(p);
          setPlanError('');
          if (!gainTouched) setGain(p.gainDb);
        },
        (e: unknown) => live && setPlanError(why(e)),
      );
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [api, chapterId, firstToken, lastToken, file, from, to, gainTouched]);

  const addNarrator = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const change = await api.replaceNarratorAdd(name);
      const added = change.narrators.find((n) => n.name.toLowerCase() === name.toLowerCase());
      take(change.narrators, { narrator: added?.id });
      setNewName('');
      setNote('');
    } catch (e) {
      setNote(why(e));
    } finally {
      setBusy(false);
    }
  };
  const addFile = async () => {
    if (!narrator) return;
    setBusy(true);
    try {
      const answer = await api.replaceAddFile(narrator.id);
      if (answer.fileId) take(answer.narrators.narrators, { narrator: narrator.id, file: answer.fileId });
      setNote(answer.result.ok ? answer.result.message : (answer.result.refused ?? answer.result.message));
    } catch (e) {
      setNote(why(e));
    } finally {
      setBusy(false);
    }
  };

  const ready = !!plan?.result.ok && !!file && file.state === 'ok';
  const refusedPlan = plan && !plan.result.ok ? (plan.result.refused ?? plan.result.message) : '';
  const shift = plan?.result.ok ? plan.shift : to - from - mine;
  const facts = 'm-0 grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-1.5';
  return (
    <div className="flex flex-col gap-4" data-replace-dialog>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <SectionLabel>Your words</SectionLabel>
        <div className="inline-block max-w-full rounded bg-[var(--info-soft)] px-2 py-0.5 font-serif text-lg" data-replace-words>
          {text}
        </div>
        <span className="font-mono text-sm text-[var(--text-muted)]">
          {clock(start)} to {clock(end)} · {sec(mine)}
        </span>
      </div>

      <section className="flex flex-col gap-2" aria-label="Whose audio">
        <SectionLabel>Whose audio</SectionLabel>
        {narrators === null ? (
          <p className="m-0 text-sm text-[var(--text-muted)]">Reading the project's other narrators…</p>
        ) : narrators.length === 0 ? (
          <p className="m-0 text-sm" data-replace-first>
            Name the other narrator once for this project (a duet partner, a stand-in, or one of a cast). Their name is shown on the words their audio replaces.
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <Captioned caption="Other narrator">
              <Select
                label="Other narrator"
                value={narratorId}
                onChange={(id) => take(narrators, { narrator: id })}
                options={narrators.map((n) => ({ value: n.id, label: n.name }))}
              />
            </Captioned>
            <Captioned caption="Their file">
              <Select
                label="Their file"
                className="max-w-full"
                value={fileId}
                placeholder="No file of theirs yet"
                onChange={setFileId}
                options={(narrator?.files ?? []).map((f) => ({
                  value: f.id,
                  label: `${f.name} · ${clock(f.length)}${f.state === 'ok' ? '' : f.state === 'missing' ? ' · not found' : ' · changed'}`,
                }))}
              />
            </Captioned>
            <Button type="button" variant="secondary" disabled={busy || !narrator} onClick={() => void addFile()}>
              Add a file of theirs…
            </Button>
          </div>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] flex-1">
            <Field label="Name another narrator" value={newName} onChange={setNewName} placeholder="Their name as the credits give it" />
          </div>
          <Button type="button" variant="secondary" disabled={busy || !newName.trim()} onClick={() => void addNarrator()}>
            Add
          </Button>
        </div>
        {file && file.state !== 'ok' ? (
          <p className="m-0 rounded-lg bg-[var(--warn-soft)] px-3 py-2.5 text-sm" data-replace-file-state>
            {file.state === 'missing'
              ? `${file.name} is no longer where it was added. ${dawName} plays it from there: put it back, or add it again from where it is now.`
              : `${file.name} changed since it was added. Add it again so the app measures what ${dawName} plays.`}
          </p>
        ) : null}
        {note ? (
          <p className="m-0 text-sm" role="status" data-replace-note>
            {note}
          </p>
        ) : null}
      </section>

      {file ? (
        <section className="flex flex-col gap-2" aria-label="Their stretch">
          <SectionLabel>Their stretch</SectionLabel>
          <StretchWave
            peaks={peaks}
            length={file.length}
            from={from}
            to={to}
            onChange={(a, b) => {
              setFrom(round(a));
              setTo(round(b));
            }}
          />
          <div className="flex flex-wrap items-end gap-3">
            <Captioned caption="From (seconds)">
              <NumberInput label="From (seconds)" value={from} min={0} max={file.length} step={0.01} onValueChange={(v) => setFrom(round(v))} />
            </Captioned>
            <Captioned caption="To (seconds)">
              <NumberInput label="To (seconds)" value={to} min={0} max={file.length} step={0.01} onValueChange={(v) => setTo(round(v))} />
            </Captioned>
            <span className="pb-2 font-mono text-sm" data-replace-stretch>
              {clock(from)} to {clock(to)} · {sec(Math.max(0, to - from))}
            </span>
          </div>
          <p className="m-0 text-sm text-[var(--text-muted)]">
            Drag across their waveform, or type the times. {REPLACE_MIN_SECONDS * 1000} ms to {REPLACE_MAX_SECONDS / 60} minutes.
          </p>
        </section>
      ) : null}

      {file && to > from ? (
        <section className="flex flex-col gap-2" aria-label="Level and length">
          <SectionLabel>Level and length</SectionLabel>
          {refusedPlan || planError ? (
            <p className="m-0 rounded-lg bg-[var(--danger-soft)] px-3 py-2.5 text-sm" role="alert" data-replace-refused>
              {refusedPlan || planError}
            </p>
          ) : null}
          <dl className={facts}>
            <dt className="pt-0.5">
              <SectionLabel>Loudness</SectionLabel>
            </dt>
            <dd className="m-0" data-replace-loudness>
              {plan?.result.ok
                ? plan.measuredLufs !== null
                  ? `Theirs ${plan.measuredLufs.toFixed(1)} LUFS · target ${plan.targetLufs.toFixed(0)} LUFS (Settings > Editing)`
                  : plan.loudnessNote
                : 'Measuring their stretch…'}
            </dd>
            <dt className="pt-0.5">
              <SectionLabel>Length</SectionLabel>
            </dt>
            <dd className="m-0" data-replace-length>
              Yours {sec(mine)} · theirs {sec(Math.max(0, to - from))}.{' '}
              {Math.abs(shift) < 0.005
                ? 'The later audio stays where it is.'
                : `The later audio on this track moves ${sec(Math.abs(shift))} ${shift < 0 ? 'earlier' : 'later'}.`}
            </dd>
          </dl>
          <div className="flex flex-wrap items-end gap-3">
            <Captioned caption="Level change (dB)">
              <NumberInput
                label="Level change (dB)"
                value={gain}
                min={-REPLACE_MAX_GAIN_DB}
                max={REPLACE_MAX_GAIN_DB}
                step={0.1}
                onValueChange={(v) => {
                  setGain(Math.round(v * 10) / 10);
                  setGainTouched(true);
                }}
              />
            </Captioned>
            <Captioned caption="Fade at each seam">
              <Select
                label="Fade at each seam"
                value={String(fade)}
                onChange={(v) => setFade(Number(v))}
                options={REPLACE_FADES.map((ms) => ({ value: String(ms), label: ms ? `${ms} ms` : 'None' }))}
              />
            </Captioned>
          </div>
          {plan?.clamped ? <p className="m-0 text-sm text-[var(--text-muted)]">The level change is held to {REPLACE_MAX_GAIN_DB} dB.</p> : null}
        </section>
      ) : null}

      <p className="m-0 rounded-lg bg-[var(--info-soft)] px-3 py-2.5 text-sm" data-replace-plan>
        {dawName} moves your audio for these words to the muted Cuts track and plays theirs in its place, in one undo step. Your recording and their file are
        not changed. Undo takes it back while it is {dawName}'s last action; <strong>Put my audio back</strong> works later too.
      </p>
      <div className="sticky bottom-[-1.1rem] mx-[-1.1rem] mb-[-1.1rem] flex justify-end gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-[1.1rem] py-3">
        <Button type="button" variant="secondary" autoFocus onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={!ready || busy}
          onClick={() =>
            file &&
            narrator &&
            onConfirm({
              chapterId,
              firstToken,
              lastToken,
              words,
              start,
              narrator: narrator.name,
              fileId: file.id,
              sourceStart: from,
              sourceEnd: to,
              fadeMs: fade,
              gainDb: gain,
            })
          }
        >
          {`Replace ${plural(words, 'word', 'words')}`}
        </Button>
      </div>
    </div>
  );
}

/** Their file's waveform with the stretch drawn on it; a drag across it sets the stretch. With no waveform (a file that is not a WAV), a ruler. */
function StretchWave({
  peaks,
  length,
  from,
  to,
  onChange,
}: {
  peaks: ReplaceFilePeaks | null;
  length: number;
  from: number;
  to: number;
  onChange: (from: number, to: number) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const anchor = useRef<number | null>(null);
  const bars = useMemo(() => barsOf(peaks, 240), [peaks]);
  const at = (event: ReactPointerEvent<SVGSVGElement>): number => {
    const box = ref.current?.getBoundingClientRect();
    if (!box || box.width === 0) return 0;
    return Math.min(length, Math.max(0, ((event.clientX - box.left) / box.width) * length));
  };
  const x = (t: number) => (length > 0 ? (t / length) * 1000 : 0);
  return (
    <svg
      ref={ref}
      role="img"
      aria-label={`Their file, ${clock(length)} long, with ${clock(from)} to ${clock(to)} chosen`}
      viewBox="0 0 1000 60"
      preserveAspectRatio="none"
      className="h-16 w-full cursor-crosshair touch-none rounded-[var(--control-radius)] border border-[var(--border)] bg-[var(--surface-2)]"
      data-replace-wave
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        anchor.current = at(event);
      }}
      onPointerMove={(event) => {
        if (anchor.current === null) return;
        const here = at(event);
        onChange(Math.min(anchor.current, here), Math.max(anchor.current, here));
      }}
      onPointerUp={() => {
        anchor.current = null;
      }}
    >
      <rect x={x(from)} y={0} width={Math.max(1, x(to) - x(from))} height={60} fill="var(--info-soft)" />
      {bars.length
        ? bars.map((h, i) => (
            <rect
              key={i}
              x={(i / bars.length) * 1000}
              y={30 - h * 28}
              width={Math.max(1, 1000 / bars.length - 1)}
              height={Math.max(1, h * 56)}
              fill="var(--text-muted)"
            />
          ))
        : null}
      <line x1={x(from)} x2={x(from)} y1={0} y2={60} stroke="var(--accent-strong)" strokeWidth={2} />
      <line x1={x(to)} x2={x(to)} y1={0} y2={60} stroke="var(--accent-strong)" strokeWidth={2} />
    </svg>
  );
}

/** The waveform as `count` heights from 0 to 1, from the host's min/max bytes (base64, two signed bytes a bucket); none without peaks. */
function barsOf(peaks: ReplaceFilePeaks | null, count: number): number[] {
  if (!peaks?.peaks || peaks.peaks.buckets === 0) return [];
  let raw: string;
  try {
    raw = atob(peaks.peaks.minMax);
  } catch {
    return [];
  }
  const buckets = Math.floor(raw.length / 2);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const a = Math.floor((i * buckets) / count);
    const b = Math.max(a + 1, Math.floor(((i + 1) * buckets) / count));
    let top = 0;
    for (let j = a; j < b && j < buckets; j++) {
      const lo = (raw.charCodeAt(j * 2) << 24) >> 24;
      const hi = (raw.charCodeAt(j * 2 + 1) << 24) >> 24;
      top = Math.max(top, Math.abs(lo), Math.abs(hi));
    }
    out.push(top / 127);
  }
  return out;
}
