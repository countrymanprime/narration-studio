import { act as rtlAct, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHECK_STEP_MS } from '@/config/estimates'
import { createMockRecordingCheck, recordingCheck, setRecordingCheckProvider } from '@/providers/recordingcheck'
import { checkCard, checkSentence, fmtBasis } from '@/selectors/checkcard'
import { heardMarkup, spotOf, takeCounts } from '@/selectors/proofTakes'
import { acceptFinding, cancelRecordingCheck, ignoreFinding, runRecordingCheck } from '@/state/commands/checkcard'
import { projectBasis } from '@/state/commands/pickups'
import { playTakeRaw } from '@/state/commands/proofTakes'
import { createInitialState, getState, resetState, undoLast, update } from '@/state/store'
import { OverlayHost } from '@/ui/OverlayHost'
import { closePop, closeTopModal, dismissToast, getOverlay } from '@/ui/overlay'
import ProofPage from '@/pages/Proof'
import '@/pages'

const mount = () => render(<><OverlayHost /><ProofPage /></>)
const setup = (chapter = '5', sel: number | null = 2) => {
  const s = createInitialState({ prefs: undefined })
  s.ui.page = 'proof'
  s.ui.proof = { ...s.ui.proof, scope: 'chapter', winFilter: false, sel, winFor: null }
  s.ui.chapter = chapter
  resetState(s)
}
const data = () => getState().data
const note = (id: number) => data().proofNotes.find((n) => n.id === id)!
const click = (sel: string) => rtlAct(() => { fireEvent.click(document.querySelector(sel)!) })
const card = (id = '5') => checkCard(data(), id, projectBasis(), getState().ui.proof.checkRun)

beforeEach(() => { vi.useRealTimers(); setRecordingCheckProvider(createMockRecordingCheck()); setup() })
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  cancelRecordingCheck()
  setRecordingCheckProvider(createMockRecordingCheck())
  while (getOverlay().modals.length) closeTopModal()
  closePop()
  getOverlay().toasts.forEach((t) => dismissToast(t.id))
})

describe('takes at a flagged spot', () => {
  it('lists the several takes at a note\'s spot in time order, with the one that plays', () => {
    const s = spotOf(data(), note(2))!
    expect(s.takes.map((t) => [t.label, t.id, t.active, t.kept])).toEqual([['Take 1', 'T05-1', false, false], ['Take 2', 'T05-2', false, false], ['Take 3', 'T05-3', true, false]])
  })
  it('a one-take spot (or no passage) has none', () => {
    expect(spotOf(data(), note(1))).toBeNull()
    expect(spotOf(data(), note(9))).toBeNull()
  })
  it('counts takes per note, only for notes whose spot has several', () => {
    const m = takeCounts(data(), data().proofNotes)
    expect([...m]).toEqual([[2, 3], [3, 3], [6, 4], [7, 4], [10, 3]])
  })
  it('shows what the kept take heard against the script, struck through where it differs', () => {
    expect(heardMarkup('a b c', 'a c d')).toBe('a <del>b</del> c <ins>d</ins>')
  })
  it('puts an N takes badge after the text of notes with several takes, and nothing on the others', () => {
    mount()
    expect(document.querySelector('tr[data-r="2"] .tkb')).toHaveTextContent('3 takes')
    expect(document.querySelector('tr[data-r="6"] .tkb')).toHaveTextContent('4 takes')
    expect(document.querySelector('tr[data-r="1"] .tkb')).toBeNull()
    expect(document.querySelectorAll('.tkb').length).toBe(5)
  })
  it('draws the other takes as lanes under the waveform and the active one as a band on it', () => {
    mount()
    const lanes = document.querySelector('.tlanes')!
    expect(lanes).toHaveAttribute('data-lanes', '2')
    expect([...lanes.querySelectorAll('[data-lane]')].map((g) => g.getAttribute('data-lane'))).toEqual(['T05-1', 'T05-2'])
    expect(document.querySelector('#wave [data-band="T05-3"]')).not.toBeNull()
  })
  it('draws no lanes and no section at a one-take spot', () => {
    setup('5', 1)
    mount()
    expect(document.querySelector('.tlanes')).toBeNull()
    expect(document.querySelector('[data-spot]')).toBeNull()
    expect(screen.queryByText(/Takes at this spot/)).toBeNull()
    expect(document.querySelector('#toediting')).toBeNull()
  })
  it('the inspector lists the takes with play buttons, the heard text, and the kept one marked', () => {
    update((d) => { const p = d.data.passages.find((x) => x.id === 'ps5-5')!; p.kept = true; p.takes.forEach((t) => { t.active = t.id === 'T05-2' }) })
    mount()
    expect(screen.getByText('Takes at this spot · 3')).toBeInTheDocument()
    const rows = [...document.querySelectorAll('[data-take]')]
    expect(rows.map((r) => r.getAttribute('data-take'))).toEqual(['T05-1', 'T05-2', 'T05-3'])
    expect(within(rows[1] as HTMLElement).getByText('Kept')).toBeInTheDocument()
    expect(rows[1].querySelector('del')).not.toBeNull()
    expect(within(rows[0] as HTMLElement).queryByText('Kept')).toBeNull()
    expect(rows[0].querySelector('[data-tplay]')).toHaveAccessibleName('Play Take 1 (raw audio)')
  })
  it('is read-mostly: no keep, delete or rank, and a link to Editing', () => {
    mount()
    const section = document.querySelector('[data-spot]')!
    expect(section.querySelectorAll('button').length).toBe(3)
    expect(document.querySelector('[data-tkeep]')).toBeNull()
    expect(screen.queryByText(/Keep|Delete|Remove|Best/i, { selector: '[data-spot] *' })).toBeNull()
    click('#toediting')
    expect(getState().ui.page).toBe('editing')
    expect(getState().ui.editing.passage).toBe('ps5-5')
  })
  it('plays a take raw and a second press stops it', () => {
    vi.useFakeTimers()
    playTakeRaw('T05-2')
    expect(getState().ui.proof.takePlay).toBe('T05-2')
    playTakeRaw('T05-2')
    expect(getState().ui.proof.takePlay).toBeNull()
    playTakeRaw('T05-1')
    vi.advanceTimersByTime(6000)
    expect(getState().ui.proof.takePlay).toBeNull()
  })
})

