import { clock } from '../bar/clock';
import type { CleanupPreview as Preview } from './cleanupApply';
import { opSpec } from './cleanupOps';

/** What an apply will do, before it does anything: the pieces, their total length, where they go and how to undo. */
export function CleanupPreview({ preview }: { preview: Preview }) {
  const spec = opSpec(preview.kind);
  const n = preview.lines.length;
  return (
    <section
      aria-label="Preview"
      className="flex flex-col gap-1 rounded-[var(--radius-button)] border border-[var(--border)] p-2 text-[length:var(--font-size-sm)]"
    >
      <p className="m-0 font-semibold">
        {n} {spec.noun[n === 1 ? 0 : 1]} · {preview.seconds} s
      </p>
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {preview.lines.map((l) => (
          <li key={l.key}>
            <span className="font-['IBM_Plex_Mono',ui-monospace,monospace]">{clock(l.sec)}</span> · {l.measure} · {l.action}
          </li>
        ))}
      </ul>
      {preview.where ? <p className="m-0">Hidden on {preview.where}; nothing is deleted.</p> : null}
      <p className="m-0 text-[var(--text-muted)]">{preview.undo}</p>
    </section>
  );
}
