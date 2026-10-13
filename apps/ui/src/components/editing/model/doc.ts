/**
 * The chapter as an editable script: its own text set against what was heard, word by word. A pure function of the chapter's paragraphs,
 * the alignment answer, the cut list and the applied effects, all passed in. The text is never edited; cuts hide words (they stay, struck
 * through) and the cut list stays in the original recording's time.
 */
import { alignToScript, normKey, type Heard } from './align';
import { curTime, origTime, takeLength, takeShift, type DocCut } from './cuts';

type ItemState = 'ok' | 'mis' | 'miss' | 'extra';

/** A word of the script: its text, the whitespace after it, and its position in its phrase. */
interface WordTok {
  text: string;
  gap: string;
  i: number;
}

/** A phrase of a paragraph (the unit the cursor steps by): `[s, e)` characters of the paragraph's text. */
interface ScriptUnit {
  key: string;
  s: number;
  e: number;
}

/** The take a stretch of a paragraph is heard in. `start` is seconds into the chapter recording before any cut. */
interface ScriptTake {
  id: string;
  text: string;
  start: number;
  len: number;
  /** The characters of the paragraph the take reads; the rest is read on its own before and after it. */
  s: number;
  e: number;
}

export interface ScriptParagraph {
  id: string;
  text: string;
  units: ScriptUnit[];
  take?: ScriptTake;
}

interface HeardRequest {
  /** The take, or the paragraph, this stretch is. */
  id: string;
  /** What was read: a take's transcript, or the script where the stretch has none of its own. */
  text: string;
  /** How long the stretch lasts, when it is known (a take). Otherwise the words are timed at the reading pace. */
  len?: number;
}

/** What the recogniser says about a stretch. Fed in by the caller; the model owns no host call. */
export interface Aligner {
  engine(): { id: string; name: string };
  /** What was heard, or null when nothing has been transcribed. */
  heard(req: HeardRequest): Heard | null;
  /** A cut point moved to the nearest zero crossing of the audio, seconds. */
  snap(sec: number): number;
}

interface WordEffect {
  id: string;
  keys: string[];
}

export interface ChapterInput {
  paragraphs: ScriptParagraph[];
  aligner: Aligner;
  cuts: DocCut[];
  effects: WordEffect[];
  /** Keys of words the narrator said are right: no longer flagged. */
  accepted: string[];
  /** How much of the script is recorded, 0 to 100, for paragraphs with no take (default 100). */
  recordedPercent?: number;
}

export interface DocItem {
  /** Stable: `pid:n` for the n-th word of the script, `pid:xn` for the n-th word that was said and is not in it. */
  key: string;
  kind: 'w' | 'x';
  text: string;
  /** Whitespace that follows the script word. */
  gap: string;
  tok?: WordTok;
  st: ItemState;
  /** 0 to 1: how sure the recogniser was. 0 for a word that was not read. */
  conf: number;
  /** The word that was heard, where it differs from the script (a misread). */
  heard?: string;
  pid: string;
  /** The phrase the word belongs to. */
  uKey: string;
  /** Seconds into the chapter recording as it stands now; null when nothing was recorded here. */
  t0: number | null;
  t1: number | null;
  /** Seconds from the start of the take (or of the paragraph), before any cut: where cuts and effects are made. */
  off0: number | null;
  off1: number | null;
  takeId?: string;
  /** Cut from the audio: the id of the cut that took it out. */
  cut?: string;
  fx: string[];
  /** A second read of the line (the take reads it twice). */
  dup?: boolean;
  accepted?: boolean;
  /** Which run of extra words it belongs to. */
  run?: number;
}
interface DocUnit {
  u: ScriptUnit;
  lead: string;
  items: DocItem[];
}
interface DocPara {
  p: ScriptParagraph;
  pi: number;
  take?: ScriptTake;
  units: DocUnit[];
  items: DocItem[];
  /** Seconds now where the paragraph's audio begins and ends. */
  start: number | null;
  end: number | null;
  recorded: boolean;
}
interface FlagCounts {
  extra: number;
  miss: number;
  mis: number;
  low: number;
}
export interface ChapterDoc {
  paras: DocPara[];
  items: DocItem[];
  index: Map<string, number>;
  /** Whether the recogniser has transcribed the recording. */
  aligned: boolean;
  engine: { id: string; name: string };
  counts: FlagCounts;
}

