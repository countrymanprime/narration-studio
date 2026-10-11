import { readFileSync } from 'node:fs'
import { act as rtlAct, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SHORTCUTS } from '@/app/help'
import { modals } from '@/app/modals'
import { KEY_GLYPHS, KeyCap, canonicalKey, glyphOf, keyName } from '@/ui/KeyCap'
import { KeyHints } from '@/ui/KeyHints'
import { OverlayHost } from '@/ui/OverlayHost'
import { closeTopModal, getOverlay } from '@/ui/overlay'
import '@/pages'

afterEach(() => {
  cleanup()
  while (getOverlay().modals.length) closeTopModal()
})

describe('key caps: one mapping from a key to its picture', () => {
  it('draws arrows, Enter, Esc, Tab and Backspace as icons that keep their name for screen readers', () => {
    const { container } = render(<>{['↑', '↓', '←', '→', 'Enter', 'Esc', 'Tab', 'Backspace'].map((k) => <KeyCap key={k} k={k} />)}</>)
    const caps = [...container.querySelectorAll('kbd')]
    expect(caps).toHaveLength(8)
    caps.forEach((c) => {
      expect(c.querySelector('svg')).not.toBeNull()
      expect(c.querySelector('.sr')!.textContent).toBeTruthy()
      expect(c.getAttribute('data-tip')).toBe(c.querySelector('.sr')!.textContent)
    })
    expect(caps.map((c) => c.querySelector('.sr')!.textContent)).toEqual(['Up arrow', 'Down arrow', 'Left arrow', 'Right arrow', 'Enter', 'Esc', 'Tab', 'Backspace'])
  })

  it('draws the space bar and the right-click as small inline drawings (Font Awesome has neither)', () => {
    const { container } = render(<><KeyCap k="Space" /><KeyCap k="Right-click" /></>)
    const [space, click] = [...container.querySelectorAll('kbd')]
    expect(space.getAttribute('data-key')).toBe('Space')
    expect(space.querySelector('svg')).not.toBeNull()
    expect(space.classList.contains('wide')).toBe(true)
    expect(click.getAttribute('data-key')).toBe('RightClick')
    expect(click.querySelector('svg path[fill="currentColor"]')).not.toBeNull()
    expect(click.querySelector('.sr')!.textContent).toBe('Right-click')
  })

  it('keeps every other key as text: letters, modifiers, F-keys, Page Up', () => {
    const { container } = render(<>{['R', 'Ctrl', 'Shift', 'Alt', 'F11', 'Page Up'].map((k) => <KeyCap key={k} k={k} />)}</>)
    const caps = [...container.querySelectorAll('kbd')]
    expect(caps.map((c) => c.textContent)).toEqual(['R', 'Ctrl', 'Shift', 'Alt', 'F11', 'Page Up'])
    caps.forEach((c) => expect(c.querySelector('svg')).toBeNull())
  })

  it('knows the other spellings of a key and names them', () => {
    expect(canonicalKey('↑')).toBe('ArrowUp')
    expect(canonicalKey('Esc')).toBe(canonicalKey('Escape'))
    expect(glyphOf('Return')).toBe(KEY_GLYPHS.Enter)
    expect(keyName('→')).toBe('Right arrow')
    expect(keyName('Q')).toBe('Q')
  })
})

