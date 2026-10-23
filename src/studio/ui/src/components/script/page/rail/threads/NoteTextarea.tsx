import type { ComponentPropsWithRef } from 'react';
import { MARK_TEXT_MAX } from '../../../../../api/contracts/marks';

/** The one text box of a note or a reply, at the note limit. A card holds two kinds of it (a reply and an edit), so they share the look. */
export function NoteTextarea({ className = '', ...rest }: Omit<ComponentPropsWithRef<'textarea'>, 'maxLength'> & { 'aria-label': string }) {
  return (
    // native-control-ok: Field's textarea carries a visible label above it and no length limit; a card names this one by aria-label, as the mock does
    <textarea
      maxLength={MARK_TEXT_MAX}
      className={`box-border min-h-14 w-full resize-y rounded-[var(--control-radius)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2 text-[0.88rem] leading-[1.35] text-[var(--text)] ${className}`}
      {...rest}
    />
  );
}
