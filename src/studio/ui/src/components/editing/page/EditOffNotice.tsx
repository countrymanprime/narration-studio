/**
 * Why Delete, Mute and Add FX are off, in words above the bar: the capability's own sentence ("Experimental: switched off in Settings."). The
 * buttons stay, disabled, and carry the same sentence in their hint, but a hint is not on the page for someone who does not hover.
 */
export function EditOffNotice({ reason }: { reason: string }) {
  return (
    <p
      id="editoff"
      role="status"
      className="m-0 border-t border-[var(--border)] bg-[var(--surface)] px-3.5 pt-2 text-sm [overflow-wrap:anywhere] text-[var(--text-muted)]"
    >
      <b className="font-semibold text-[var(--text)]">Delete, Mute and Add FX are off.</b> {reason}
    </p>
  );
}
