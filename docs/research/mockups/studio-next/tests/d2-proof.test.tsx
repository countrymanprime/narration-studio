import { act as rtlAct, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { keyHandlersFor } from '@/app/registry'
import { MIN_WINDOW, RES_CHIP_CH, RES_LABEL, TO_REVIEW_LABEL, TYPE_CHIP_CH, FINDING_TYPES, WAVE_TOTAL, resizeWindow, stepLen } from '@/selectors/proof'
import { decideNote, resizeWin, zoomWindow } from '@/state/commands/proof'
import { createInitialState, getState, resetState, update } from '@/state/store'
import { OverlayHost } from '@/ui/OverlayHost'
import { closePop, closeTopModal, dismissToast, getOverlay } from '@/ui/overlay'
import ProofPage from '@/pages/Proof'
import '@/pages'

const mount = () => render(<><OverlayHost /><ProofPage /></>)
const setup = (win?: { winStart: number; winLen: number }) => {
  const s = createInitialState({ prefs: undefined })
  s.ui.page = 'proof'
  s.ui.proof = { ...s.ui.proof, scope: 'chapter', sel: 1, winFor: 1, winFilter: false, ...(win ?? {}) }
  s.ui.chapter = '5'
  resetState(s)
}
const note = (id: number) => getState().data.proofNotes.find((n) => n.id === id)!
const win = () => getState().ui.proof
const ptr = (el: Element, type: string, clientX: number) =>
  rtlAct(() => { el.dispatchEvent(Object.assign(new MouseEvent(type, { clientX, bubbles: true, button: 0 }), { pointerId: 1 })) })
const mini = () => {
  const m = document.querySelector('#wmini') as HTMLElement
  m.getBoundingClientRect = () => ({ left: 0, right: WAVE_TOTAL, top: 0, bottom: 34, width: WAVE_TOTAL, height: 34, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  return m
}
const edge = (e: 'start' | 'end') => document.querySelector(`[data-edge="${e}"]`) as HTMLElement

beforeEach(() => setup({ winStart: 100, winLen: 60 }))
afterEach(() => {
  cleanup()
  while (getOverlay().modals.length) closeTopModal()
  closePop()
  getOverlay().toasts.forEach((t) => dismissToast(t.id))
})

describe('resizing the window', () => {
  it('moves one edge and keeps the other, with a minimum length, inside the chapter', () => {
    expect(resizeWindow(100, 60, 'start', 50)).toEqual({ winStart: 50, winLen: 110 })
    expect(resizeWindow(100, 60, 'end', 200)).toEqual({ winStart: 100, winLen: 100 })
    expect(resizeWindow(100, 60, 'start', 159)).toEqual({ winStart: 160 - MIN_WINDOW, winLen: MIN_WINDOW })
    expect(resizeWindow(100, 60, 'end', 101)).toEqual({ winStart: 100, winLen: MIN_WINDOW })
    expect(resizeWindow(100, 60, 'start', -50)).toEqual({ winStart: 0, winLen: 160 })
    expect(resizeWindow(100, 60, 'end', 5000)).toEqual({ winStart: 100, winLen: WAVE_TOTAL - 100 })
    expect(resizeWindow(10, 40, 'end', 500, 100)).toEqual({ winStart: 10, winLen: 90 })
  })

  it('zoom steps from a length between the steps go to the neighbouring step; none past the ends', () => {
    expect(stepLen(45, 1)).toBe(60)
    expect(stepLen(45, -1)).toBe(30)
    expect(stepLen(60, 1)).toBe(120)
    expect(stepLen(30, -1)).toBeNull()
    expect(stepLen(WAVE_TOTAL, 1)).toBeNull()
    setup({ winStart: 100, winLen: 45 })
    rtlAct(() => zoomWindow(1))
    expect(win().winLen).toBe(60)
  })

  it('the overview window has an edge handle on each side, as sliders with the time and the range they can move in', () => {
    mount()
    const s = edge('start')
    const e = edge('end')
    expect(s.getAttribute('role')).toBe('slider')
    expect(s.getAttribute('aria-valuenow')).toBe('100')
    expect(s.getAttribute('aria-valuemin')).toBe('0')
    expect(s.getAttribute('aria-valuemax')).toBe(String(160 - MIN_WINDOW))
    expect(e.getAttribute('aria-valuenow')).toBe('160')
    expect(e.getAttribute('aria-valuemax')).toBe(String(WAVE_TOTAL))
    expect(s.getAttribute('aria-label')).toMatch(/Start of the part shown/)
    expect(s.tabIndex).toBe(0)
  })

  it('dragging the left edge sets the start, the right edge the end; the other edge stays', () => {
    mount()
    mini()
    ptr(edge('start'), 'pointerdown', 100)
    ptr(edge('start'), 'pointermove', 40)
    expect(win()).toMatchObject({ winStart: 40, winLen: 120 })
    ptr(edge('start'), 'pointerup', 40)
    ptr(edge('end'), 'pointerdown', 160)
    ptr(edge('end'), 'pointermove', 300)
    expect(win()).toMatchObject({ winStart: 40, winLen: 260 })
    ptr(edge('end'), 'pointerup', 300)
    expect(win().winStart + win().winLen).toBe(300)
  })

  it('an edge cannot cross the other one (minimum length) or leave the chapter', () => {
    mount()
    mini()
    ptr(edge('end'), 'pointerdown', 160)
    ptr(edge('end'), 'pointermove', 90)
    expect(win()).toMatchObject({ winStart: 100, winLen: MIN_WINDOW })
    ptr(edge('end'), 'pointermove', 5000)
    expect(win().winStart + win().winLen).toBe(WAVE_TOTAL)
    ptr(edge('end'), 'pointerup', 5000)
    ptr(edge('start'), 'pointerdown', 100)
    ptr(edge('start'), 'pointermove', -300)
    expect(win().winStart).toBe(0)
  })

  it('grabbing the body keeps the spot under the pointer, and an edge drag does not move the window', () => {
    mount()
    const m = mini()
    ptr(document.querySelector('.wwin')!, 'pointerdown', 140)
    expect(win().winStart).toBe(100)
    expect(m.hasAttribute('data-grabbing')).toBe(true)
    ptr(m, 'pointermove', 240)
    expect(win()).toMatchObject({ winStart: 200, winLen: 60 })
    ptr(m, 'pointerup', 240)
    expect(m.hasAttribute('data-grabbing')).toBe(false)
    ptr(edge('start'), 'pointerdown', 200)
    ptr(edge('start'), 'pointermove', 150)
    ptr(edge('start'), 'pointerup', 150)
    expect(win()).toMatchObject({ winStart: 150, winLen: 110 })
  })

  it('a click on the strip outside the window centres it there, as before', () => {
    mount()
    const m = mini()
    ptr(m, 'pointerdown', 500)
    ptr(m, 'pointerup', 500)
    expect(win().winStart).toBeCloseTo(470)
  })

  it('a focused edge moves by 5 s with the arrow keys (30 s with Shift) and keeps the key to itself', () => {
    mount()
    const s = edge('start')
    const k = (el: Element, key: string, shiftKey = false) => rtlAct(() => { fireEvent.keyDown(el, { key, shiftKey }) })
    k(s, 'ArrowLeft')
    expect(win()).toMatchObject({ winStart: 95, winLen: 65 })
    k(s, 'ArrowRight', true)
    expect(win()).toMatchObject({ winStart: 125, winLen: 35 })
    k(edge('end'), 'ArrowRight')
    expect(win()).toMatchObject({ winStart: 125, winLen: 40 })
    k(edge('end'), 'ArrowLeft', true)
    expect(win().winLen).toBe(MIN_WINDOW)
    expect(getState().ui.chapter).toBe('5')
  })

  it('the window can be resized from a command and the zoom buttons follow the new length', () => {
    mount()
    rtlAct(() => resizeWin('end', 145))
    expect(win().winLen).toBe(45)
    expect(document.querySelector<HTMLButtonElement>('#wzin')!.disabled).toBe(false)
    rtlAct(() => resizeWin('end', 130))
    expect(document.querySelector<HTMLButtonElement>('#wzin')!.disabled).toBe(true)
  })

  it('the handles have the edge-resize cursor and the body the grab cursors (stylesheet)', async () => {
    const css = (await import('node:fs')).readFileSync('src/styles/app.css', 'utf8')
    expect(css).toMatch(/\.wedge\{[^}]*cursor:ew-resize/)
    expect(css).toMatch(/\.wwin\{[^}]*cursor:grab/)
    expect(css).toMatch(/\[data-grabbing\][^{]*\{cursor:grabbing/)
    expect(css).toMatch(/\.wedge\{[^}]*width:12px/)
  })
})

describe('the pins sit symmetric about the waveform centerline', () => {
  it('no pin head reaches higher above the centerline than the waveform reaches below it, and none is clipped', () => {
    mount()
    const svg = document.querySelector('#wave svg')!
    const H = +svg.getAttribute('viewBox')!.split(' ')[3]
    const bars = [...svg.querySelectorAll('rect[rx="1.2"]')]
    expect(bars.length).toBeGreaterThan(10)
    bars.forEach((b) => expect(+b.getAttribute('y')! + +b.getAttribute('height')! / 2).toBeCloseTo(H / 2))
    const heads = [...svg.querySelectorAll('[data-mk] circle, [data-cl] circle')]
    expect(heads.length).toBeGreaterThan(0)
    heads.forEach((c) => {
      const top = +c.getAttribute('cy')! - +c.getAttribute('r')! - 1
      expect(top).toBeGreaterThanOrEqual(0)
      expect(H / 2 - top).toBeLessThanOrEqual(H - H / 2)
    })
    expect(H).toBeLessThan(124)
  })

  it('the hit area of a pin is at least 20 px wide and 24 px tall, and the stem is a wide hit line', () => {
    mount()
    const g = document.querySelector('#wave [data-mk]')!
    const hit = [...g.querySelectorAll('rect')].find((r) => r.getAttribute('fill') === 'transparent')!
    expect(+hit.getAttribute('width')!).toBeGreaterThanOrEqual(20)
    expect(+hit.getAttribute('height')!).toBeGreaterThanOrEqual(24)
    expect([...g.querySelectorAll('line')].some((l) => +l.getAttribute('stroke-width')! >= 12)).toBe(true)
  })
})

describe('the table does not move when a decision is made', () => {
  const chipsOf = () => [...document.querySelectorAll<HTMLElement>('td .pill.fixedchip')]

  it('every resolution chip has the width of the longest label, from the data', () => {
    mount()
    const longest = Math.max(TO_REVIEW_LABEL.length, ...Object.values(RES_LABEL).map((l) => l.length))
    expect(RES_CHIP_CH).toBe(longest)
    const before = chipsOf().map((c) => c.style.getPropertyValue('--ch'))
    expect(before.length).toBe(10)
    expect(new Set(before)).toEqual(new Set([String(longest)]))
    rtlAct(() => { decideNote(10, 'waive') })
    rtlAct(() => { decideNote(9, 'defer') })
    expect(chipsOf().map((c) => c.style.getPropertyValue('--ch'))).toEqual(before)
    expect(chipsOf().every((c) => c.className.includes('fixedchip'))).toBe(true)
  })

  it('type chips and the counts on the filter chips keep their size too', () => {
    mount()
    const types = [...document.querySelectorAll<HTMLElement>('td .type')]
    expect(new Set(types.map((t) => t.style.getPropertyValue('--ch')))).toEqual(new Set([String(TYPE_CHIP_CH)]))
    expect(TYPE_CHIP_CH).toBe(Math.max(...FINDING_TYPES.map((t) => t.length)))
    const cn = [...document.querySelectorAll<HTMLElement>('.filters .chip .cn')]
    expect(cn.length).toBe(5)
    expect(new Set(cn.map((c) => c.style.getPropertyValue('--cn')))).toEqual(new Set(['2ch']))
    const label = (f: string) => document.querySelector(`.filters [data-f="${f}"]`)!.textContent
    expect(label('open')).toBe('To review 5')
    const open = getState().data.proofNotes.find((n) => n.chapterId === '5' && !n.res)!
    rtlAct(() => { decideNote(open.id, 'waive') })
    expect(label('open')).toBe('To review 4')
    expect(label('all')).toBe('All 10')
  })

  it('the Inspector does not list the decisions so far, but the history is kept', () => {
    mount()
    expect(note(1).history.length).toBeGreaterThan(0)
    expect(screen.queryByText('Decisions so far')).toBeNull()
    expect(document.getElementById('phistory')).toBeNull()
    rtlAct(() => { decideNote(1, 'waive') })
    expect(screen.queryByText('Decisions so far')).toBeNull()
    expect(note(1).history.at(-1)!.res).toBe('waive')
  })
})

describe('the Proof footer and keys', () => {
  it('hints: notes, chapter on left and right, no decision arrows, no Alt', () => {
    mount()
    const foot = document.querySelector('.keyfoot')!
    expect(foot.textContent).toContain('Chapter')
    expect(foot.textContent).not.toContain('Decision')
    expect(foot.querySelector('kbd[data-key="ArrowLeft"]')).not.toBeNull()
    expect(within(foot as HTMLElement).queryByText('Alt')).toBeNull()
    const hint = [...foot.querySelectorAll('.bkey')].find((h) => h.textContent!.includes('Chapter'))!
    expect([...hint.querySelectorAll('kbd')].map((k) => k.getAttribute('data-key'))).toEqual(['ArrowLeft', 'ArrowRight'])
  })

  it('the chapter bar tooltips name the arrow keys on Proof', () => {
    mount()
    expect(document.querySelector('.chapbar .ibtn[data-tip^="Previous chapter"]')!.getAttribute('data-tip')).toBe('Previous chapter (←)')
    expect(document.querySelector('.chapbar .ibtn[data-tip^="Next chapter"]')!.getAttribute('data-tip')).toBe('Next chapter (→)')
  })

  it('Alt with the arrows is not a chapter step on Proof any more', () => {
    mount()
    const e = new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true })
    rtlAct(() => { document.dispatchEvent(e) })
    expect(getState().ui.chapter).toBe('5')
    expect(keyHandlersFor('proof').length).toBeGreaterThan(0)
    update(() => {})
  })
})
