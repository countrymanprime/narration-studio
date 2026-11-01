import { Fragment, memo, useContext, useEffect } from 'react';
import { clockText } from '../../booth/boothProgress';
import { useSampleMarksValue } from '../voicesample/sampleMarksContext';
import { ReplacementMarksContext } from '../range/replace/replacementMarks';
import type { DocPara } from './types';
import { useParagraphNotes } from './paragraphNotes';
import { SpeakerChip } from './SpeakerChip';
import { Word } from './Word';

export interface ParagraphProps {
  dp: DocPara;
  /** The selected keys, only for a paragraph the selection touches: the others get null so they do not render again. */
  sel: ReadonlySet<string> | null;
  /** The cursor's key, only for the paragraph it is in. */
  cursor: string | null;
  /** The playing word's key, only for its paragraph. */
  nowKey: string | null;
  /** The key with its card open, only for its paragraph. */
  flag: string | null;
  active: boolean;
  /** The line is on screen in the bottom waveform while it is scrolled by hand. */
  inView?: boolean;
  /** The time gutter: off when nothing was heard (no times, no takes), so the text starts at the column's edge (R3ED-15). */
  gutter?: boolean;
  onRender?: (pid: string) => void;
}

/** One row of the script: the time the line begins and its words. Memoised, so a cursor move draws the paragraph it left and the one it entered. */
export const Paragraph = memo(function Paragraph({ dp, sel, cursor, nowKey, flag, active, inView = false, gutter = true, onRender }: ParagraphProps) {
  useEffect(() => {
    onRender?.(dp.p.id);
  });
  const notes = useParagraphNotes(dp.p.id, dp.p.text);
  const sampleMarks = useSampleMarksValue()?.marks.at;
  const replaced = useContext(ReplacementMarksContext)?.at;
  const nowIdx = nowKey ? dp.items.findIndex((i) => i.key === nowKey) : -1;
  const index = new Map(dp.items.map((i, k) => [i.key, k]));
  return (
    <div
      data-pid={dp.p.id}
      data-active={active ? '' : undefined}
      data-in-view={inView ? '' : undefined}
      data-unrecorded={dp.recorded ? undefined : ''}
      className={`mb-2 grid gap-x-1.5 border-l-[3px] py-1 ${gutter ? 'grid-cols-[76px_minmax(0,1fr)] @max-[30rem]/script:grid-cols-[2.75rem_minmax(0,1fr)]' : 'grid-cols-[0px_minmax(0,1fr)]'} ${active ? 'border-[var(--accent-strong)] bg-[var(--accent-soft)]/40' : inView ? 'border-[var(--info)] bg-[var(--info-soft)]/50' : 'border-transparent'}`}
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 4.5rem' }}
    >
      {/* One line of the text tall (`1lh` is the inherited line height), so the time is centred on the paragraph's first line at any size. */}
      <div data-gutter className={`flex h-[1lh] items-center justify-end pr-2 ${gutter ? '' : 'invisible overflow-hidden'}`}>
        <span className="font-mono text-xs text-[var(--text-muted)]">{dp.start != null ? clockText(dp.start) : ''}</span>
      </div>
      <p className={`m-0 min-w-0 ${dp.recorded ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>
        {dp.units.map((us) => (
          <Fragment key={us.u.key}>
            {us.u.cue && notes.phrase(us.u.cue) ? <SpeakerChip phrase={notes.phrase(us.u.cue)!} /> : null}
            {us.lead}
            {us.items.map((it) => {
              const at = index.get(it.key) ?? 0;
              const next = dp.items[at + 1];
              const selected = !!sel && sel.has(it.key);
              return (
                <Word
                  key={it.key}
                  it={it}
                  sel={selected}
                  cur={cursor === it.key}
                  now={nowKey === it.key}
                  said={nowIdx >= 0 && at < nowIdx}
                  flag={flag === it.key}
                  join={selected && !!next && sel.has(next.key) && (it.kind === 'x' || !!it.gap)}
                  note={it.tok ? notes.at(it.tok.s, it.tok.s + it.tok.text.length) : undefined}
                  fxEnd={it.fx.length > 0 && !it.cut && !(next && !next.cut && next.fx.includes(it.fx[0]))}
                  samples={sampleMarks?.get(it.key)}
                  replacedEnd={replaced?.has(it.key)}
                />
              );
            })}
          </Fragment>
        ))}
      </p>
      {notes.notes.map((n) => (
        <p key={n.id} data-note={n.id} className="col-start-2 m-0 mt-1 text-[length:var(--font-size-sm)] leading-[1.4] text-[var(--text-muted)]">
          <b className="font-semibold text-[var(--text)]">{n.name}:</b> {n.text}
        </p>
      ))}
    </div>
  );
});
