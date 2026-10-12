import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LEVEL_TOLERANCE_DB } from '../model/estimates';
import { suggestionFor } from './evidence';
import type { LinePassage, LineTake } from './types';

export interface TakeCompareArgs {
  passage: LinePassage;
  /** The take the DAW said it kept, or null. */
  keptId: string | null;
  /** The take playing now, or null. */
  playingId: string | null;
  /** The take's own Play; called again for the take that plays, it stops. */
  onPlay: (take: LineTake) => void;
}

export interface TakeCompareState {
  aId: string;
  bId: string;
  setA: (id: string) => void;
  setB: (id: string) => void;
  /** "every" while the line's takes play in order, "ab" while the two picked takes do, else null. */
  running: 'every' | 'ab' | null;
  playEvery: () => void;
  playAB: () => void;
  stop: () => void;
  /** Why Play every take is off, or null. */
  everyReason: string | null;
  /** Why A then B is off, or null. */
  abReason: string | null;
  /** The takes Play every take left out, with the reason each cannot be heard; empty when none. */
  skipped: string[];
  /** The gap between the two picked takes' levels (dB) when it is more than the tolerance, else null. */
  levelGap: number | null;
}

const cannotBeHeard = 'This take cannot be heard.';
const reasonOf = (take: LineTake): string => `${take.label}: ${take.reason ?? cannotBeHeard}`;

/** The run in progress: the takes still to play after `current`, and whether `current` has been seen playing yet. */
interface Run {
  queue: string[];
  current: string;
  seen: boolean;
}

/**
 * Plays the takes of one line in a row through the take's own Play: every take in order, or the two the narrator picked, A then B. The next take
 * starts when the one playing ends; Stop and Escape (while focus is on the compare controls, where a press of Play leaves it) end the run. The pickers start on the kept take (else the active one) and on the suggested
 * take (else the next one): a suggestion only fills a picker, it keeps nothing. A take that cannot be heard is left out of the run, with its reason.
 */
export function useTakeCompare({ passage, keptId, playingId, onPlay }: TakeCompareArgs): TakeCompareState {
  const { takes } = passage;
  const [pickA, setA] = useState<string | null>(null);
  const [pickB, setB] = useState<string | null>(null);
  const [running, setRunning] = useState<'every' | 'ab' | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const run = useRef<Run | null>(null);
  const live = useRef({ takes, playingId, onPlay });
  live.current = { takes, playingId, onPlay };

  const byId = useCallback((id: string | null) => takes.find((t) => t.id === id), [takes]);
  const aId = (byId(pickA) ?? byId(keptId) ?? takes.find((t) => t.active) ?? takes[0])?.id ?? '';
  const suggestedId = useMemo(() => suggestionFor(takes).take, [takes]);
  const bId = (byId(pickB) ?? (suggestedId !== aId ? byId(suggestedId) : undefined) ?? takes.find((t) => t.id !== aId) ?? takes[0])?.id ?? '';

  const end = useCallback(() => {
    run.current = null;
    setRunning(null);
  }, []);

  const stop = useCallback(() => {
    const { takes: all, playingId: now, onPlay: play } = live.current;
    const wasRunning = run.current !== null;
    end();
    const playing = all.find((t) => t.id === now);
    if (wasRunning && playing) play(playing);
  }, [end]);

  const begin = useCallback((kind: 'every' | 'ab', ids: string[]) => {
    const { takes: all, playingId: now, onPlay: play } = live.current;
    const [first, ...queue] = ids;
    if (first === undefined) return;
    run.current = { queue, current: first, seen: now === first };
    setRunning(kind);
    const take = all.find((t) => t.id === first);
    // The take already playing is the start of the run; calling its Play would stop it.
    if (take && now !== first) play(take);
  }, []);

  const playable = takes.filter((t) => t.usable);
  const playEvery = useCallback(() => {
    setSkipped(takes.filter((t) => !t.usable).map(reasonOf));
    begin(
      'every',
      playable.map((t) => t.id),
    );
  }, [takes, playable, begin]);
  const playAB = useCallback(() => begin('ab', [aId, bId]), [begin, aId, bId]);

  // Moves the run on: the next take starts when the one playing ends; another take started by hand ends the run.
  useEffect(() => {
    const current = run.current;
    if (!current) return;
    if (playingId === current.current) {
      current.seen = true;
      return;
    }
    if (!current.seen) return;
    if (playingId !== null) {
      end();
      return;
    }
    const next = current.queue.shift();
    const take = byId(next ?? null);
    if (!take) {
      end();
      return;
    }
    current.current = take.id;
    current.seen = false;
    onPlay(take);
  }, [playingId, byId, onPlay, end]);

  // Closing the takes mid-run stops what the run started.
  useEffect(
    () => () => {
      const { takes: all, playingId: now, onPlay: play } = live.current;
      const playing = all.find((t) => t.id === now);
      if (run.current && playing) play(playing);
      run.current = null;
    },
    [],
  );

  const a = byId(aId);
  const b = byId(bId);
  const everyReason = playable.length === 0 ? (takes[0] ? reasonOf(takes[0]) : 'This line has no takes.') : null;
  const abReason =
    !a || !b ? 'This line has no takes.' : a.id === b.id ? 'Pick two different takes.' : !a.usable ? reasonOf(a) : !b.usable ? reasonOf(b) : null;
  const rmsA = a?.evidence?.measure.rms;
  const rmsB = b?.evidence?.measure.rms;
  const gap = rmsA?.ok && rmsB?.ok ? Math.abs(rmsA.value - rmsB.value) : null;

  return {
    aId,
    bId,
    setA,
    setB,
    running,
    playEvery,
    playAB,
    stop,
    everyReason,
    abReason,
    skipped,
    levelGap: gap !== null && gap > LEVEL_TOLERANCE_DB ? gap : null,
  };
}
