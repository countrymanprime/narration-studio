import { createContext, useContext, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useToastClearance } from '../../hooks/useToastClearance';
import { KeyChord } from './KeyCap';

// The app shell's page footer (#2251 item 35): full width along the bottom of the main column, like the header, outside the page's
// scrolling content and its cards. The shell provides the element; a `KeyHints` under it is drawn there, and one with no shell around it
// (a story, a test of one page) is drawn where it stands.
const PageFooterContext = createContext<HTMLElement | null>(null);
export const PageFooterProvider = PageFooterContext.Provider;

/** One hint: the keys, then what they do. Keys are named as `KeyCap` knows them ("↑", "Esc", "Right-click", "Space"). */
export interface KeyHintItem {
  keys: string[];
  label: string;
  id?: string;
}

// The standard footer of key reminders (rule 3): a row of small hints along the bottom of the page, in the shell's page
// footer, outside the content, so the page itself stays quiet. It starts at the left like the page's own text, so a hint that wraps
// starts the next line there too rather than leaving a centred orphan (alignment audit cause M). It has a tone of its own, a touch raised from the page, and a line
// above it. The list is data only: the page decides what to remind, `KeyChord` decides how a key is drawn.
// No bar to keep clear of: a KeyHints drawn where it stands is inside a footer that keeps toasts clear itself (the Booth's).
// Below 860 px, where the rail gives way to the drawer, the window is a touch width: a bar of keys there covers two rows of the page for keys
// nobody is pressing, so the shell's footer is not drawn (alignment audit R3PF-17). A KeyHints drawn where it stands is its page's to place.
const SHELL_FOOTER = 'max-[860px]:hidden';
const NOT_IN_SHELL: RefObject<HTMLElement | null> = { current: null };

export function KeyHints({ hints, id, children }: { hints: KeyHintItem[]; id?: string; children?: ReactNode }) {
  const footer = useContext(PageFooterContext);
  const ref = useRef<HTMLDivElement>(null);
  // In the shell's page footer it is a bar fixed along the bottom of the window: toasts rise above it rather than covering its hints
  // (alignment audit XED-25).
  useToastClearance(footer ? ref : NOT_IN_SHELL);
  const bar = (
    <div
      ref={ref}
      id={id}
      role="note"
      aria-label="Keyboard shortcuts"
      className={`${footer ? SHELL_FOOTER : ''} flex flex-wrap items-center justify-start gap-x-4 gap-y-1 border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--text)_5%,var(--bg))] px-4 py-2 font-['IBM_Plex_Sans',ui-sans-serif,sans-serif] text-xs leading-snug text-[var(--text-muted)]`}
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
  return footer ? createPortal(bar, footer) : bar;
}
