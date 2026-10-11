import { act as rtlAct, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockMeasurements, setMeasurementProvider, measurements } from '@/providers/measurements'
import { basisOf, ownRate, targetHours, wphOf } from '@/selectors/pace'
import { calc } from '@/selectors/progress'
import {
  confirmedMoves, currentStage, decisionText, keyOfValues, stageItems, stageReadiness, unstamped, VERDICT_LABEL,
} from '@/selectors/readiness'
import { confirmStage, dismissStage, revertStage, stampSuggestions } from '@/state/commands/readiness'
import { setRateBasis } from '@/state/commands/production'
import {
  REPORT_SECTIONS, buildReport, defaultInclude, reportBodyHtml, reportFileName, reportHtml, reportJson, reportPath, reportSections, summaryLine,
} from '@/selectors/report'
import { exportStatusReport } from '@/state/commands/report'
import { createInitialState, getState, resetState, undoLast, update } from '@/state/store'
import { OverlayHost } from '@/ui/OverlayHost'
import { closePop, closeTopModal, dismissToast, getOverlay } from '@/ui/overlay'
import ProductionPage from '@/pages/Production'
import '@/pages'

const mount = () => render(<><OverlayHost /><ProductionPage /></>)
const setup = (mock: Partial<ReturnType<typeof getState>['mock']> = {}) => {
  const s = createInitialState({ prefs: undefined })
  s.mock = { ...s.mock, ...mock }
  resetState(s)
}
const data = () => getState().data
const chapter = (id: string) => data().chapters.find((c) => c.id === id)!
const click = (sel: string) => rtlAct(() => { fireEvent.click(document.querySelector(sel)!) })

const defaultMeasurements = measurements()
beforeEach(() => { setMeasurementProvider(defaultMeasurements); setup() })
afterEach(() => {
  cleanup()
  setMeasurementProvider(defaultMeasurements)
  while (getOverlay().modals.length) closeTopModal()
  closePop()
  getOverlay().toasts.forEach((t) => dismissToast(t.id))
  vi.useRealTimers()
})

describe('finished-hour target', () => {
  it('the own rate is worked out from the chapters that have a measured length', () => {
    const r = ownRate(data())
    expect(r.ok && r.value).toMatchObject({ wph: 11095, words: 6851, seconds: 2223, chapters: ['1', '2', '4'] })
  })
  it('gives a dash with the reason when nothing is measured', () => {
    setup({ measurements: 'none' })
    const r = ownRate(data())
    expect(r.ok).toBe(false)
    expect(targetHours(data()).own).toBeNull()
    expect(basisOf(data())).toBe('standard')
  })
  it('needs a few chapters before it says anything', () => {
    setMeasurementProvider(createMockMeasurements(undefined, undefined, undefined, { '1': 685, '2': 670 }))
    const r = ownRate(data())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('Needs 3')
  })
  it('gives the target both ways, and the schedule follows the chosen basis', () => {
    const t = targetHours(data())
    expect(t.standard).toBeCloseTo(29222 / 9300, 5)
    expect(t.own).toBeCloseTo(29222 / 11095, 3)
    expect(calc(data()).wph).toBe(9300)
    rtlAct(() => setRateBasis('own'))
    expect(basisOf(data())).toBe('own')
    expect(wphOf(data())).toBe(11095)
    expect(calc(data()).fh).toBeCloseTo(29222 / 11095, 3)
  })
  it('falls back to the standard when your pace was chosen and then is not measured', () => {
    rtlAct(() => setRateBasis('own'))
    setup({ measurements: 'none' })
    update((d) => { d.data.rateBasis = 'own' })
    expect(basisOf(data())).toBe('standard')
  })
  it('has an info icon button beside the estimate that opens a popover with both rates, targets, basis and breakdown', () => {
    mount()
    expect(document.querySelectorAll('.kpis > *').length).toBe(6)
    click('#target-info')
    const pop = screen.getByRole('dialog', { name: 'Finished-hour target' })
    expect(within(pop).getByText('9,300')).toBeInTheDocument()
    expect(within(pop).getByText('11,095')).toBeInTheDocument()
    expect(pop.querySelector('[data-ti-target="standard"]')).toHaveTextContent('3:09')
    expect(pop.querySelector('[data-ti-target="own"]')).toHaveTextContent('2:38')
    expect(pop.querySelector('[data-ti-breakdown]')).toHaveTextContent('6,851 words in 37:03')
    expect(within(pop).getByRole('button', { name: 'Standard' })).toHaveAttribute('aria-pressed', 'true')
  })
  it('shows a dash and the reason in the popover when nothing is measured', () => {
    setup({ measurements: 'none' })
    mount()
    click('#target-info')
    const pop = screen.getByRole('dialog', { name: 'Finished-hour target' })
    expect(pop.querySelector('[data-ti-rate="own"]')).toHaveTextContent('—')
    expect(pop.querySelector('[data-ti-breakdown]')).toHaveTextContent('not measured yet')
    expect(within(pop).queryByRole('button', { name: 'Your pace' })).toBeNull()
  })
  it('choosing your pace in the popover moves the schedule to it', () => {
    mount()
    click('#target-info')
    rtlAct(() => { fireEvent.click(screen.getByRole('button', { name: 'Your pace' })) })
    expect(data().rateBasis).toBe('own')
    expect(document.querySelector('[data-act="script"] .v')).toHaveTextContent('/ 2:38')
  })
})

