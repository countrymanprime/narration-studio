import type { ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faArrowDown,
  faArrowLeft,
  faArrowRight,
  faArrowRightToBracket,
  faArrowTurnDown,
  faArrowUp,
  faDeleteLeft,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { Kbd, KBD_SIZE_CLASSES, type KbdSize } from './Kbd';

// The one mapping from a key name to its picture (ADR 0761, rule 3). A key with a good glyph is drawn: Font Awesome Free
// where it has one, a small inline drawing where it has none (the space bar, a mouse with its right button lit). Every
// other key stays the text cap `Kbd` draws. A drawn key keeps its name as visually hidden text and as a tooltip. Key glyphs
// are not catalogue actions, so this file imports Font Awesome itself rather than going through `Icon`.
interface Glyph {
  name: string;
  icon?: IconDefinition;
  rotation?: 90 | 180 | 270;
  draw?: () => ReactNode;
  wide?: boolean;
}

const SPACE_BAR = (
  <svg
    viewBox="0 0 24 12"
    width={24}
    height={12}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 3v5.5h18V3" />
  </svg>
);

const RIGHT_CLICK = (
  <svg
    viewBox="0 0 12 16"
    width={11}
    height={14.5}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x={1.5} y={1} width={9} height={14} rx={4.5} />
    <path d="M1.5 6.5h9M6 1v5.5" />
    <path d="M6 1a4.5 4.5 0 0 1 4.5 4.5V6.5H6Z" fill="currentColor" />
  </svg>
);

/** The glyphs, by canonical key name. */
export const KEY_GLYPHS: Record<string, Glyph> = {
  ArrowUp: { name: 'Up arrow', icon: faArrowUp },
  ArrowDown: { name: 'Down arrow', icon: faArrowDown },
  ArrowLeft: { name: 'Left arrow', icon: faArrowLeft },
  ArrowRight: { name: 'Right arrow', icon: faArrowRight },
  Enter: { name: 'Enter', icon: faArrowTurnDown, rotation: 90 },
  Escape: { name: 'Esc', icon: faXmark },
  Tab: { name: 'Tab', icon: faArrowRightToBracket },
  Backspace: { name: 'Backspace', icon: faDeleteLeft },
  Space: { name: 'Space', draw: () => SPACE_BAR, wide: true },
  RightClick: { name: 'Right-click', draw: () => RIGHT_CLICK },
};

// Other spellings of the same key, as hints and shortcut lists write them.
const ALIASES: Record<string, string> = {
  '↑': 'ArrowUp',
  Up: 'ArrowUp',
  '↓': 'ArrowDown',
  Down: 'ArrowDown',
  '←': 'ArrowLeft',
  Left: 'ArrowLeft',
  '→': 'ArrowRight',
  Right: 'ArrowRight',
  Return: 'Enter',
  '↵': 'Enter',
  Esc: 'Escape',
  '⌫': 'Backspace',
  ' ': 'Space',
  'Right-click': 'RightClick',
};

/** The canonical name of a key as a hint writes it ("↑", "Esc", "Right-click"), or the text itself when it has no glyph. */
export const canonicalKey = (key: string): string => ALIASES[key] ?? key;
export const glyphOf = (key: string): Glyph | undefined => KEY_GLYPHS[canonicalKey(key)];
/** The words for a key: its glyph's name, else the key itself. */
export const keyName = (key: string): string => glyphOf(key)?.name ?? key;

const GLYPH_CAP_CLASSES =
  'box-border inline-flex min-w-[1.375rem] items-center justify-center rounded-[0.25rem] border border-b-2 border-[var(--border)] bg-[var(--surface-2)] text-[0.6875rem] leading-none text-[var(--text)] [&>svg]:block [&>svg]:flex-none';

/** One key: a drawn cap, named for a screen reader and given a tooltip, when the key has a glyph; otherwise the text `Kbd`. */
export function KeyCap({ k, size = 'sm' }: { k: string; size?: KbdSize }) {
  const glyph = glyphOf(k);
  if (!glyph) return <Kbd keys={[k]} size={size} />;
  return (
    <kbd className={`${GLYPH_CAP_CLASSES} ${KBD_SIZE_CLASSES[size]} ${glyph.wide ? 'min-w-[2.375rem]' : ''}`} data-key={canonicalKey(k)} title={glyph.name}>
      {glyph.icon ? <FontAwesomeIcon icon={glyph.icon} rotation={glyph.rotation} fixedWidth aria-hidden="true" /> : glyph.draw?.()}
      <span className="sr-only">{glyph.name}</span>
    </kbd>
  );
}

/** Several keys pressed together or one after the other, side by side. */
export function KeyChord({ keys, size = 'sm' }: { keys: string[]; size?: KbdSize }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((k, index) => (
        <KeyCap key={`${index}-${k}`} k={k} size={size} />
      ))}
    </span>
  );
}
