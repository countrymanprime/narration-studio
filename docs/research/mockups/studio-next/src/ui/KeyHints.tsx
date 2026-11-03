import type { ReactNode } from 'react'
import { KeyChord } from './KeyCap'

/** One hint: the keys, then what they do. Keys are named as `KeyCap` knows them ("↑", "Esc", "Right-click", "Space"). */
export interface KeyHint { keys: string[]; label: string; id?: string }

/**
 * The standard footer of key reminders: one centred row of small hints along the bottom of a page, outside the content,
 * so the page itself stays quiet. It has a tone of its own (a touch raised from the page) and a line above it. On a page that scrolls
 * it stays at the bottom of the visible area. Booth, Proof and Editing use it; a page with keys to remember adds one rather than a legend inside its panel.
 */
export function KeyHints({ hints, id, children }: { hints: KeyHint[]; id?: string; children?: ReactNode }) {
  return (
    <div className="keyfoot bkeys" id={id} role="note" aria-label="Keyboard shortcuts">
      {hints.map((h) => (
        <span className="bkey" key={h.label} id={h.id}><KeyChord keys={h.keys} /> {h.label}</span>
      ))}
      {children}
    </div>
  )
}
