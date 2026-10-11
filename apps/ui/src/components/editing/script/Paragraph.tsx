import { Fragment, memo, useEffect } from 'react';
import { clockText } from '../../booth/boothProgress';
import type { DocPara } from './types';
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
  onRender?: (pid: string) => void;
}

/** One row of the script: the time the line begins and its words. Memoised, so a cursor move draws the paragraph it left and the one it entered. */
export const Paragraph = memo(function Paragraph({ dp, sel, cursor, nowKey, flag, active, onRender }: ParagraphProps) {
  useEffect(() => {
    onRender?.(dp.p.id);
  });
  const nowIdx = nowKey ? dp.items.findIndex((i) => i.key === nowKey) : -1;
  const index = new Map(dp.items.map((i, k) => [i.key, k]));
  return (
    <div
      data-pid={dp.p.id}
      data-active={active ? '' : undefined}
      data-unrecorded={dp.recorded ? undefined : ''}
      className={`mb-2 grid max-w-[1000px] grid-cols-[76px_minmax(0,1fr)] gap-x-1.5 border-l-[3px] py-1 ${active ? 'border-[var(--accent-strong)] bg-[var(--accent-soft)]/40' : 'border-transparent'}`}
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 4.5rem' }}
    >
      <span className="pt-[0.7em] pr-2 text-right font-mono text-xs text-[var(--text-muted)]">{dp.start != null ? clockText(dp.start) : ''}</span>
      <p className={`m-0 min-w-0 ${dp.recorded ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>
        {dp.units.map((us) => (
          <Fragment key={us.u.key}>
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
                  fxEnd={it.fx.length > 0 && !it.cut && !(next && !next.cut && next.fx.includes(it.fx[0]))}
                />
              );
            })}
          </Fragment>
        ))}
      </p>
    </div>
  );
});