describe('stage readiness: evidence and verdicts', () => {
  const verdict = (id: string) => stageReadiness(data(), chapter(id)).verdict
  it('derives each chapter from its data', () => {
    expect(verdict('2')).toBe('ready')
    expect(verdict('4')).toBe('notready')
    expect(verdict('7')).toBe('progress')
    expect(verdict('10')).toBe('notchecked')
    expect(stageReadiness(data(), chapter('4')).stage).toBe('master')
    expect(stageReadiness(data(), chapter('7')).stage).toBe('record')
  })
  it('the evidence is only what the app can measure, and the master check lists its limits', () => {
    const ids = stageItems(data(), chapter('2'), 'master').map((i) => i.id)
    expect(ids).toEqual(['mc', 'rms', 'peak', 'nf', 'tone', 'clicks', 'pickups'])
    const mc = stageItems(data(), chapter('2'), 'master')[0]
    expect(mc).toMatchObject({ value: 'PASS', note: '5 of 5 limits met' })
  })
  it('a chapter whose evidence changed since the suggestion reads Evidence changed', () => {
    const r = stageReadiness(data(), chapter('3'))
    expect(r.stage).toBe('pickups')
    expect(r.verdict).toBe('changed')
    expect(r.changes.map((c) => [c.id, c.was, c.now])).toEqual([['pickups', '0', '3']])
  })
  it('the same evidence gives the same key; other evidence another', () => {
    expect(keyOfValues('proof', { a: '1' })).toBe(keyOfValues('proof', { a: '1' }))
    expect(keyOfValues('proof', { a: '1' })).not.toBe(keyOfValues('proof', { a: '2' }))
  })
  it('every verdict has words for its tooltip', () => {
    expect(Object.values(VERDICT_LABEL)).toEqual(['Ready', 'Not ready', 'Not checked', 'In progress', 'Evidence changed', 'Confirmed'])
  })
  it('the app stamps a suggestion for a ready chapter; stamping decides nothing', () => {
    expect(unstamped(data())).toEqual(expect.arrayContaining(['2']))
    const before = data().stageDecisions.length
    rtlAct(() => stampSuggestions())
    expect(data().stageSuggestions.find((s) => s.chapterId === '2')).toMatchObject({ stage: 'master', at: '2026-09-26' })
    expect(unstamped(data())).toEqual([])
    expect(data().stageDecisions.length).toBe(before)
    expect(currentStage(data(), chapter('2'))).toBe('master')
  })
})

