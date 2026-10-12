/** What hiding the other takes asks before it mutes them: which take stays, that the rest are muted and not deleted, and how it is undone. */
export function HideOthersConfirmBody({ keptLabel, count, dawName }: { keptLabel: string; count: number; dawName: string }) {
  return (
    <div className="flex flex-col gap-2" data-hide-confirm>
      <p className="m-0">
        Keep {keptLabel} and mute the other {count === 1 ? 'take' : `${count} takes`}. They are muted, not deleted: they stay in the project, and you can look
        at them again here.
      </p>
      <p className="m-0 text-[var(--text-muted)]">It is one undo step in {dawName}: Undo there brings them back.</p>
    </div>
  );
}
