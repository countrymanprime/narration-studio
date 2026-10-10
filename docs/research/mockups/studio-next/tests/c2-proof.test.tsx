import { act as rtlAct, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chooseOption } from './helpers/select'
import { evidenceKey, isCleared, isOpenNote, noteProgress, sortNotes, sourcesOf, visibleRows } from '@/selectors/proof'
import { vals } from '@/selectors/progress'
import { acceptEvidence, decideNote, recheckNotes, reopenNote, viewOf } from '@/state/commands/proof'
import { togglePickupDone, removePickup } from '@/state/commands/pickups'
import { daw } from '@/state/daw'
import { createInitialState, getState, resetState, undoLast, update } from '@/state/store'
import { OverlayHost } from '@/ui/OverlayHost'
import { closePop, closeTopModal, dismissToast, getOverlay } from '@/ui/overlay'
import ProofPage from '@/pages/Proof'
import ProductionPage from '@/pages/Production'
import '@/pages'

const mount = (page: 'proof' | 'production' = 'proof') => render(<><OverlayHost />{page === 'proof' ? <ProofPage /> : <ProductionPage />}</>)
const setup = (ui: (u: ReturnType<typeof getState>['ui']) => void = () => {}, mock: Partial<ReturnType<typeof getState>['mock']> = {}) => {
  const s = createInitialState({ prefs: undefined })
  s.ui.page = 'proof'
  s.ui.proof = { ...s.ui.proof, scope: 'chapter', winFilter: false }
  s.ui.chapter = '5'
  s.mock = { ...s.mock, ...mock }
  ui(s.ui)
  resetState(s)
}
const note = (id: number) => getState().data.proofNotes.find((n) => n.id === id)!
const click = (sel: string) => rtlAct(() => { fireEvent.click(document.querySelector(sel)!) })
const toasts = () => getOverlay().toasts.map((t) => t.msg)

beforeEach(() => setup())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  while (getOverlay().modals.length) closeTopModal()
  closePop()
  getOverlay().toasts.forEach((t) => dismissToast(t.id))
})

describe('decided and cleared', () => {
  it('a note is open until fixed, waived or dismissed: deferred, fix-in-edit and a pickup not redone are all open', () => {
    const b = getState().data
    const n = (res: typeof b.proofNotes[0]['res']) => ({ ...note(3), res })
    expect(isCleared(b, n('waive'))).toBe(true)
    expect(isCleared(b, n('fixed'))).toBe(true)
    expect(isCleared(b, n('keep'))).toBe(true)
    for (const r of ['defer', 'edit', 'pickup', null] as const) expect(isOpenNote(b, n(r))).toBe(true)
  })

  it('a pickup note clears once the pickup is recorded, or removed from the list', () => {
    expect(isCleared(getState().data, note(1))).toBe(false)
    rtlAct(() => togglePickupDone('p1'))
    expect(isCleared(getState().data, note(1))).toBe(true)
    rtlAct(() => removePickup('p2', false))
    expect(isCleared(getState().data, note(2))).toBe(true)
    rtlAct(() => togglePickupDone('p1'))
    expect(isCleared(getState().data, note(1))).toBe(false)
  })

  it('two counters: decided counts any decision, cleared counts only what is closed', () => {
    const d = getState().data
    const mine = d.proofNotes.filter((x) => x.chapterId === '5')
    expect(noteProgress(d, mine)).toMatchObject({ total: 10, decided: 5, cleared: 1, pct: 10 })
    mount()
    expect(document.querySelector('[data-cleared]')!.textContent).toBe('1 of 10')
    expect(document.querySelector('[data-decided]')!.textContent).toContain('5 decided')
  })

  it('Proof % cannot read 100 while a pickup is open, even when every note is waived', () => {
    update((d) => { d.data.proofNotes.forEach((n) => { if (n.chapterId === '5') n.res = 'waive' }) })
    const c5 = getState().data.chapters.find((c) => c.id === '5')!
    expect(noteProgress(getState().data, getState().data.proofNotes.filter((n) => n.chapterId === '5')).pct).toBe(100)
    // The four pickups from this chapter's notes are no longer pickups once waived, but a speech pickup in the chapter is.
    update((d) => { d.data.pickups.push({ id: 'z1', chapterId: '5', pid: '5-2', t: '01:00.0', ty: 'skip', script: 'x', ctx: 'x', src: 'speech', conf: null }) })
    expect(vals(getState().data, c5).proof).toBe(99)
    // A chapter with no notes keeps its stored figure, but is held at 99 while pickups are open too.
    const c3 = getState().data.chapters.find((c) => c.id === '3')!
    expect(c3.proof).toBe(100)
    expect(vals(getState().data, c3).proof).toBe(99)
    update((d) => { d.data.pickDone.push('z1') })
    expect(vals(getState().data, c5).proof).toBe(100)
  })

  it('the chapter strip counts open notes, not undecided ones', () => {
    update((d) => { d.ui.proof.scope = 'all' })
    mount()
    expect(document.querySelector('[data-cs="5"]')!.getAttribute('aria-label')).toMatch(/9 open of 10/)
  })

  it('the Open filter keeps deferred notes in; To review does not', () => {
    update((d) => { d.data.proofNotes.find((n) => n.id === 3)!.res = 'defer' })
    const v = viewOf(getState().ui)
    const ids = (f: 'open' | 'unfixed') => visibleRows(getState().data, { ...v, filter: f }, true).map((n) => n.id)
    expect(ids('open')).not.toContain(3)
    expect(ids('unfixed')).toContain(3)
    expect(ids('unfixed')).not.toContain(8)
  })
})

