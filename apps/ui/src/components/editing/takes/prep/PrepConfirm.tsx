import { LEVEL_TARGET_DB, STEP_TEXT, isTrim, type PrepStepId } from './prepSteps';

const plural = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** What a prep step asks the narrator before it runs: what changes, where the audio goes and how it is taken back. */
export function PrepConfirmBody({ step, dawName, cuts = 0, items = 0 }: { step: PrepStepId; dawName: string; cuts?: number; items?: number }) {
  if (!isTrim(step)) {
    return (
      <div className="flex flex-col gap-2" data-prep-confirm>
        <p className="m-0">
          Bring {plural(items, 'item')} on this chapter&apos;s linked track to {LEVEL_TARGET_DB} dBFS RMS, so the takes can be compared. This changes each
          item&apos;s volume in {dawName}.
        </p>
        <p className="m-0 text-[var(--text-muted)]">
          It is one undo step in {dawName}. Undo it in {dawName}; the figures are measured again afterwards.
        </p>
      </div>
    );
  }
  const what = step === 'trim-silence' ? 'the long pauses' : 'the breaths';
  return (
    <div className="flex flex-col gap-2" data-prep-confirm>
      <p className="m-0">
        {STEP_TEXT[step].label}: cut {what} in this passage ({plural(cuts, 'cut')}). The audio moves to the muted Cuts track; nothing is deleted.
      </p>
      <p className="m-0 text-[var(--text-muted)]">
        Undo it in {dawName}: {cuts === 1 ? 'one undo step' : `${cuts} undo steps, one per cut`}. The figures are measured again afterwards.
      </p>
    </div>
  );
}