/** Below this a recognised word is flagged as low confidence. */
const LOW_CONFIDENCE = 0.7;
/** The gap kept between a take and the reading of the same paragraph before or after it (seconds). */
const JOIN = 0.2;
/** Pause between paragraphs read straight on (seconds). */
const BETWEEN = 0.5;

const wordsOf = (t: string): string[] => t.split(/\s+/).filter(Boolean);
export const r3 = (n: number): number => Math.round(n * 1000) / 1000;
const tokenCount = (t: string): number => wordsOf(t).length;

/** Every word of a stretch of text is its own token. */
function unitWords(text: string, s: number, e: number): { lead: string; words: WordTok[] } {
  const txt = text.slice(s, e);
  const words: WordTok[] = [];
  const re = /\S+\s*/g;
  let m: RegExpExecArray | null;
  let wi = 0;
  while ((m = re.exec(txt))) {
    const word = m[0].trimEnd();
    words.push({ text: word, gap: m[0].slice(word.length), i: wi++ });
  }
  return { lead: txt.match(/^\s*/)?.[0] ?? '', words };
}

interface Seg {
  from: number;
  to: number;
  heard: Heard | null;
  /** Seconds now of a moment `off` seconds into the segment's own stretch of the recording. */
  abs: (off: number) => number;
  /** The offset recorded for a cut: seconds from the start of the take, or of the paragraph. */
  rel: (off: number) => number;
  takeId?: string;
}

