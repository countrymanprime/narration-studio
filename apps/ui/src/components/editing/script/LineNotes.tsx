import { markToken } from '../../../kinds/narratorMark';
import type { ParagraphNote } from '../../booth/reading/boothUnits';

/** A line's Booth notes under its text, "name: text" (the mock's `.bnote`), each ended by a bar in its mark type's colour (D8). */
export function LineNotes({ notes }: { notes: readonly ParagraphNote[] }) {
  return (
    <div className="col-start-2 flex flex-col items-start gap-1 pt-1 text-[length:var(--font-size-sm)] leading-[1.4]">
      {notes.map((n) => (
        <span
          key={n.id}
          data-ann={n.id}
          style={n.colour ? { boxShadow: `inset 0.25em 0 0 var(${markToken(n.colour)})`, paddingLeft: '1.1em' } : undefined}
          className="block w-fit max-w-full rounded-md bg-[var(--accent-soft)] px-[0.8em] py-[0.35em] font-medium text-[var(--accent-strong)] select-text"
        >
          {n.name}: {n.text}
        </span>
      ))}
    </div>
  );
}