describe('decision history', () => {
  it('every decision is a line that is added, never replaced; reopening is a line', () => {
    expect(note(1).history).toHaveLength(1)
    rtlAct(() => { decideNote(1, 'waive') })
    rtlAct(() => { decideNote(1, 'defer') })
    rtlAct(() => reopenNote(1))
    expect(note(1).history.map((h) => h.res)).toEqual(['pickup', 'waive', 'defer', null])
    expect(note(1).history.every((h) => h.evidence === note(1).evidence)).toBe(true)
    expect(note(1).history[1].at).toBe('2026-09-26')
  })

  it('the note typed with a decision goes into the history; the Inspector no longer lists the history', () => {
    mount()
    click('tr[data-r="3"]')
    const t = document.getElementById('pdnote') as HTMLTextAreaElement
    rtlAct(() => { fireEvent.change(t, { target: { value: 'Ask the author' } }) })
    click('[data-d="defer"]')
    expect(note(3).history.at(-1)).toMatchObject({ res: 'defer', note: 'Ask the author' })
    expect(getState().ui.proof.dnote[3]).toBeUndefined()
    click('tr[data-r="3"]')
    expect(document.getElementById('phistory')).toBeNull()
    expect(screen.queryByText('Decisions so far')).toBeNull()
  })

  it('deciding what is already decided adds no line; changing it does; reopening an open note adds none', () => {
    rtlAct(() => { decideNote(3, 'waive') })
    rtlAct(() => { decideNote(3, 'waive') })
    rtlAct(() => { decideNote(3, 'waive') })
    expect(note(3).history).toHaveLength(1)
    expect(getState().history.filter((h) => h.label.startsWith('Decision')).length).toBe(1)
    rtlAct(() => { decideNote(3, 'defer') })
    expect(note(3).history.map((h) => h.res)).toEqual(['waive', 'defer'])
    rtlAct(() => reopenNote(3))
    rtlAct(() => reopenNote(3))
    expect(note(3).history.map((h) => h.res)).toEqual(['waive', 'defer', null])
  })

  it('the same decision with a note typed with it is still a line (the note is not lost)', () => {
    rtlAct(() => { decideNote(3, 'waive') })
    rtlAct(() => { update((d) => { d.ui.proof.dnote[3] = 'Checked again' }) })
    rtlAct(() => { decideNote(3, 'waive') })
    expect(note(3).history.at(-1)).toMatchObject({ res: 'waive', note: 'Checked again' })
    expect(note(3).history).toHaveLength(2)
  })

  it('undo of a decision takes back that decision', () => {
    rtlAct(() => { decideNote(3, 'waive') })
    expect(note(3).history).toHaveLength(1)
    rtlAct(() => { undoLast() })
    expect(note(3).res).toBeNull()
    expect(note(3).history).toHaveLength(0)
  })
})

describe('the stale decision guard', () => {
  const open = (id: number) => { mount(); click(`tr[data-r="${id}"]`) }

  it('a re-check that changes the evidence refuses a decision made on the old one, shows what changed and keeps the typed note', () => {
    open(2)
    const before = note(2).evidence
    const oldHeard = note(2).heard
    rtlAct(() => { fireEvent.change(document.getElementById('pdnote')!, { target: { value: 'Still sounds skipped' } }) })
    let n = 0
    rtlAct(() => { n = recheckNotes(['5']) })
    expect(n).toBe(2)
    expect(note(2).evidence).not.toBe(before)
    expect(note(2).evidence).toBe(evidenceKey(note(2)))
    expect(document.getElementById('evchanged')).not.toBeNull()
    expect(document.querySelector('[data-was]')!.textContent).toContain('myself')
    expect(document.querySelectorAll('[data-was] del')).toHaveLength(1)
    expect(document.querySelectorAll('[data-now] del')).toHaveLength(2)
    rtlAct(() => { expect(decideNote(2, 'waive')).toBe(false) })
    expect(note(2).res).toBe('pickup')
    expect(note(2).history).toHaveLength(1)
    expect(toasts().join()).toMatch(/evidence for this note changed/)
    expect((document.getElementById('pdnote') as HTMLTextAreaElement).value).toBe('Still sounds skipped')
    expect(oldHeard).not.toBe(note(2).heard)
    // The narrator reads the new evidence, then decides on it: the typed note went along.
    click('#evaccept')
    expect(document.getElementById('evchanged')).toBeNull()
    rtlAct(() => { expect(decideNote(2, 'waive')).toBe(true) })
    expect(note(2).history.at(-1)).toMatchObject({ res: 'waive', note: 'Still sounds skipped', evidence: note(2).evidence })
  })

  it('the keyboard decisions and the arrows are refused the same way', () => {
    open(8)
    rtlAct(() => { recheckNotes(['5']) })
    click('[data-d="edit"]')
    expect(note(8).res).toBe('waive')
    rtlAct(() => acceptEvidence(8))
    click('[data-d="edit"]')
    expect(note(8).res).toBe('edit')
  })

  it('a re-check that hears the same thing changes nothing', () => {
    expect(recheckNotes(['5'])).toBe(2)
    expect(recheckNotes(['5'])).toBe(0)
    expect(recheckNotes(['3'])).toBe(0)
  })

  it('the Mock states panel button runs a re-check', () => {
    rtlAct(() => { recheckNotes() })
    expect(note(2).conf).toBe(0.71)
  })
})

