import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { DocItem } from '../model';
import {
  dragCreate,
  moveEdge,
  moveSpan,
  nudgeEdge,
  nudgeStep,
  rangeLabel,
  snapTo,
  stepBoundary,
  wordBoundaries,
  wordsCovered,
  type Edge,
  type Span,
} from './rangeMath';
import { capturePointer, releasePointer } from './pointerCapture';
import type { RibbonView } from './useRibbonView';

/** A pointer that moves less than this many pixels between down and up was a tap, not a drag. */
const TAP_PX = 3;

type Drag =
  { kind: 'create'; anchor: number; raw: number; x0: number; moved: boolean } | { kind: 'edge'; edge: Edge } | { kind: 'move'; grab: number; origin: Span };

export interface RangeInteraction {
  /** The range to draw: the one being dragged, else the page's. */
  shown: Span | null;
  /** The words the range covers, for its labels. */
  covered: ReturnType<typeof wordsCovered>;
  /** What a screen reader is told when a range is set, a sentence, empty until then. */
  announcement: string;
  surface: {
    onPointerDown: (e: PointerEvent) => void;
    onPointerMove: (e: PointerEvent) => void;
    onPointerUp: (e: PointerEvent) => void;
    onPointerCancel: (e: PointerEvent) => void;
  };
  handle: (edge: Edge) => {
    onPointerDown: (e: PointerEvent) => void;
    onPointerMove: (e: PointerEvent) => void;
    onPointerUp: (e: PointerEvent) => void;
    onPointerCancel: (e: PointerEvent) => void;
    onKeyDown: (e: KeyboardEvent) => void;
    onFocus: () => void;
  };
  body: {
    onPointerDown: (e: PointerEvent) => void;
    onPointerMove: (e: PointerEvent) => void;
    onPointerUp: (e: PointerEvent) => void;
    onPointerCancel: (e: PointerEvent) => void;
  };
}

export interface RangeInteractionArgs {
  surface: HTMLElement | null;
  /** The paragraph's start on the document's clock; the view is seconds from it. */
  t0: number;
  view: Pick<RibbonView, 'view' | 'reveal'>;
  /** The paragraph's own span: a range stays inside it. */
  bounds: Span;
  words: readonly DocItem[];
  range: Span | null;
  /** The range changed: `drag` while the pointer is down, `commit` when it is let go or a key moved an edge. */
  onRange: (span: Span, phase: 'drag' | 'commit') => void;
  /** A tap on the waveform at a time (document seconds). */
  onTap: (t: number) => void;
}

/**
 * The pointer and keyboard behaviour of the range on the Editing waveform. Drag on the waveform draws one, a handle moves its edge, the body
 * moves all of it; Alt snaps to the nearest word boundary (the start and end of any heard word), and the same rule steps by boundary with
 * Alt+Arrow. Arrow keys on a handle nudge by a hundredth of the view, Shift ten times that. All times are clamped to the paragraph and kept
 * the minimum apart (`rangeMath`).
 */
export function useRangeInteraction({ surface, t0, view, bounds, words, range, onRange, onTap }: RangeInteractionArgs): RangeInteraction {
  const drag = useRef<Drag | null>(null);
  const draftRef = useRef<Span | null>(null);
  const [draft, setDraft] = useState<Span | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const edges = useMemo(() => wordBoundaries(words), [words]);
  const shown = draft ?? range;
  const covered = useMemo(() => (shown ? wordsCovered(words, shown) : wordsCovered([], { start: 0, end: 0 })), [words, shown]);

  const timeAt = useCallback(
    (clientX: number): number => {
      const rect = surface?.getBoundingClientRect();
      const along = rect && rect.width ? (clientX - rect.left) / rect.width : 0;
      return t0 + view.view.start + along * view.view.len;
    },
    [surface, t0, view.view.start, view.view.len],
  );
  const snapIf = (t: number, snap: boolean): number => (snap ? snapTo(edges, t) : t);

  const set = (next: Span): void => {
    draftRef.current = next;
    setDraft(next);
    onRange(next, 'drag');
  };
  const say = (span: Span): void => setAnnouncement(`Range set: ${rangeLabel(span, wordsCovered(words, span).keys.length)}.`);
  const commit = (span: Span): void => {
    onRange(span, 'commit');
    say(span);
  };

  const move = (event: PointerEvent): void => {
    const d = drag.current;
    if (!d) return;
    const t = timeAt(event.clientX);
    if (d.kind === 'create') {
      if (!d.moved && Math.abs(event.clientX - d.x0) < TAP_PX) return;
      d.moved = true;
      set(dragCreate(d.anchor, snapIf(t, event.altKey), bounds));
    } else if (d.kind === 'edge') {
      const base = draftRef.current ?? range;
      if (base) set(moveEdge(base, d.edge, snapIf(t, event.altKey), bounds));
    } else {
      const slid = moveSpan(d.origin, t - d.grab, bounds);
      // Snapped, the start edge lands on a boundary and the width is kept.
      set(event.altKey ? moveSpan(d.origin, snapTo(edges, slid.start) - d.origin.start, bounds) : slid);
    }
  };
  const up = (event: PointerEvent): void => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    releasePointer(event.currentTarget, event.pointerId);
    const final = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    if (d.kind === 'create' && !d.moved) return onTap(d.raw);
    if (final) commit(final);
  };

  const begin = (event: PointerEvent, next: Drag): void => {
    if (event.button !== 0) return;
    event.stopPropagation();
    drag.current = next;
    draftRef.current = null;
    capturePointer(event.currentTarget, event.pointerId);
  };
  const pointer = (down: (e: PointerEvent) => void) => ({
    onPointerDown: down,
    onPointerMove: (e: PointerEvent) => {
      e.stopPropagation();
      move(e);
    },
    onPointerUp: (e: PointerEvent) => {
      e.stopPropagation();
      up(e);
    },
    onPointerCancel: (e: PointerEvent) => {
      e.stopPropagation();
      up(e);
    },
  });

  return {
    shown,
    covered,
    announcement,
    surface: pointer((e) => {
      const raw = timeAt(e.clientX);
      begin(e, { kind: 'create', anchor: snapIf(raw, e.altKey), raw, x0: e.clientX, moved: false });
    }),
    handle: (edge) => ({
      ...pointer((e) => begin(e, { kind: 'edge', edge })),
      onKeyDown: (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        // The page's own arrows step the word cursor; these are for the edge.
        event.preventDefault();
        event.stopPropagation();
        if (!shown) return;
        const dir = event.key === 'ArrowRight' ? 1 : -1;
        commit(
          event.altKey
            ? moveEdge(shown, edge, stepBoundary(edges, shown[edge], dir), bounds)
            : nudgeEdge(shown, edge, dir, nudgeStep(view.view.len, event.shiftKey), bounds),
        );
      },
      onFocus: () => shown && view.reveal(shown[edge] - t0),
    }),
    body: pointer((e) => shown && begin(e, { kind: 'move', grab: timeAt(e.clientX), origin: shown })),
  };
}
