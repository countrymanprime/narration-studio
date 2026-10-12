import { InsetCard } from '../../../primitives/InsetCard';
import { SectionLabel } from '../../../primitives/SectionLabel';
import type { DocItem } from '../../model';

/** Seconds of audio drawn either side of the range. */
const AROUND = 1.1;
const W = 400;
const H = 40;
/** A snapped end is within 2 ms of the word edge it was asked at; a later word that starts there still moves up. */
const SNAP_SLACK = 0.01;

/** The bars of a word, one every 3 units across its width: the same word always draws the same bars. Decoration: the facts beside the strips say what changes. */
function bars(key: string, x0: number, x1: number): Array<{ x: number; h: number }> {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const out: Array<{ x: number; h: number }> = [];
  for (let x = x0, i = 0; x < x1 - 1; x += 3, i++) out.push({ x, h: 6 + ((((h + i * 977) * 2654435761) >>> 0) % 26) });
  return out;
}

function Strip({ items, from, to, marked }: { items: DocItem[]; from: number; to: number; marked: readonly string[] }) {
  const x = (t: number): number => ((t - from) / (to - from)) * W;
  return (
    <svg className="block h-10 w-full text-[var(--text-muted)]" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="currentColor" strokeWidth={0.5} strokeDasharray="2 2" />
      {items
        .filter((i) => i.t0 != null && i.t1 != null && (i.t1 as number) > from && (i.t0 as number) < to)
        .flatMap((i) =>
          bars(i.key, x(i.t0 as number), x(i.t1 as number)).map((b) => (
            <rect key={`${i.key}:${b.x}`} x={b.x} y={(H - b.h) / 2} width={2} height={b.h} fill={marked.includes(i.key) ? 'var(--danger)' : 'currentColor'} />
          )),
        )}
    </svg>
  );
}

/** The audio around a range, before and after the change: the cut words are marked before and gone after, and the later audio moves up when the gap closes. */
export function Strips({ items, start, end, keys, closeGap }: { items: DocItem[]; start: number; end: number; keys: readonly string[]; closeGap: boolean }) {
  const len = end - start;
  const live = items.filter((i) => !i.cut && i.st !== 'miss');
  const after = live
    .filter((i) => !keys.includes(i.key))
    .map((i) => (closeGap && (i.t0 ?? 0) >= end - SNAP_SLACK ? { ...i, t0: (i.t0 as number) - len, t1: (i.t1 as number) - len } : i));
  return (
    <div className="grid grid-cols-2 gap-3" data-cut-strips>
      <div>
        <SectionLabel>Before</SectionLabel>
        <InsetCard fill className="mt-1">
          <Strip items={live} from={start - AROUND} to={end + AROUND} marked={keys} />
        </InsetCard>
      </div>
      <div>
        <SectionLabel>After</SectionLabel>
        <InsetCard fill className="mt-1">
          <Strip items={after} from={start - AROUND} to={(closeGap ? end - len : end) + AROUND} marked={[]} />
        </InsetCard>
      </div>
    </div>
  );
}
