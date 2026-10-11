import { IconButton } from '../../primitives/IconButton';

/**
 * Previous and next note (the Studio Next Inspector's `#prevn` and `#nextn`). Each is disabled at its end; the move itself goes
 * through the caller's handler, which refuses it while the evidence is changed.
 */
export function NoteSteps({ canPrev, canNext, onStep }: { canPrev: boolean; canNext: boolean; onStep: (delta: -1 | 1) => void }) {
  return (
    <div role="group" aria-label="Notes" className="inline-flex gap-1">
      <IconButton action="previous" label="Previous note" disabled={!canPrev} onClick={() => onStep(-1)} />
      <IconButton action="next" label="Next note" disabled={!canNext} onClick={() => onStep(1)} />
    </div>
  );
}