describe('stage readiness: decisions', () => {
  beforeEach(() => rtlAct(() => stampSuggestions()))
  const r = (id: string) => stageReadiness(data(), chapter(id))
  it('confirm records a move and adds a line; it is undoable', () => {
    const key = r('2').key
    const n = data().stageDecisions.length
    expect(confirmStage('2', key)).toBe(true)
    expect(data().stageDecisions.length).toBe(n + 1)
    expect(data().stageDecisions.at(-1)).toMatchObject({ chapterId: '2', kind: 'confirmed', from: 'master', to: 'delivery' })
    expect(r('2').verdict).toBe('confirmed')
    rtlAct(() => { undoLast() })
    expect(data().stageDecisions.length).toBe(n)
    expect(r('2').verdict).toBe('ready')
  })
  it('revert is a new line, never a removal', () => {
    confirmStage('2', r('2').key)
    const n = data().stageDecisions.length
    expect(revertStage('2')).toBe(true)
    expect(data().stageDecisions.length).toBe(n + 1)
    expect(data().stageDecisions.at(-1)).toMatchObject({ kind: 'reverted', from: 'delivery', to: 'master' })
    expect(r('2').stage).toBe('master')
    expect(decisionText(data().stageDecisions.at(-1)!)).toEqual({ kind: 'Reverted', text: 'Back to Master check' })
  })
  it('replays the sample history: a revert takes the last confirmed move off', () => {
    expect(confirmedMoves(data().stageDecisions.filter((d) => d.chapterId === '2')).map((m) => m.to)).toEqual(['proof', 'master'])
  })
  it('refuses a decision made on evidence that changed since it was read, and changes nothing', () => {
    const n = data().stageDecisions.length
    expect(confirmStage('2', 'rd-old')).toBe(false)
    expect(dismissStage('2', 'rd-old')).toBe(false)
    expect(data().stageDecisions.length).toBe(n)
    expect(getOverlay().toasts.at(-1)?.msg).toMatch(/evidence .* changed/i)
  })
  it('refuses to confirm what is not ready (evidence changed, not ready)', () => {
    const n = data().stageDecisions.length
    expect(confirmStage('3', r('3').key)).toBe(false)
    expect(confirmStage('4', r('4').key)).toBe(false)
    expect(data().stageDecisions.length).toBe(n)
  })
  it('dismissing a changed suggestion logs it and measures the next one against the evidence as it is now', () => {
    expect(dismissStage('3', r('3').key)).toBe(true)
    expect(data().stageDecisions.at(-1)).toMatchObject({ chapterId: '3', kind: 'dismissed' })
    expect(r('3').verdict).toBe('notready')
    rtlAct(() => { undoLast() })
    expect(r('3').verdict).toBe('changed')
  })
})

