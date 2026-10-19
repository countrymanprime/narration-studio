import { Fragment, memo, type CSSProperties } from 'react';
import { kindMarkStyle } from '../../../kinds/markStyle';
import { narratorMarkStyle } from '../../../kinds/narratorMark';
import type { KindId } from '../../../kinds/kindMap';
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

/** Which registry kind each mark is (kinds/kindMap.ts): the same shape and colour as that kind on every other page. A cut word is not a kind: it is struck through. */
const KIND_OF: Record<Exclude<Mark, 'cut'>, KindId> = { extra: 'extra', miss: 'missing', mis: 'misread', low: 'low' };

const CUT_CLASS = 'line-through text-[var(--text-muted)] opacity-80';
const SEL_SHADOW = '0 2px 0 var(--info)';
const FX_SHADOW = 'inset 0 -3px 0 var(--accent-strong)';

// A script holds thousands of words, so a word is one span and its mark is a shared style object from the registry, never a `<mark>` per
// word. The style is cached per combination of what else is drawn on the word (a selection, an effect, a ring, the playing word).
const STYLES = new Map<string, CSSProperties | undefined>();
const DECO = new Map<string, CSSProperties>();

/** The Story Bible name and the narrator's mark a word carries, as one style: the name's entity mark, the narrator's mark over it. A flag's mark, drawn after, wins where they share a property. */
function decoStyle(tok: DocItem['tok']): { key: string; style: CSSProperties } | null {
  if (!tok?.entity && !tok?.mark) return null;
  const key = `${tok.entity?.colour.hue ?? ''}|${tok.mark ? `${tok.mark.colour}:${tok.mark.style}` : ''}`;
  let style = DECO.get(key);
  if (!style) {
    style = {
      ...(tok.entity ? kindMarkStyle('entity', tok.entity.colour) : undefined),
      ...(tok.mark ? narratorMarkStyle(tok.mark.colour, tok.mark.style) : undefined),
    };
    DECO.set(key, style);
  }
  return { key, style };
}

/**
 * The inline style of a word: its kind's mark (`kindMarkStyle`) with the layers that share its properties composed in. The selection and the
 * playing word paint their own fill and text colour, a cursor or open flag draws its ring as the outline, and the selection underline and the
 * effect underline join the mark's shadow, so the mark yields to each rather than hiding it.
 */
function wordStyle(mark: Mark | null, sel: boolean, fx: boolean, ringed: boolean, now: boolean, deco: ReturnType<typeof decoStyle>): CSSProperties | undefined {
  const key = `${mark ?? ''}|${sel}|${fx}|${ringed}|${now}|${deco?.key ?? ''}`;
  if (STYLES.has(key)) return STYLES.get(key);
  const base = mark && mark !== 'cut' ? kindMarkStyle(KIND_OF[mark]) : undefined;
  const style: CSSProperties = { ...deco?.style, ...base };
  if (sel || now) {
    delete style.background;
    delete style.color;
  }
  if (ringed) {
    delete style.outline;
    delete style.outlineOffset;
  }
  const shadows = [sel ? SEL_SHADOW : '', fx ? FX_SHADOW : '', base?.boxShadow ?? deco?.style.boxShadow ?? ''].filter(Boolean);
  if (shadows.length) style.boxShadow = shadows.join(', ');
  const out = Object.keys(style).length ? style : undefined;
  STYLES.set(key, out);
  return out;
}

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
  const note = mark ? describe(it, mark) : (it.tok?.mark?.title ?? it.tok?.entity?.title);
  const fx = it.fx.length > 0 && !it.cut;
  const cls = [
    'rounded-[0.12em] cursor-text',
    mark === 'cut' ? CUT_CLASS : '',
    sel ? 'bg-[var(--info-soft)] text-[var(--text)] rounded-none' : '',
    cur && !sel ? 'outline outline-2 outline-[var(--focus)]' : '',
    flag ? 'outline outline-2 outline-[var(--warn)]' : '',
    now ? 'bg-[var(--accent)] text-[var(--accent-contrast)]' : said ? 'text-[var(--text-muted)]' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const deco = decoStyle(it.tok);
  const style = wordStyle(mark, sel, fx, (cur && !sel) || flag, now, deco);
  const gap = it.kind === 'x' ? ' ' : it.gap;
  return (
    <Fragment>
      <span
        className={cls}
        style={style}
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