export function buildDoc(input: ChapterInput): ChapterDoc {
  const { paragraphs: paras, aligner: eng, cuts, effects, accepted } = input;
  const total = paras.reduce((a, p) => a + tokenCount(p.text), 0);
  const recordedWords = (total * (input.recordedPercent ?? 100)) / 100;
  const probe = paras.length ? eng.heard({ id: paras[0].id, text: paras[0].text }) : null;
  const aligned = probe !== null || paras.length === 0;

  /* 1. The stretches each paragraph is heard in: the take, with the words before and after it read on their own. */
  interface Plan {
    p: ScriptParagraph;
    pi: number;
    take?: ScriptTake;
    lead: number;
    mid: number;
    leadHeard: Heard | null;
    trailHeard: Heard | null;
    takeLen: number;
    anchor: number | null;
    natural: number;
    recorded: boolean;
  }
  let before = 0;
  const plans: Plan[] = paras.map((p, pi) => {
    const take = p.take;
    const lead = take ? tokenCount(p.text.slice(0, take.s)) : 0;
    const mid = take ? tokenCount(p.text.slice(take.s, take.e)) : 0;
    const leadText = take ? wordsOf(p.text.slice(0, take.s)).join(' ') : '';
    const trailText = take ? wordsOf(p.text.slice(take.e)).join(' ') : '';
    const leadHeard = take && lead && aligned ? eng.heard({ id: take.id + ':lead', text: leadText }) : null;
    const trailHeard = take && trailText && aligned ? eng.heard({ id: take.id + ':trail', text: trailText }) : null;
    const takeLen = take ? takeLength(cuts, take) : 0;
    const anchor = take ? origTime(cuts, take.start) - (leadHeard ? leadHeard.len + JOIN : 0) : null;
    const natural = take ? (leadHeard ? leadHeard.len + JOIN : 0) + takeLen + (trailHeard ? JOIN + trailHeard.len : 0) : 0;
    const recorded = !!take || before < recordedWords;
    before += tokenCount(p.text);
    return { p, pi, take, lead, mid, leadHeard, trailHeard, takeLen, anchor, natural, recorded };
  });

  /* 2. Where each paragraph without a take of its own begins: read straight on from the one before, fitted between the takes around it. */
  const origin: Array<number | null> = plans.map((pl) => pl.anchor);
  const slot: Array<number | undefined> = plans.map(() => undefined);
  let cursor = BETWEEN;
  for (let k = 0; k < plans.length; k++) {
    const pl = plans[k];
    if (pl.anchor != null) {
      cursor = pl.anchor + pl.natural + BETWEEN;
      continue;
    }
    if (!pl.recorded || !aligned) continue;
    let j = k;
    const run: number[] = [];
    while (j < plans.length && plans[j].anchor == null && plans[j].recorded) run.push(j++);
    const next = j < plans.length ? plans[j].anchor : null;
    const nat = run.map((r) => eng.heard({ id: plans[r].p.id, text: plans[r].p.text })?.len ?? 0);
    const need = nat.reduce((a, n) => a + n + BETWEEN, 0);
    const room = next != null ? next - BETWEEN - cursor : Infinity;
    const scale = room < need ? Math.max(0.3, room / need) : 1;
    run.forEach((r, ix) => {
      origin[r] = r3(cursor);
      if (scale < 1) slot[r] = r3(nat[ix] * scale);
      cursor += (nat[ix] + BETWEEN) * scale;
    });
    k = j - 1;
  }

  /* 3. The words. */
  const docParas: DocPara[] = plans.map((pl) => {
    const { p, pi, take } = pl;
    const unitList = p.units.map((u) => ({ u, ...unitWords(p.text, u.s, u.e) }));
    const script: Array<{ tok: WordTok; u: ScriptUnit }> = unitList.flatMap((x) => x.words.map((tok) => ({ tok, u: x.u })));
    const out: DocUnit[] = unitList.map((x) => ({ u: x.u, lead: x.lead, items: [] }));
    const unitIndex = new Map(out.map((x, i) => [x.u.key, i]));

    let segs: Seg[] = [];
    if (pl.recorded && aligned) {
      if (take) {
        const heard = eng.heard({ id: take.id, text: take.text, len: pl.takeLen });
        const base = (off: number): number => take.start + off - takeShift(cuts, take, off);
        const leadLen = pl.leadHeard ? pl.leadHeard.len + JOIN : 0;
        if (pl.lead) segs.push({ from: 0, to: pl.lead, heard: pl.leadHeard, abs: (o) => base(o - leadLen), rel: (o) => o - leadLen, takeId: take.id });
        segs.push({ from: pl.lead, to: pl.lead + pl.mid, heard, abs: base, rel: (o) => o, takeId: take.id });
        if (pl.lead + pl.mid < script.length) {
          segs.push({
            from: pl.lead + pl.mid,
            to: script.length,
            heard: pl.trailHeard,
            abs: (o) => base(pl.takeLen + JOIN + o),
            rel: (o) => pl.takeLen + JOIN + o,
            takeId: take.id,
          });
        }
      } else {
        const o = origin[pl.pi] ?? BETWEEN;
        const heard = eng.heard({ id: p.id, text: p.text, len: slot[pl.pi] });
        segs = [{ from: 0, to: script.length, heard, abs: (off) => curTime(cuts, o + off), rel: (off) => off }];
      }
    }

    const cutOf = (key: string): string | undefined => cuts.find((c) => c.keys.includes(key))?.id;
    const fxOf = (key: string): string[] => effects.filter((f) => f.keys.includes(key)).map((f) => f.id);
    const items: DocItem[] = [];
    let xn = 0;
    let run = 0;
    const push = (it: DocItem, uKey: string): void => {
      out[unitIndex.get(uKey) ?? 0].items.push(it);
      items.push(it);
    };
    const unheard = (w: { tok: WordTok; u: ScriptUnit }, n: number): void =>
      push(
        {
          key: p.id + ':' + n,
          kind: 'w',
          text: w.tok.text,
          gap: w.tok.gap,
          tok: w.tok,
          st: 'ok',
          conf: 1,
          pid: p.id,
          uKey: w.u.key,
          t0: null,
          t1: null,
          off0: null,
          off1: null,
          fx: [],
        },
        w.u.key,
      );
    const dupHead = take ? wordsOf(p.text.slice(take.s, take.e)).slice(0, 4).map(normKey) : [];

    if (!segs.length) script.forEach((w, i) => unheard(w, i));
    segs.forEach((seg) => {
      const words = script.slice(seg.from, seg.to).map((w) => w.tok.text);
      if (!seg.heard) {
        words.forEach((_, k) => unheard(script[seg.from + k], seg.from + k));
        return;
      }
      const ops = alignToScript(words, seg.heard.words);
      let lastU = script[seg.from]?.u.key ?? p.units[0]?.key ?? '';
      let prevEnd = seg.heard.words.length ? seg.abs(seg.heard.words[0].off0) : 0;
      let xRun: DocItem[] = [];
      const closeRun = (): void => {
        if (xRun.length >= 4 && xRun.slice(0, 4).every((x, k) => normKey(x.text) === dupHead[k]))
          xRun.forEach((x) => {
            x.dup = true;
          });
        xRun = [];
      };
      ops.forEach((op) => {
        if (op.kind === 'x') {
          const h = op.heard;
          const it: DocItem = {
            key: p.id + ':x' + xn++,
            kind: 'x',
            text: h.text,
            gap: ' ',
            st: 'extra',
            conf: h.conf,
            pid: p.id,
            uKey: lastU,
            t0: r3(seg.abs(h.off0)),
            t1: r3(seg.abs(h.off1)),
            off0: seg.rel(h.off0),
            off1: seg.rel(h.off1),
            takeId: seg.takeId,
            fx: [],
            run: xRun.length ? run - 1 : run++,
          };
          xRun.push(it);
          const k = cutOf(it.key);
          if (k) it.cut = k;
          it.fx = fxOf(it.key);
          if (accepted.includes(it.key)) it.accepted = true;
          push(it, lastU);
          prevEnd = it.t1 ?? prevEnd;
          return;
        }
        closeRun();
        const w = script[seg.from + op.i];
        const key = p.id + ':' + (seg.from + op.i);
        lastU = w.u.key;
        const h = op.heard;
        const it: DocItem = {
          key,
          kind: 'w',
          text: w.tok.text,
          gap: w.tok.gap,
          tok: w.tok,
          st: op.st,
          conf: h ? h.conf : 0,
          heard: op.st === 'mis' ? h?.text : undefined,
          pid: p.id,
          uKey: w.u.key,
          t0: h ? r3(seg.abs(h.off0)) : r3(prevEnd),
          t1: h ? r3(seg.abs(h.off1)) : r3(prevEnd),
          off0: h ? seg.rel(h.off0) : null,
          off1: h ? seg.rel(h.off1) : null,
          takeId: seg.takeId,
          fx: [],
        };
        const k = cutOf(key);
        if (k) it.cut = k;
        it.fx = fxOf(key);
        if (accepted.includes(key)) it.accepted = true;
        prevEnd = it.t1 ?? prevEnd;
        push(it, w.u.key);
      });
      closeRun();
    });
    /* Words that were cut sit where the cut was, with no length of their own. */
    items.forEach((it) => {
      if (!it.cut) return;
      const c = cuts.find((x) => x.id === it.cut);
      if (!c) return;
      const at = r3(curTime(cuts, c.a));
      it.t0 = at;
      it.t1 = at;
    });
    const timed = items.filter((i) => i.t0 != null && i.st !== 'miss' && !i.cut);
    return {
      p,
      pi,
      take,
      units: out,
      items,
      recorded: pl.recorded && aligned,
      start: timed.length ? timed[0].t0 : null,
      end: timed.length ? timed[timed.length - 1].t1 : null,
    };
  });

  const flat = docParas.flatMap((x) => x.items);
  return { paras: docParas, items: flat, index: new Map(flat.map((i, k) => [i.key, k])), aligned, engine: eng.engine(), counts: flagCounts(flat) };
}

