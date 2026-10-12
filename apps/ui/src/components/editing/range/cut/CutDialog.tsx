import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../../primitives/Button';
import { Checkbox } from '../../../primitives/Checkbox';
import { RadioGroup } from '../../../primitives/RadioGroup';
import { SectionLabel } from '../../../primitives/SectionLabel';
import { Select } from '../../../primitives/Select';
import { clock } from '../../bar/clock';
import { isLow, laterAudio, summarize, type ChapterDoc, type CutSpan, type SelSummary } from '../../model';
import type { RangeLocator, SnappedEnd } from '../common/locate';
import { snapText } from '../common/locate';
import { cutPlanText, type RangePlan } from '../common/rangePlan';
import { Strips } from '../common/Strips';
import { DEFAULT_CUT, FADE_CHOICES, PAD_CHOICES, type CutOptions } from './cutCommand';

type Acting = Exclude<RangePlan, { kind: 'refused' }>;

/** The DAW is sent the words, not times, so it cuts at their edges: the pad cannot reach it in this version and stays at None. */
export const PAD_NOT_SENT = 'The DAW cuts at the edges of the words in this version.';

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const sec = (n: number): string => `${n.toFixed(1)} s`;

/** The dialog's title: what will happen to how many words. */
export const cutTitle = (n: number, mute: boolean): string =>
  mute ? `Mute ${plural(n, 'word', 'words')} and keep their audio?` : `Delete ${plural(n, 'word', 'words')} and their audio?`;

/** Where the later audio goes, in the dialog's words. */
function laterText(mode: CutOptions['mode'], len: number, later: { before: number; after: number } | null): string {
  if (mode === 'gap') return `does not move; room tone fills ${sec(len)}`;
  return later
    ? `moves ${sec(len)} earlier in this chapter (${clock(later.before)} becomes ${clock(later.after)})`
    : `moves ${sec(len)} earlier in this chapter`;
}

const KEEP: Record<Acting['kind'], string> = {
  daw: 'Keep the cut audio on a muted track (Cuts)',
  recorder: 'Keep the cut in the edit list so it can be undone later',
  'backup-then-daw': 'Back up the track around the cut (required)',
};

export interface CutDialogProps {
  doc: ChapterDoc;
  keys: readonly string[];
  cuts: readonly CutSpan[];
  mute: boolean;
  plan: Acting;
  chapterName: string;
  locator: RangeLocator;
  /** Moves one end (seconds now) to a zero crossing through the alignment port. */
  snap: (at: number) => Promise<SnappedEnd>;
  onCancel: () => void;
  onConfirm: (summary: SelSummary, options: CutOptions) => void;
}

/**
 * The question asked before words are cut or muted (the mock's `CutDialog`). Nothing changes until the narrator says yes: it shows the words,
 * the audio before and after, the time range with its snapped ends, where the words sit, where the later audio goes, the choices and what the
 * DAW does and how it is undone. Cancel has the focus.
 */