describe('sort, sources and confidence', () => {
  it('sorts by confidence (surest first, no score last) or severity, keeping time order for ties', () => {
    const d = getState().data
    const rows = d.proofNotes.filter((n) => n.chapterId === '5')
    expect(sortNotes(d, rows, 'confidence').map((n) => n.id)).toEqual([6, 2, 10, 8, 1, 3, 4, 5, 7, 9])
    expect(sortNotes(d, rows, 'severity').map((n) => n.id)).toEqual([1, 2, 8, 4, 6, 10, 3, 5, 7, 9])
    expect(sortNotes(d, rows, 'time')).toBe(rows)
  })

  it('the Sort control reorders the list', async () => {
    mount()
    await chooseOption(document.getElementById('psort')!, 'By confidence')
    expect([...document.querySelectorAll('tr[data-r]')].map((r) => +r.getAttribute('data-r')!).slice(0, 3)).toEqual([6, 2, 10])
  })

  it('a Sources line lists only the sources that have notes, with how many', () => {
    expect(sourcesOf(getState().data.proofNotes)).toEqual([
      { source: 'AI', n: 5 }, { source: 'Proofer', n: 3 }, { source: 'Bible check', n: 1 }, { source: 'Proofer + AI', n: 1 },
    ])
    mount()
    expect(document.getElementById('psources')!.textContent).toBe('Sources: AI 5 · Proofer 3 · Bible check 1 · Proofer + AI 1')
  })

  it('confidence is shown when there is one, and the reason when there is none', () => {
    mount()
    click('tr[data-r="2"]')
    expect(document.getElementById('pconf')!.textContent).toBe('Confidence 0.97')
    click('tr[data-r="3"]')
    expect(document.getElementById('pconf')!.textContent).toBe('No confidence: A proofer’s note carries no score.')
    expect(document.querySelector('tr[data-r="2"] td.sub')!.textContent).toBe('AI · 0.97')
  })
})

describe('Add marker', () => {
  it('goes through the DAW with a label that starts with the kind, and a refusal shows the DAW\'s own reason', () => {
    mount()
    click('tr[data-r="2"]')
    click('#marker')
    expect(daw().markers().at(-1)!.label).toMatch(/^SKIP: /)
    expect(toasts()).toContain('Marker added in REAPER')
    expect(getState().history.at(-1)).toMatchObject({ label: 'Added a marker in REAPER', daw: true })
    cleanup()
    setup(() => {}, { setup: 'builtin' })
    mount()
    click('tr[data-r="2"]')
    expect(document.getElementById('marker')).toBeDisabled()
    expect(document.getElementById('marker')!.getAttribute('data-tip')).toBe('Add marker in The built-in recorder')
  })

  it('names the DAW it adds to', () => {
    setup(() => {}, { setup: 'audacity' })
    mount()
    click('tr[data-r="1"]')
    expect(document.getElementById('marker')!.getAttribute('data-tip')).toBe('Add marker in Audacity')
    click('#marker')
    expect(daw().markers().at(-1)!.label).toMatch(/^MISREAD: /)
    expect(toasts()).toContain('Marker added in Audacity')
  })
})

describe('DAW-neutral wording on Proof, Editing and Production', () => {
  it('Proof disables the check while the DAW is away, by capability', () => {
    setup(() => {}, { setup: 'reaper-off' })
    mount()
    expect(document.getElementById('chk')).toBeDisabled()
  })

  it('Production names the DAW in its banner and its next steps', () => {
    setup(() => { /* page is set below */ }, { setup: 'reaper-off' })
    update((d) => { d.ui.page = 'production' })
    mount('production')
    expect(screen.getAllByText('REAPER is not running.').length).toBeGreaterThan(0)
    expect(document.getElementById('sess')).toBeDisabled()
    click('#retry')
    expect(toasts()).toContain('Still not running. Start REAPER and try again.')
    cleanup()
    rtlAct(() => { getOverlay().toasts.forEach((t) => dismissToast(t.id)) })
    setup(() => {}, { setup: 'audacity' })
    mount('production')
    expect(document.querySelector('.banner')).toBeNull()
    expect(within(document.body).queryAllByText(/REAPER/)).toHaveLength(0)
  })
})
