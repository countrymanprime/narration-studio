import { Fragment } from 'react';
import { scriptParts } from './pickupRows';

/** The line to re-record, in the script face. A proof note can carry `<b>` and `<i>` for the word in question; nothing else is markup. */
export function ScriptLine({ text, plain = false }: { text: string; plain?: boolean }) {
  /* dir=auto: a right-to-left line reads and aligns right to left; break-words: one unbroken 500-character word wraps inside its cell. */
  return (
    <span dir="auto" className="[overflow-wrap:anywhere]">
      {(plain ? [{ kind: 'text' as const, text }] : scriptParts(text)).map((part, index) => {
        if (part.kind === 'b') return <b key={index}>{part.text}</b>;
        if (part.kind === 'i') return <i key={index}>{part.text}</i>;
        return <Fragment key={index}>{part.text}</Fragment>;
      })}
    </span>
  );
}