describe('stage readiness: the Production page', () => {
  beforeEach(() => rtlAct(() => stampSuggestions()))
  it('puts a chip with an accessible name on the cell of the stage a chapter is in', () => {
    mount()
    const chip = document.querySelector('[data-rchip="3"]') as HTMLElement
    expect(chip).toHaveAccessibleName('Stage readiness: Evidence changed, Pickups')
    expect(chip.closest('td')).toBe(document.querySelector('tr[data-chrow="3"]')!.children[6])
    expect(document.querySelector('[data-rchip="2"]')).toHaveAccessibleName('Stage readiness: Ready, Master check')
    expect(document.querySelector('[data-rchip="10"]')).toHaveAccessibleName('Stage readiness: Not checked, Prep')
    expect(document.querySelector('[data-rchip="7"]')).toHaveAccessibleName('Stage readiness: In progress, Record')
    expect(document.querySelector('[data-rchip="4"]')).toHaveAccessibleName('Stage readiness: Not ready, Master check')
  })
  it('the chip opens the slide-over; the cell still opens its page', () => {
    mount()
    click('[data-rchip="3"]')
    const panel = screen.getByRole('dialog', { name: 'Stage readiness' })
    expect(panel).toHaveClass('side')
    expect(within(panel).getByText('Ready to move to Master check')).toBeInTheDocument()
    expect(panel.querySelector('[data-changed]')).toHaveTextContent('Changed since Sep 25')
    expect(panel.querySelector('[data-changed]')).toHaveTextContent('was 0, now 3')
    expect(panel.querySelector('#rd-confirm')).toBeDisabled()
    expect(panel.querySelector('[data-history]')!.children.length).toBe(3)
    rtlAct(() => closeTopModal())
    click('tr[data-chrow="3"] button[data-cell="pickups"]')
    expect(getState().ui.page).toBe('pickups')
  })
  it('Confirm in the slide-over moves the chapter and turns the footer into Revert; the list only grows', () => {
    mount()
    click('[data-rchip="2"]')
    const panel = screen.getByRole('dialog', { name: 'Stage readiness' })
    expect(panel.querySelectorAll('[data-item]').length).toBe(7)
    click('#rd-confirm')
    expect(panel.querySelector('#rd-confirm')).toBeNull()
    expect(within(panel).getByText('Moved to Delivery')).toBeInTheDocument()
    expect(panel.querySelector('[data-history]')!.children.length).toBe(5)
    click('#rd-revert')
    expect(panel.querySelector('[data-history]')!.children.length).toBe(6)
    expect(panel.querySelector('#rd-confirm')).not.toBeNull()
  })
})

