/**
 * Stacking retries. A narrator who restarts a line leaves several takes of it along the chapter. Stacking puts the later reads on the first
 * read's spot, so a passage's takes share one place in time, and the audio that follows moves up to close the space the retries took. Un-stacking
 * puts each take back at the offset recorded when it was stacked. Pure functions of the passages, the retry settings and the document's
 * findings, effects and cuts, all passed in; the host, the DAW and the confirmation dialog are not here (SNE-7, DQ-7).
 */
import type { CutSpan } from './cuts';

export type RetryMode = 'stack' | 'leave';

/** How retries are kept: the project's choice, and a chapter's own where it made one. */
export interface RetrySettings {
  retryMode: RetryMode;
  retryChapters: Readonly<Record<string, RetryMode>>;
}

/** A read of a passage: seconds into the chapter and how long it lasts. */
export interface StackTake {
  id: string;
  start: number;
  len: number;
}

/** What stacking recorded: the take the others sit on, and how far each moved take was from it when it was recorded (seconds). */
interface StackRecord {
  base: string;
  offsets: Readonly<Record<string, number>>;
}

export interface StackPassage {
  id: string;
  chapterId: string;
  /** The passage's own choice; absent means it follows its chapter. */
  retryMode?: RetryMode;
  /** A take has been kept: nothing is stacked or un-stacked after that. */
  kept: boolean;
  takes: readonly StackTake[];
  stack?: StackRecord;
}

/** Things after the audio that move with it. All times are the document's (the chapter as it is now). */
interface Finding {
  id: string;
  chapterId: string;
  sec: number;
}
interface EffectSpan {
  id: string;
  chapterId: string;
  start: number;
  end: number;
}
interface PlacedCut extends CutSpan {
  id: string;
  chapterId: string;
}
export interface StackDocument {
  passages: readonly StackPassage[];
  findings: readonly Finding[];
  effects: readonly EffectSpan[];
  cuts: readonly PlacedCut[];
}