export function CutDialog({ doc, keys, cuts, mute, plan, chapterName, locator, snap, onCancel, onConfirm }: CutDialogProps) {
  const [mode, setMode] = useState<CutOptions['mode']>(mute ? 'gap' : DEFAULT_CUT.mode);
  const [fade, setFade] = useState<number>(DEFAULT_CUT.fadeMs);
  const [snapped, setSnapped] = useState<Map<number, SnappedEnd> | null>(null);
  const asked = useMemo(() => summarize(doc, [...keys], cuts, (t) => t), [doc, keys, cuts]);
  useEffect(() => {
    let live = true;
    const ends = [...new Set(asked.ranges.flatMap((r) => [r.start, r.end]))];
    void Promise.all(ends.map(async (t) => [t, await snap(t)] as const)).then((pairs) => live && setSnapped(new Map(pairs)));
    return () => {
      live = false;
    };
  }, [asked, snap]);
  const sum = useMemo(() => (snapped ? summarize(doc, [...keys], cuts, (t) => snapped.get(t)?.time ?? t) : asked), [doc, keys, cuts, snapped, asked]);
  const r = sum.ranges[0];
  const first = asked.ranges[0];
  const ends = snapped && first ? snapText(snapped.get(first.start) ?? { time: 0, moved: 0 }, snapped.get(first.end) ?? { time: 0, moved: 0 }) : '';
  const n = sum.audible.length;
  const later = r && mode === 'close' ? laterAudio(doc, sum.ranges[sum.ranges.length - 1]) : null;
  const lowN = sum.audible.filter(isLow).length;
  const lowWords = sum.audible.filter(isLow).map((i) => `“${i.text}”`);
  const facts = 'm-0 grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-1.5';
  const option = (ms: number) => ({ value: String(ms), label: ms ? `${ms} ms` : 'None' });
  return (
    <div className="flex flex-col gap-3" data-cut-dialog>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <SectionLabel>{sum.allExtra ? 'Words not in the script' : 'Words'}</SectionLabel>
        <div className="inline-block max-w-full rounded bg-[var(--info-soft)] px-2 py-0.5 font-serif text-lg" data-cut-words>
          {sum.words}
        </div>
      </div>
      {r ? <Strips items={doc.items.filter((i) => i.pid === r.pid)} start={r.start} end={r.end} keys={r.keys} closeGap={mode === 'close'} /> : null}
      <dl className={facts}>
        <dt className="pt-0.5">
          <SectionLabel>Cut range</SectionLabel>
        </dt>
        <dd className="m-0 font-mono" data-cut-range>
          {r ? `${clock(sum.start)} to ${clock(sum.end)} · ${sec(sum.len)}` : '—'}
        </dd>
        {ends ? (
          <>
            <dt className="pt-0.5">
              <SectionLabel>Ends</SectionLabel>
            </dt>
            <dd className="m-0" data-cut-snap>
              {ends}
            </dd>
          </>
        ) : null}
        <dt className="pt-0.5">
          <SectionLabel>In</SectionLabel>
        </dt>
        <dd className="m-0" data-cut-in>
          {chapterName}
          {r ? ` · ${r.takeId ? `take ${r.takeId} · ` : ''}${locator.place(r)}` : ''}
          {sum.ranges.length > 1 ? ` · spans ${sum.ranges.length} items` : ''}
        </dd>
        <dt className="pt-0.5">
          <SectionLabel>Later audio</SectionLabel>
        </dt>
        <dd className="m-0" data-cut-later>
          {laterText(mode, sum.len, later)}
        </dd>
      </dl>
      {lowN ? (
        <p className="m-0 rounded-lg bg-[var(--warn-soft)] px-3 py-2.5 text-sm" data-cut-low>
          Includes {plural(lowN, 'low-confidence word', 'low-confidence words')}: {lowWords.join(', ')}.
        </p>
      ) : null}
      <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-3">
        {mute ? null : (
          <RadioGroup
            label="What happens to the gap"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'close', label: 'Close the gap (later audio on this track moves up)' },
              { value: 'gap', label: `Leave ${sec(sum.len)} of room tone (timing does not move)` },
            ]}
          />
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <SectionLabel>Crossfade</SectionLabel>
          <Select label="Crossfade at the join" value={String(fade)} onChange={(v) => setFade(Number(v))} options={FADE_CHOICES.map(option)} />
          <SectionLabel>Keep audio at each edge</SectionLabel>
          <Select
            label="Keep audio at each edge of the cut"
            value="0"
            onChange={() => {}}
            options={PAD_CHOICES.map(option)}
            disabled
            aria-description={PAD_NOT_SENT}
          />
        </div>
        <Checkbox checked disabled onChange={() => {}}>
          {KEEP[plan.kind]}
        </Checkbox>
      </div>
      <p className="m-0 rounded-lg bg-[var(--info-soft)] px-3 py-2.5 text-sm" data-cut-plan>
        {cutPlanText(plan, mute)}
      </p>
      {/* The footer stays in view, so Cancel taking the focus never scrolls the question away. */}
      <div className="sticky bottom-[-1.1rem] mx-[-1.1rem] mb-[-1.1rem] flex justify-end gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-[1.1rem] py-3">
        <Button type="button" variant="secondary" autoFocus onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" variant="primary" disabled={!snapped || !r} onClick={() => onConfirm(sum, { mode: mute ? 'gap' : mode, fadeMs: fade })}>
          {mute ? `Mute ${plural(n, 'word', 'words')}` : `Delete ${plural(n, 'word', 'words')} and audio`}
        </Button>
      </div>
    </div>
  );
}