describe('recording check card', () => {
  it('has four states from the stored check: not checked, checking, current, out of date', () => {
    expect(card('7').state).toBe('none')
    expect(card('3').state).toBe('current')
    expect(card('5').state).toBe('stale')
    update((d) => { d.ui.proof.checkRun = { chapterId: '7', pct: 40 } })
    expect(card('7').state).toBe('checking')
  })
  it('gives the recorded length against the script estimate at the standard rate', () => {
    const c = card('5')
    expect(c.recorded).toBe(760)
    expect(c.estimate).toBe(841)
    expect(card('7').recorded).toBe(Math.round(760 * 0.41))
  })
  it('counts the findings by category from the provider, and nothing while there is no result', () => {
    expect(card('5').counts).toMatchObject({ misread: 4, skipped: 2, repeated: 1, extra: 1, noise: 1, breath: 2, click: 1 })
    expect(card('5').differences).toBe(12)
    expect(card('7').counts).toBeNull()
    expect(checkSentence(12)).toBe('Checked against the script: 12 differences found')
    expect(checkSentence(0)).toBe('Checked against the script: no differences found')
  })
  it('says what the check is as of, and why it is out of date', () => {
    expect(fmtBasis('2026-09-26T08:40')).toBe('Sep 26, 8:40 am')
    expect(fmtBasis('2026-09-25T17:05')).toBe('Sep 25, 5:05 pm')
    expect(card('5').asOf).toBe('Sep 26, 8:40 am')
    expect(card('5').staleWhy).toBe('recording')
    update((d) => { d.data.paragraphs.find((p) => p.chapterId === '3')!.text += ' More.' })
    expect(card('3').staleWhy).toBe('text')
  })
  it('renders each state', () => {
    mount()
    const root = () => document.querySelector('.ccard')!
    expect(root()).toHaveAttribute('data-check-state', 'stale')
    expect(root().querySelector('[data-stale]')).toHaveTextContent('Recording changed since this check: check again')
    expect(root().querySelector('#cc-check')).toHaveClass('primary')
    expect(root().querySelector('[data-cat="misread"]')).toHaveTextContent('4')
    expect(root().querySelector('#cc-findings')).toBeNull()
    cleanup()
    setup('7', null)
    mount()
    expect(root()).toHaveAttribute('data-check-state', 'none')
    expect(root()).toHaveTextContent('Not checked yet')
    expect(root().querySelector('[data-cat="misread"]')).toHaveTextContent('—')
    cleanup()
    setup('3', null)
    mount()
    expect(root()).toHaveAttribute('data-check-state', 'current')
    expect(root().querySelector('#cc-check')).not.toHaveClass('primary')
    expect(root().querySelector('[data-cc-sentence]')).toHaveTextContent('3 differences found')
    expect(root().querySelector('[data-cc-asof]')).toHaveTextContent('As of last save')
  })
  it('only appears in the single-chapter view', () => {
    update((d) => { d.ui.proof.scope = 'all' })
    mount()
    expect(document.querySelector('.ccard')).toBeNull()
  })
  it('Check recordings runs with a progress and stores the result, current as of the last save', () => {
    vi.useFakeTimers()
    setup('7', null)
    mount()
    click('#cc-check')
    expect(document.querySelector('.ccard')).toHaveAttribute('data-check-state', 'checking')
    expect(document.querySelector('#cc-cancel')).not.toBeNull()
    rtlAct(() => { vi.advanceTimersByTime(CHECK_STEP_MS) })
    expect(document.querySelector('[role="progressbar"]')).toHaveAttribute('aria-valuenow', '20')
    rtlAct(() => { vi.advanceTimersByTime(CHECK_STEP_MS * 10) })
    expect(document.querySelector('.ccard')).toHaveAttribute('data-check-state', 'current')
    expect(data().checks.find((k) => k.chapterId === '7')).toMatchObject({ basis: projectBasis() })
    expect(getState().ui.proof.checkRun).toBeNull()
  })
  it('Cancel stops the check and stores nothing', () => {
    vi.useFakeTimers()
    setup('7', null)
    runRecordingCheck('7')
    rtlAct(() => { vi.advanceTimersByTime(CHECK_STEP_MS * 2) })
    cancelRecordingCheck()
    rtlAct(() => { vi.advanceTimersByTime(CHECK_STEP_MS * 10) })
    expect(getState().ui.proof.checkRun).toBeNull()
    expect(data().checks.some((k) => k.chapterId === '7')).toBe(false)
  })
  it('a check goes out of date when the recording changes, the same way Production sees it', () => {
    setup('3', null)
    expect(card('3').state).toBe('current')
    update((d) => { d.data.chapters.find((c) => c.id === '3')!.rec = 80 })
    expect(card('3').state).toBe('stale')
  })
})