/** One take moving: where it was, where it goes. */
interface StackMove {
  takeId: string;
  from: number;
  to: number;
  len: number;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
/** Two starts closer than this are the same place. */
const STACK_EPS = 0.05;

/** How the retries of a chapter are kept unless a passage says otherwise. Nothing is stacked unless asked: the default is leave. */
export const chapterRetryMode = (s: RetrySettings, chapterId: string): RetryMode => s.retryChapters[chapterId] ?? s.retryMode;
/** How the retries of a passage are kept: its own choice, else its chapter's, else the project's. */
export const retryModeOf = (s: RetrySettings, p: Pick<StackPassage, 'chapterId' | 'retryMode'>): RetryMode => p.retryMode ?? chapterRetryMode(s, p.chapterId);

/** The first read: the take that begins first. It stays where it is and the others stack on it. */
export const baseTake = (p: Pick<StackPassage, 'takes'>): StackTake => p.takes.reduce((a, t) => (t.start < a.start ? t : a), p.takes[0]);
const takeEnd = (t: Pick<StackTake, 'start' | 'len'>): number => t.start + t.len;
export const passageStart = (p: Pick<StackPassage, 'takes'>): number => Math.min(...p.takes.map((t) => t.start));
/** Where the passage's audio ends: the end of its last take. */
export const passageEnd = (p: Pick<StackPassage, 'takes'>): number => Math.max(...p.takes.map(takeEnd));

/** Takes that sit on the first read's spot because they were stacked. */
const stackedTakes = (p: StackPassage): StackTake[] => p.takes.filter((t) => !!p.stack && t.id in p.stack.offsets);
export const isStacked = (p: StackPassage): boolean => stackedTakes(p).length > 0;
/** Later reads that are not on the first read's spot. */
export function movableTakes(p: StackPassage): StackTake[] {
  if (p.takes.length < 2) return [];
  const base = baseTake(p);
  return p.takes.filter((t) => t.id !== base.id && Math.abs(t.start - base.start) > STACK_EPS);
}
/** A retry group: a passage whose later reads are where they were recorded and no take is kept. One take read twice is not a group. */
export const canStack = (p: StackPassage): boolean => !p.kept && movableTakes(p).length > 0;
/** Takes go back to where they were recorded while no take is kept. */
export const canUnstack = (p: StackPassage): boolean => !p.kept && isStacked(p);

export interface StackGeometry {
  passage: StackPassage;
  base: StackTake;
  moves: StackMove[];
  /** The span the takes cover before and after the change. */
  before: { start: number; end: number };
  after: { start: number; end: number };
  /** Seconds the audio that follows moves: negative when stacking, positive when takes go back out. */
  shift: number;
}

function geometry(p: StackPassage, ids: readonly string[], to: (t: StackTake) => number): StackGeometry {
  const moves = p.takes.filter((t) => ids.includes(t.id)).map((t) => ({ takeId: t.id, from: round1(t.start), to: round1(to(t)), len: t.len }));
  const dest = (t: StackTake): number => moves.find((m) => m.takeId === t.id)?.to ?? t.start;
  const e0 = round1(passageEnd(p));
  const e1 = round1(Math.max(...p.takes.map((t) => dest(t) + t.len)));
  const start = round1(passageStart(p));
  return { passage: p, base: baseTake(p), moves, before: { start, end: e0 }, after: { start, end: e1 }, shift: round1(e1 - e0) };
}

/** Where the takes named (all that can be stacked by default) go if stacked on the first read. */
export function stackGeometry(p: StackPassage, ids: readonly string[] = movableTakes(p).map((t) => t.id)): StackGeometry {
  const base = baseTake(p);
  return geometry(p, ids, () => base.start);
}
/** Where the stacked takes named (all of them by default) go back to: the first read's start plus the offset recorded when they were stacked. */
export function unstackGeometry(p: StackPassage, ids: readonly string[] = stackedTakes(p).map((t) => t.id)): StackGeometry {
  const base = baseTake(p);
  return geometry(p, ids, (t) => base.start + (p.stack?.offsets[t.id] ?? 0));
}

/** The retry groups of a chapter the narrator asked to stack, in time order. */
export const stackable = (s: RetrySettings, passages: readonly StackPassage[], chapterId: string): StackPassage[] =>
  inTimeOrder(passages.filter((p) => p.chapterId === chapterId && canStack(p) && retryModeOf(s, p) === 'stack'));

const inTimeOrder = (ps: readonly StackPassage[]): StackPassage[] => ps.slice().sort((a, b) => passageStart(a) - passageStart(b));

/** The takes of a passage moved by `delta`, rounded and never before the chapter starts. */
function moveBy(p: StackPassage, delta: number): StackPassage {
  return { ...p, takes: p.takes.map((t) => ({ ...t, start: round1(Math.max(0, t.start + delta)) })) };
}

interface StackPlanGroup extends StackGeometry {
  /** How far the groups before this one moved the audio that reaches it. */
  ahead: number;
}
export interface StackPlan {
  /** The passages that move, in time order, each placed where the ones before it left it. */
  groups: StackPlanGroup[];
  /** Takes that move, summed. */
  takes: number;
  /** Seconds the audio that follows moves, summed. */
  shift: number;
  /** The span the plan touches, in the document's times before any of it moves; null when nothing moves. */
  region: { start: number; end: number } | null;
}

/**
 * What stacking (or un-stacking) these passages does. They are planned in time order, each starting from the positions after the one before
 * it has moved, so the numbers add up and no two passages overlap. Passages that cannot be stacked (or un-stacked) are left out.
 */
export function stackPlanOf(passages: readonly StackPassage[], direction: 'stack' | 'unstack' = 'stack', ids?: readonly string[]): StackPlan {
  const ok = direction === 'stack' ? canStack : canUnstack;
  let ahead = 0;
  const groups: StackPlanGroup[] = [];
  for (const raw of inTimeOrder(passages.filter(ok))) {
    const p = ahead === 0 ? raw : moveBy(raw, ahead);
    const g = direction === 'stack' ? stackGeometry(p) : unstackGeometry(p, ids);
    if (!g.moves.length) continue;
    groups.push({ ...g, ahead: round1(ahead) });
    ahead += g.shift;
  }
  return {
    groups,
    takes: groups.reduce((n, g) => n + g.moves.length, 0),
    shift: round1(groups.reduce((a, g) => a + g.shift, 0)),
    region: groups.length
      ? { start: Math.min(...groups.map((g) => g.before.start - g.ahead)), end: Math.max(...groups.map((g) => g.before.end - g.ahead)) }
      : null,
  };
}

/**
 * The audio that follows a moved span moves with it: other passages' takes, findings, effects and cuts that begin where the span ended.
 * `except` is the passage that moved itself. A change under 0.05 s is not a move.
 */
export function shiftAfter(
  doc: StackDocument,
  chapterId: string,
  boundary: number,
  delta: number,
  except: string,
  round: (n: number) => number = round1,
): StackDocument {
  if (Math.abs(delta) < STACK_EPS) return doc;
  const at = (sec: number): boolean => sec >= boundary - STACK_EPS;
  const move = (sec: number): number => round(Math.max(0, sec + delta));
  return {
    passages: doc.passages.map((p) =>
      p.chapterId !== chapterId || p.id === except ? p : { ...p, takes: p.takes.map((t) => (at(t.start) ? { ...t, start: move(t.start) } : t)) },
    ),
    findings: doc.findings.map((f) => (f.chapterId === chapterId && at(f.sec) ? { ...f, sec: move(f.sec) } : f)),
    effects: doc.effects.map((e) => {
      if (e.chapterId !== chapterId || !at(e.start)) return e;
      const start = move(e.start);
      return { ...e, start, end: round(Math.max(start + 0.1, e.end + delta)) };
    }),
    cuts: doc.cuts.map((c) => (c.chapterId === chapterId && at(c.a) ? { ...c, a: move(c.a), b: move(c.b) } : c)),
  };
}

/** Apply one geometry to the document: the takes move, the stack record follows, and what comes after moves with the audio. */
function applyGeometry(doc: StackDocument, g: StackGeometry, record: (p: StackPassage) => StackRecord | undefined): StackDocument {
  if (!g.moves.length) return doc;
  const moved = new Map(g.moves.map((m) => [m.takeId, m.to]));
  const passages = doc.passages.map((p) => {
    if (p.id !== g.passage.id) return p;
    const next: StackPassage = { ...p, takes: p.takes.map((t) => (moved.has(t.id) ? { ...t, start: moved.get(t.id) as number } : t)) };
    const stack = record(p);
    if (stack) next.stack = stack;
    else delete next.stack;
    return next;
  });
  return shiftAfter({ ...doc, passages }, g.passage.chapterId, g.before.end, g.shift, g.passage.id);
}

/** Stack the takes named (all that can be) of one passage on its first read, recording each take's offset. */
export function stackPassage(doc: StackDocument, passageId: string, ids?: readonly string[]): StackDocument {
  const p = doc.passages.find((x) => x.id === passageId);
  if (!p || !canStack(p)) return doc;
  const g = stackGeometry(p, ids);
  return applyGeometry(doc, g, (q) => ({
    base: q.stack?.base ?? g.base.id,
    offsets: { ...q.stack?.offsets, ...Object.fromEntries(g.moves.map((m) => [m.takeId, round1(m.from - g.base.start)])) },
  }));
}

/** Put the stacked takes named (all of them by default) of one passage back at their recorded offsets. */
export function unstackPassage(doc: StackDocument, passageId: string, ids?: readonly string[]): StackDocument {
  const p = doc.passages.find((x) => x.id === passageId);
  if (!p || !canUnstack(p)) return doc;
  const g = unstackGeometry(p, ids);
  return applyGeometry(doc, g, (q) => {
    const offsets = Object.fromEntries(Object.entries(q.stack?.offsets ?? {}).filter(([id]) => !g.moves.some((m) => m.takeId === id)));
    return Object.keys(offsets).length && q.stack ? { base: q.stack.base, offsets } : undefined;
  });
}

/** Stack these passages in time order, each from the positions the one before left. */
export function stackPassages(doc: StackDocument, passageIds: readonly string[]): StackDocument {
  const named = doc.passages.filter((p) => passageIds.includes(p.id));
  return inTimeOrder(named).reduce((d, p) => stackPassage(d, p.id), doc);
}