describe('status report', () => {
  const all = () => ({ ...defaultInclude(data()) })
  it('everything is on except the contracted amount and the rate', () => {
    const d = defaultInclude(data())
    expect(Object.entries(d).filter(([, v]) => v).map(([k]) => k)).toEqual(['chapters', 'words', 'schedule', 'pickups', 'delivery'])
    expect(reportSections(data()).map((s) => s.id)).toEqual(REPORT_SECTIONS.map((s) => s.id))
  })
  it('the money sections are absent when there is no per-hour rate', () => {
    update((x) => { x.data.contract = { payment: 'royalty', amount: 10 } })
    expect(reportSections(data()).map((s) => s.id)).not.toContain('amount')
    expect(reportSections(data()).map((s) => s.id)).not.toContain('rate')
    const doc = buildReport(data(), { ...all(), amount: true, rate: true })
    expect(doc.money).toBeUndefined()
  })
  it('is derived from the data: counts, stages, milestones, open items, delivery check', () => {
    const doc = buildReport(data(), all())
    expect(doc.summary).toMatchObject({ chapters: 12, words: 29222, due: '2026-10-14', daysLeft: 18 })
    expect(doc.chapters!.rows.length).toBe(14)
    expect(doc.chapters!.rows.find((r) => r.id === '3')).toMatchObject({ recorded: 100, openPickups: 3, mastered: false })
    expect(doc.milestones!.length).toBe(data().milestones.length)
    expect(doc.pickups).toContainEqual(expect.objectContaining({ open: 3 }))
    expect(doc.delivery).toMatchObject({ pass: 3, unchecked: 10 })
    expect(doc.money).toBeUndefined()
  })
  it('leaves out an unticked section entirely', () => {
    const doc = buildReport(data(), { ...all(), chapters: false, words: false, schedule: false, pickups: false, delivery: false })
    expect(doc.chapters).toBeUndefined()
    expect(doc.milestones).toBeUndefined()
    expect(doc.pickups).toBeUndefined()
    expect(doc.delivery).toBeUndefined()
    expect(doc.summary.words).toBeUndefined()
    const html = reportBodyHtml(doc)
    expect(html).not.toContain('Chapters and stages')
    expect(html).not.toContain('Milestones')
  })
  it('words and finished hours without the stages gives a words-only table', () => {
    const doc = buildReport(data(), { ...all(), chapters: false })
    expect(doc.chapters!.rows[0]).not.toHaveProperty('prep')
    expect(reportBodyHtml(doc)).not.toContain('<th>Prep</th>')
    expect(reportBodyHtml(doc)).toContain('<th class="n">Words</th>')
  })
  it('includes the money only when asked, from the contract', () => {
    const doc = buildReport(data(), { ...all(), amount: true, rate: true })
    expect(doc.money).toEqual({ contractedAmount: Math.round((250 * 29222 / 9300) * 100) / 100, ratePerFinishedHour: 250 })
    expect(reportBodyHtml(doc)).toContain('per finished hour')
    expect(reportBodyHtml(buildReport(data(), { ...all(), rate: true }))).not.toContain('Contracted amount')
  })
  it('builds the summary, the file name and the saved location', () => {
    const doc = buildReport(data(), all())
    expect(summaryLine(doc)).toBe('On track. 12 chapters, 29,222 words, 3:09 finished audio. 1:36 recorded (51%). Due Oct 14, 18 days left.')
    expect(reportFileName(data(), 'html')).toBe('alices-adventures-in-wonderland-status-2026-09-26.html')
    expect(reportPath(data(), 'json')).toBe('C:\\Audiobooks\\Alice\\reports\\alices-adventures-in-wonderland-status-2026-09-26.json')
  })
  it('the HTML is one page that escapes what it holds, and the JSON is the same facts', () => {
    update((x) => { x.data.projectName = 'A <b>&</b> B' })
    const doc = buildReport(data(), all())
    const html = reportHtml(doc)
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('A &lt;b&gt;&amp;&lt;/b&gt; B')
    expect(html).not.toContain('<b>&</b>')
    expect(JSON.parse(reportJson(doc))).toMatchObject({ title: 'A <b>&</b> B', summary: { words: 29222 } })
  })
  it('Export builds the report in memory, stores a record in the data and says the file name', () => {
    const out = exportStatusReport(all(), 'json')
    expect(JSON.parse(out.content).summary.chapters).toBe(12)
    expect(data().reports).toHaveLength(1)
    expect(data().reports[0]).toMatchObject({ file: out.file, format: 'json', at: '2026-09-26' })
    expect(getOverlay().toasts.at(-1)?.msg).toBe('Status report saved as ' + out.file + '.')
    rtlAct(() => { undoLast() })
    expect(data().reports).toHaveLength(0)
  })
  it('the dialog has the checkboxes, a format control, the save location and a live preview', () => {
    mount()
    click('#exp')
    const dlg = screen.getByRole('dialog', { name: 'Export status report' })
    expect(dlg.querySelectorAll('[data-section]').length).toBe(7)
    expect(dlg.querySelector('[data-section="amount"]')).toHaveAttribute('aria-checked', 'false')
    expect(dlg.querySelector('[data-section="chapters"]')).toHaveAttribute('aria-checked', 'true')
    expect(dlg.querySelector('[data-path]')).toHaveTextContent(/status-2026-09-26\.html$/)
    expect(dlg.querySelector('[data-preview]')).toHaveTextContent('Chapters and stages')
    fireEvent.click(dlg.querySelector('[data-section="chapters"]')!)
    expect(dlg.querySelector('[data-preview]')).not.toHaveTextContent('Mast.')
    rtlAct(() => { fireEvent.click(within(dlg).getByRole('button', { name: 'JSON' })) })
    expect(dlg.querySelector('[data-path]')).toHaveTextContent(/\.json$/)
    expect(dlg.querySelector('.rp-json')).toHaveTextContent('"title"')
    click('#rp-export')
    expect(data().reports.at(-1)).toMatchObject({ format: 'json', include: expect.objectContaining({ chapters: false }) })
  })
  it('the dialog does not offer the money rows without a per-hour rate', () => {
    update((x) => { x.data.contract = { payment: 'none', amount: null } })
    mount()
    click('#exp')
    const dlg = screen.getByRole('dialog', { name: 'Export status report' })
    expect(dlg.querySelector('[data-section="amount"]')).toBeNull()
    expect(dlg.querySelector('[data-section="rate"]')).toBeNull()
  })
})
