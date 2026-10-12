import type { PrepState } from '../../../../api/contracts/scriptPrep';
import { PREP_LABELS } from '../data/scriptCommands';

// The mock's prep dot: a ring for not started, a half-filled ring for in progress and a solid dot for prepped, so the state is a
// shape as well as a colour. It is an image named for its state where it stands alone in a row; beside its own words (the legend,
// the card's buttons) it is decoration.
const SHAPE: Record<PrepState, string> = {
  none: 'border-[var(--line-strong)]',
  progress: 'border-[var(--info)] bg-[linear-gradient(90deg,var(--info)_50%,transparent_50%)]',
  prepped: 'border-[var(--ok)] bg-[var(--ok)]',
};

export function PrepDot({ state, decorative = false }: { state: PrepState; decorative?: boolean }) {
  return (
    <span
      data-prep={state}
      title={decorative ? undefined : PREP_LABELS[state]}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : PREP_LABELS[state]}
      aria-hidden={decorative || undefined}
      className={`inline-block size-3 flex-none rounded-full border-2 ${SHAPE[state]}`}
    />
  );
}
