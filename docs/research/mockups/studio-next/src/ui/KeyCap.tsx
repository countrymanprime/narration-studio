/**
 * Key caps: the one mapping from a key name to its picture. A key with a good glyph shows the glyph (Font Awesome Free where it has one,
 * a tiny inline drawing where it has none: the space bar, a mouse with its right button lit); every other key stays as text.
 * The key hints footer, the shortcut sheet and any legend use `KeyCap` / `KeyChord`, so a key is drawn the same everywhere.
 * An icon key keeps its name for screen readers (visually hidden text) and for the hover tooltip.
 */
import type { ReactNode } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { faArrowDown, faArrowLeft, faArrowRight, faArrowRightToBracket, faArrowTurnDown, faArrowUp, faDeleteLeft, faXmark } from '@fortawesome/free-solid-svg-icons'

/** What a key looks like: a Font Awesome icon (optionally turned), or a small drawing. */
interface Glyph { name: string; icon?: IconDefinition; rotation?: 90 | 180 | 270; draw?: () => ReactNode; wide?: boolean }

const SVG = { viewBox: '0 0 24 12', width: 24, height: 12, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

/** The space bar: the open-box symbol (the shape of the bar seen from the front). */
const space = (): ReactNode => <svg {...SVG}><path d="M3 3v5.5h18V3" /></svg>
/** A mouse seen from above with the right button filled: the right-click. */
const rightClick = (): ReactNode => (
  <svg viewBox="0 0 12 16" width={11} height={14.5} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x={1.5} y={1} width={9} height={14} rx={4.5} />
    <path d="M1.5 6.5h9M6 1v5.5" />
    <path d="M6 1a4.5 4.5 0 0 1 4.5 4.5V6.5H6Z" fill="currentColor" />
  </svg>
)

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
  Space: { name: 'Space', draw: space, wide: true },
  RightClick: { name: 'Right-click', draw: rightClick },
}

/** Other spellings of the same key, as hints and shortcut lists write them. */
const ALIASES: Record<string, string> = {
  '↑': 'ArrowUp', Up: 'ArrowUp', '↓': 'ArrowDown', Down: 'ArrowDown', '←': 'ArrowLeft', Left: 'ArrowLeft', '→': 'ArrowRight', Right: 'ArrowRight',
  Return: 'Enter', '↵': 'Enter', Esc: 'Escape', '⌫': 'Backspace', ' ': 'Space', 'Right-click': 'RightClick',
}

/** The canonical name of a key as written in a hint ("↑", "Esc", "Right-click"), or the text itself when it has no glyph. */
export const canonicalKey = (k: string): string => ALIASES[k] ?? k
export const glyphOf = (k: string): Glyph | undefined => KEY_GLYPHS[canonicalKey(k)]
/** The words for a key: its name when it has a glyph (for a screen reader or a plain-text list), else the key itself. */
export const keyName = (k: string): string => glyphOf(k)?.name ?? k

/** One key. A key with a glyph is drawn, named for screen readers and given a tooltip; any other key is plain `kbd` text. */
export function KeyCap({ k }: { k: string }) {
  const g = glyphOf(k)
  if (!g) return <kbd>{k}</kbd>
  return (
    <kbd className={'kcap' + (g.wide ? ' wide' : '')} data-key={canonicalKey(k)} data-tip={g.name}>
      {g.icon ? <FontAwesomeIcon icon={g.icon} rotation={g.rotation} fixedWidth aria-hidden="true" /> : g.draw?.()}
      <span className="sr">{g.name}</span>
    </kbd>
  )
}

/** Several keys pressed together or one after the other, side by side. */
export function KeyChord({ keys }: { keys: string[] }) {
  return <>{keys.map((k, i) => <KeyCap key={i + k} k={k} />)}</>
}