describe('check findings', () => {
  beforeEach(() => { setup('3', null); update((d) => { d.ui.proof.findingsOpen = true }) })
  const first = () => recordingCheck().findings('3')[0]
  it('lists the findings as suggestions with their category and the decision each would start with', () => {
    mount()
    const rows = [...document.querySelectorAll('[data-finding]')]
    expect(rows.length).toBe(3)
    expect(rows[0]).toHaveTextContent('Needs pickup')
    expect(rows[2]).toHaveTextContent('Fix in edit')
    expect(screen.getByText('Check findings · 3')).toBeInTheDocument()
  })
  it('Accept makes an ordinary note with the suggested decision already chosen, in one undo step', () => {
    const n = data().proofNotes.length
    expect(acceptFinding(first().id)).toBe(true)
    const made = data().proofNotes.at(-1)!
    expect(data().proofNotes.length).toBe(n + 1)
    expect(made).toMatchObject({ chapterId: '3', ty: 'misread', res: 'pickup', from: 'Speech check', sec: 131 })
    expect(made.history).toHaveLength(1)
    expect(data().findingReviews).toEqual([{ id: first().id, chapterId: '3', status: 'accepted', noteId: made.id }])
    expect(acceptFinding(first().id)).toBe(false)
    rtlAct(() => { undoLast() })
    expect(data().proofNotes.length).toBe(n)
    expect(data().findingReviews).toEqual([])
  })
  it('an audio finding starts as Fix in edit', () => {
    acceptFinding(recordingCheck().findings('3')[2].id)
    expect(data().proofNotes.at(-1)).toMatchObject({ ty: 'noise', res: 'edit', from: 'Audio check', conf: null })
    expect(data().proofNotes.at(-1)!.confReason).toBeTruthy()
  })
  it('Ignore makes no note and keeps the finding as ignored', () => {
    const n = data().proofNotes.length
    expect(ignoreFinding(first().id)).toBe(true)
    expect(data().proofNotes.length).toBe(n)
    expect(card('3').tally).toEqual({ todo: 2, accepted: 0, ignored: 1 })
    expect(ignoreFinding(first().id)).toBe(false)
  })
  it('the list buttons do the same, and decided findings move to their own list', () => {
    mount()
    click('[data-accept="' + first().id + '"]')
    expect(document.querySelectorAll('[data-finding]').length).toBe(2)
    click('[data-ff="accepted"]')
    expect([...document.querySelectorAll('[data-finding]')].map((r) => r.getAttribute('data-status'))).toEqual(['accepted'])
    expect(document.querySelector('[data-ff="accepted"]')).toHaveTextContent('Accepted 1')
  })
  it('the accepted note appears in the notes list like any other', () => {
    mount()
    click('[data-accept="' + first().id + '"]')
    expect(document.querySelectorAll('.queue tbody tr[data-r]').length).toBe(1)
  })
  it('the check never decides: nothing is accepted by running it', () => {
    expect(data().findingReviews).toEqual([])
    expect(data().proofNotes.filter((n) => n.chapterId === '3').length).toBe(0)
  })
  it('shows no findings while the check is out of date', () => {
    setup('5', null)
    update((d) => { d.ui.proof.findingsOpen = true })
    mount()
    expect(document.querySelector('[data-findings]')).toBeNull()
  })
})