describe('the key hints footer', () => {
  it('shows the keys of each hint as key caps, followed by what they do, in a note region', () => {
    render(<KeyHints id="kh" hints={[{ keys: ['↑', '↓'], label: 'Notes' }, { keys: ['Ctrl', 'Z'], label: 'Undo' }, { keys: ['Space'], label: 'Play' }]} />)
    const foot = document.getElementById('kh')!
    expect(foot.getAttribute('role')).toBe('note')
    expect(foot.classList.contains('keyfoot')).toBe(true)
    expect(within(foot).getByText('Notes')).toBeInTheDocument()
    expect(foot.querySelectorAll('kbd')).toHaveLength(5)
    expect(foot.querySelector('kbd[data-key="ArrowUp"]')).not.toBeNull()
    expect(within(foot).getByText('Ctrl').tagName).toBe('KBD')
  })

  it('has its own tone and a line above it, and sits at the bottom of the scrolling page on Proof and Editing', () => {
    const css = readFileSync('src/styles/app.css', 'utf8')
    const rule = css.match(/(?:^|\n)\.keyfoot\{([^}]*)\}/)![1]
    expect(rule).toMatch(/background:\s*color-mix\([^)]*var\(--ink\)[^)]*var\(--bbg,var\(--bg\)\)\)/)
    expect(rule).toMatch(/border-top:\s*1px solid var\(--line-strong\)/)
    const sticky = css.match(/\.proof \.keyfoot\{([^}]*)\}/)![1]
    expect(sticky).toMatch(/position:sticky/)
    expect(sticky).toMatch(/bottom:-16px/)
    expect(css).toMatch(/\.nr \.proof\{grid-template-rows:auto auto auto minmax\(0,1fr\)\}/)
  })
})

describe('the shortcut sheet and list', () => {
  const open = () => { render(<OverlayHost />); rtlAct(() => { modals.help() }) }

  it('draws keys as key caps in the sheet, with icons where a key has one', () => {
    open()
    const sheet = document.querySelector('.sheetgrid')!
    expect(sheet.querySelector('kbd[data-key="ArrowUp"]')).not.toBeNull()
    expect(sheet.querySelector('kbd[data-key="Enter"]')).not.toBeNull()
    expect(sheet.querySelector('kbd[data-key="Space"]')).not.toBeNull()
    expect(sheet.querySelector('kbd[data-key="RightClick"]')).not.toBeNull()
    expect(within(sheet as HTMLElement).getByText('Jump menu')).toBeInTheDocument()
  })

  it('has no decision on the arrow keys; chapters are on left and right; Editing has its keys', () => {
    open()
    const rows = Object.fromEntries([...document.querySelectorAll('.sheetgrid > div')].map((r) => [r.querySelector('span')!.textContent, r]))
    const keysOf = (label: string): string[] => [...rows[label].querySelectorAll('kbd')].map((k) => k.getAttribute('data-key') ?? k.textContent!)
    expect(keysOf('Proof: pickup / edit / waive / defer')).toEqual(['P', 'E', 'W', 'D'])
    expect(keysOf('Proof: previous / next chapter')).toEqual(['ArrowLeft', 'ArrowRight'])
    // Editing reads by word: left and right move the cursor, Alt with up and down steps the chapter.
    expect(keysOf('Editing: word / phrase')).toEqual(['ArrowLeft', 'ArrowRight', 'Ctrl', 'ArrowLeft', 'ArrowRight'])
    expect(keysOf('Editing: previous / next chapter')).toEqual(['Alt', 'ArrowUp', 'ArrowDown'])
    expect(keysOf('Editing: play / pause')).toEqual(['Space'])
    expect(keysOf('Editing: delete words and audio')).toEqual(['Del'])
    expect(keysOf('Editing: add FX')).toEqual(['F'])
    expect(keysOf('Editing: take of the line')).toEqual(['T', 'Shift', 'T'])
    expect(keysOf('Editing: timeline')).toEqual(['S'])
    expect(keysOf('Editing: keep the take')).toEqual(['Enter'])
    expect(keysOf('Editing: hide / show the other takes')).toEqual(['H'])
    expect(screen.queryByText('Proof: decision')).toBeNull()
  })

  it('the plain-text list (Settings) is still [label, text] pairs without the arrow decision', () => {
    expect(SHORTCUTS.every(([a, b]) => typeof a === 'string' && typeof b === 'string' && b.length > 0)).toBe(true)
    const row = (l: string) => SHORTCUTS.find(([a]) => a === l)!
    expect(row('Proof decision')[1]).toBe('P E W D')
    expect(row('Proof: previous / next chapter')[1]).toBe('← →')
    expect(row('Context menu')[1]).toBe('Right-click · Shift F10')
    expect(row('Editing: keep the take')[1]).toBe('Enter')
  })
})
