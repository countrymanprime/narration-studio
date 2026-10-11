import type { ReactNode } from 'react';
import { KeyChord } from './KeyCap';

/** One hint: the keys, then what they do. Keys are named as `KeyCap` knows them ("↑", "Esc", "Right-click", "Space"). */
export interface KeyHintItem {
  keys: string[];
  label: string;
  id?: string;
}

// The standard footer of key reminders (ADR 0761, rule 3): one centred row of small hints along the bottom of a page,
// outside the content, so the page itself stays quiet. It has a tone of its own, a touch raised from the page, and a line
// above it. The list is data only: the page decides what to remind, `KeyChord` decides how a key is drawn.
export function KeyHints({ hints, id, children }: { hints: KeyHintItem[]; id?: string; children?: ReactNode }) {
  return (
    <div
      id={id}
      role="note"
      aria-label="Keyboard shortcuts"
      className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--text)_5%,var(--bg))] px-4 py-2 font-['IBM_Plex_Sans',ui-sans-serif,sans-serif] text-xs leading-snug text-[var(--text-muted)]"
    >
      {hints.map((hint) => (
        <span key={hint.label} id={hint.id} className="inline-flex items-center gap-1 whitespace-nowrap">
          <KeyChord keys={hint.keys} />
          {hint.label}
        </span>
      ))}
      {children}
    </div>
  );
}
