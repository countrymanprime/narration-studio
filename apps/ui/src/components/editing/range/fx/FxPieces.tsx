import { InsetCard } from '../../../primitives/InsetCard';
import type { DocItem } from '../../model';

const W = 400;
const H = 54;

/** The bars of a word, one every 3 units across its width: the same word always draws the same bars. Decoration: the facts beside the strip say what changes. */
function bars(key: string, x0: number, x1: number): Array<{ x: number; h: number }> {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const out: Array<{ x: number; h: number }> = [];
  for (let x = x0, i = 0; x < x1 - 1; x += 3, i++) out.push({ x, h: 8 + ((((h + i * 977) * 2654435761) >>> 0) % 36) });
  return out;
}

export interface FxPiecesProps {
  /** The paragraph's items, which the item is drawn from. */
  items: DocItem[];
  /** The words that take the effect. */
  keys: readonly string[];
  /** Where the item is split (seconds now): the snapped ends. */
  start: number;
  end: number;
  /** The chain on the middle piece. */
  chain: string;
}

/** Seconds of audio drawn either side of the words. */
const AROUND = 2.2;

/**
 * The item as it will be split: the audio with the effect's words marked, and the three pieces under it, the middle one carrying the chain
 * (the mock's `.sx-pieces`). The pieces are wide enough to read at the narrowest dialog.
 */
export function FxPieces({ items, keys, start, end, chain }: FxPiecesProps) {
  const from = start - AROUND;
  const to = end + AROUND;
  const x = (t: number): number => ((t - from) / (to - from)) * W;
  const pct = (t: number): number => Math.min(100, Math.max(0, ((t - from) / (to - from)) * 100));
  const a = pct(start);
  const b = pct(end);
  return (
    <div className="flex flex-col gap-1" role="group" aria-label="The item as it will be split" data-fx-pieces>
      <InsetCard fill>
        <svg className="block h-[54px] w-full text-[var(--text-muted)]" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="currentColor" strokeWidth={0.5} strokeDasharray="2 2" />
          {items
            .filter((i) => i.t0 != null && i.t1 != null && (i.t1 as number) > from && (i.t0 as number) < to && !i.cut && i.st !== 'miss')
            .flatMap((i) =>
              bars(i.key, x(i.t0 as number), x(i.t1 as number)).map((r) => (
                <rect
                  key={`${i.key}:${r.x}`}
                  x={r.x}
                  y={(H - r.h) / 2}
                  width={2}
                  height={r.h}
                  fill={keys.includes(i.key) ? 'var(--accent-strong)' : 'currentColor'}
                />
              )),
            )}
          <line x1={x(start)} x2={x(start)} y1={0} y2={H} stroke="var(--info)" strokeWidth={1} />
          <line x1={x(end)} x2={x(end)} y1={0} y2={H} stroke="var(--info)" strokeWidth={1} />
        </svg>
      </InsetCard>
      <div className="flex h-5 w-full overflow-hidden rounded border border-[var(--border)]" aria-hidden="true">
        <span className="bg-[var(--surface-2)]" style={{ width: `${a}%` }} />
        <span className="bg-[var(--accent-soft)]" style={{ width: `${b - a}%` }} />
        <span className="bg-[var(--surface-2)]" style={{ width: `${100 - b}%` }} />
      </div>
      <p className="m-0 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-[var(--text-muted)]" data-fx-split>
        <span>Piece 1 · unchanged</span>
        <span className="font-semibold text-[var(--text)]">Piece 2 · {chain}</span>
        <span>Piece 3 · unchanged</span>
      </p>
    </div>
  );
}