export type FlagKind = 'extra' | 'miss' | 'mis' | 'low';
export const isLow = (i: DocItem): boolean => i.st === 'ok' && i.conf < LOW_CONFIDENCE;
function flagOf(i: DocItem): FlagKind | null {
  if (i.cut || i.accepted) return null;
  return i.st === 'extra' ? 'extra' : i.st === 'miss' ? 'miss' : i.st === 'mis' ? 'mis' : isLow(i) ? 'low' : null;
}

/** What the legend counts: words said that are not in the script, words not read, misreads, words the recogniser was unsure of. Cut words no longer count. */
function flagCounts(items: DocItem[]): FlagCounts {
  const live = items.filter((i) => !i.cut && !i.accepted);
  const count = (k: FlagKind): number => live.filter((i) => flagOf(i) === k).length;
  /* A run of words said and not written is one thing to look at. */
  const runs = live.filter((i, k) => i.st === 'extra' && !(live[k - 1]?.st === 'extra' && live[k - 1].run === i.run && live[k - 1].pid === i.pid)).length;
  return { extra: runs, miss: count('miss'), mis: count('mis'), low: count('low') };
}

/** The items worth a look, in order. A run of extra words counts once. */
export function flagged(doc: ChapterDoc, kind?: FlagKind): DocItem[] {
  return doc.items.filter((i, k) => {
    const f = flagOf(i);
    if (!f || (kind && f !== kind)) return false;
    return !(f === 'extra' && doc.items[k - 1] && flagOf(doc.items[k - 1]) === 'extra' && doc.items[k - 1].run === i.run && doc.items[k - 1].pid === i.pid);
  });
}
