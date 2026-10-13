import { Fragment, memo } from 'react';
import { clockText } from '../../booth/boothProgress';
import { isLow, type DocItem } from '../model';
import { FxMarker } from '../range/fx/FxButtons';
import { useFxMarker } from '../range/fx/fxMarkers';

/** What marks a word: each is drawn with a shape (underline, strike, dashed box) as well as a colour, and named in `aria-description`. */
type Mark = 'cut' | 'extra' | 'miss' | 'mis' | 'low';

function markOf(it: DocItem): Mark | null {
  if (it.cut) return 'cut';
  if (it.accepted) return null;
  if (it.st === 'extra') return 'extra';
  if (it.st === 'miss') return 'miss';
  if (it.st === 'mis') return 'mis';
  return it.kind === 'w' && isLow(it) ? 'low' : null;
}

const pct = (it: DocItem): string => `${Math.round(it.conf * 100)}%`;

/** The words that name a mark, for a screen reader and for the pointer's tooltip. */
function describe(it: DocItem, mark: Mark): string {
  switch (mark) {
    case 'cut':
      return 'Cut from the audio';
    case 'extra':
      return `Not in the script, ${clockText(it.t0 ?? 0)}, ${pct(it)}`;
    case 'miss':
      return 'In the script, not read';
    case 'mis':
      return `Heard “${(it.heard ?? '').replace(/[,.;”]+$/, '')}”, ${pct(it)}`;
    case 'low':
      return `Low confidence ${pct(it)}`;
  }
}

const MARK_CLASS: Record<Mark, string> = {
  cut: 'line-through text-[var(--text-muted)] opacity-80',
  extra: 'italic rounded-[0.12em] px-[0.12em] bg-[var(--danger-soft)] text-[var(--danger-text)] border-b-2 border-dotted border-[var(--danger)]',
  miss: 'px-[0.1em] border-[1.5px] border-dashed border-[var(--warn)] text-[var(--text-muted)]',
  mis: 'bg-[var(--warn-soft)] border-b-2 border-solid border-[var(--warn)]',
  low: 'underline decoration-wavy decoration-[var(--warn)] decoration-[1.5px] underline-offset-[0.2em]',
};

export interface WordProps {
  it: DocItem;
  sel: boolean;
  cur: boolean;
  now: boolean;
  said: boolean;
  flag: boolean;
  /** The gap after the word is inside the selection too, so the run reads as one. */
  join: boolean;
  /** The last word of an effect: its marker follows. */
  fxEnd: boolean;
}

/** One word of the script, or one that was said and is not in it. Read-only: never editable text. */
export const Word = memo(function Word({ it, sel, cur, now, said, flag, join, fxEnd }: WordProps) {
  const mark = markOf(it);
  const note = mark ? describe(it, mark) : undefined;
  const fx = it.fx.length > 0 && !it.cut;
  const cls = [
    'rounded-[0.12em] cursor-text',
    mark ? MARK_CLASS[mark] : '',
    sel ? 'bg-[var(--info-soft)] text-[var(--text)] rounded-none' : '',
    sel && fx
      ? 'shadow-[0_2px_0_var(--info),inset_0_-3px_0_var(--accent-strong)]'
      : sel
        ? 'shadow-[0_2px_0_var(--info)]'
        : fx
          ? 'shadow-[inset_0_-3px_0_var(--accent-strong)]'
          : '',
    cur && !sel ? 'outline outline-2 outline-[var(--focus)]' : '',
    flag ? 'outline outline-2 outline-[var(--warn)]' : '',
    now ? 'bg-[var(--accent)] text-[var(--accent-contrast)]' : said ? 'text-[var(--text-muted)]' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const gap = it.kind === 'x' ? ' ' : it.gap;
  return (
    <Fragment>
      <span
        className={cls}
        data-k={it.key}
        data-kind={it.kind}
        data-mark={mark ?? undefined}
        data-sel={sel ? '' : undefined}
        data-cursor={cur ? '' : undefined}
        data-now={now ? '' : undefined}
        id={`w-${it.key}`}
        title={note}
        aria-description={note}
        aria-current={cur ? 'true' : undefined}
      >
        {it.text}
      </span>
      {fxEnd ? <FxEnd id={it.fx[0]} /> : null}
      {join ? <span className="bg-[var(--info-soft)] shadow-[0_2px_0_var(--info)]">{gap}</span> : gap}
    </Fragment>
  );
});

/** The marker after an effect's last word: the mock's menu (select the words, remove the effect), or a plain mark for an effect not read yet. */
function FxEnd({ id }: { id: string | undefined }) {
  const marker = useFxMarker(id);
  if (marker) return <FxMarker fx={marker.fx} onSelect={marker.onSelect} onRemove={marker.onRemove} />;
  return (
    <span
      role="img"
      aria-label="Effect on the words before"
      data-fx-marker
      className="mx-[0.15em] rounded-full border border-[var(--accent-strong)] px-1.5 align-[0.2em] font-mono text-[11px] text-[var(--accent-strong)]"
    >
      fx
    </span>
  );
}
