import { act as rtlAct, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chooseOption } from './helpers/select'
import { modals } from '@/app/modals'
import { PACE, PICKUP_HOURS, RATIO, WPH } from '@/config/estimates'
import { TAKE_LOG } from '@/fixtures/measurements'
import { PAYMENT_TYPES } from '@/fixtures/schedule'
import { hm } from '@/format/time'
import BoothPage from '@/pages/Booth'
import Pickups from '@/pages/Pickups'
import Production from '@/pages/Production'
import Schedule from '@/pages/Schedule'
import { createMockMeasurements, setMeasurementProvider } from '@/providers/measurements'
import { checkState, checkSummary, textKey } from '@/selectors/checks'
import { NOT_MEASURED, recordedSeries, roomToneLabel, sessionMinutes, weekFigures } from '@/selectors/measured'
import { nextUp } from '@/selectors/nextup'
import * as progress from '@/selectors/progress'
import { calc, contractValue, deadlineTone, isFinished, measOf, remainFor } from '@/selectors/progress'
import { detectPickups } from '@/state/commands/pickups'
import { setContractAmount, setPaymentType } from '@/state/commands/schedule'
import { createInitialState, getState, resetState, update } from '@/state/store'
import { initialPrefs } from '@/state/slices/ui'
import { OverlayHost } from '@/ui/OverlayHost'
import { closePop, closeTopModal, getOverlay } from '@/ui/overlay'
import '@/pages'

const upd = (fn: Parameters<typeof update>[0]): void => { rtlAct(() => update(fn)) }
const data = () => getState().data
const boot = (page: 'production' | 'schedule' | 'booth' | 'pickups' = 'production'): void => {
  const s = createInitialState({ prefs: initialPrefs })
  s.ui.page = page
  resetState(s)
  setMeasurementProvider(createMockMeasurements())
}
beforeEach(() => boot())
afterEach(() => {
  cleanup()
  while (getOverlay().modals.length) closeTopModal()
  closePop()
  setMeasurementProvider(createMockMeasurements())
})

describe('deadline tone', () => {
  const at = (days: number) => upd((d) => { const t = new Date(d.data.today + 'T00:00'); t.setDate(t.getDate() + days); d.data.due = t.toISOString().slice(0, 10) })
  // A calculation with nothing left to project, so only the days left speak.
  const quiet = () => ({ ...calc(data()), remain: 0, verdict: 'ok' as const, mw: 0, fail: 0 })

  it('is neutral beyond a week, a warning within a week, danger once past', () => {
    at(30); expect(deadlineTone(data(), quiet())).toBe('neutral')
    at(8); expect(deadlineTone(data(), quiet())).toBe('neutral')
    at(7); expect(deadlineTone(data(), quiet())).toBe('warn')
    at(0); expect(deadlineTone(data(), quiet())).toBe('warn')
    at(-1); expect(deadlineTone(data(), quiet())).toBe('danger')
  })

  it('is success when the book is finished, however close or past the date is', () => {
    at(-3)
    const k = { ...calc(data()), mw: calc(data()).W, fail: 0 }
    expect(isFinished(k)).toBe(true)
    expect(deadlineTone(data(), k)).toBe('success')
    expect(isFinished({ ...k, fail: 1 })).toBe(false)
    expect(isFinished(calc(data()))).toBe(false)
  })

  it('lets the projection only make it worse, and only when there is work to project', () => {
    at(30)
    expect(deadlineTone(data(), { ...quiet(), remain: 5, verdict: 'tight' })).toBe('warn')
    expect(deadlineTone(data(), { ...quiet(), remain: 5, verdict: 'behind' })).toBe('danger')
    expect(deadlineTone(data(), { ...quiet(), remain: 0, verdict: 'behind' })).toBe('neutral')
    at(3)
    expect(deadlineTone(data(), { ...quiet(), remain: 5, verdict: 'ok' })).toBe('warn')
  })

  it('colours the Due card and the days on Production', () => {
    render(<Production />)
    const due = () => document.querySelector('[data-act="schedule"] .v') as HTMLElement
    expect(due().className).toContain('tone-neutral')
    upd((d) => { d.data.due = '2026-10-04' })
    expect(due().className).toContain('tone-warn')
    upd((d) => { d.data.due = '2026-09-20' })
    expect(due().className).toContain('tone-danger')
    expect(document.querySelector('[data-vp]')!.className).toContain('bad')
  })

  it('shows a finished book as finished', () => {
    upd((d) => { d.data.masterRows = d.data.chapters.map((c) => ({ id: c.id, len: '1:00', rms: -20, peak: -3.5, nf: -64, head: 0.8, tail: 2, clicks: '0', text: '✓' })) })
    expect(isFinished(calc(data()))).toBe(true)
    render(<Production />)
    expect(document.querySelector('[data-vp]')!.textContent).toContain('Finished')
    expect(document.querySelector('[data-act="schedule"] .v')!.className).toContain('tone-success')
  })
})

describe('Next up ranking', () => {
  beforeEach(() => upd((d) => { d.data.chapters.find((c) => c.id === '8')!.flag = { text: 'Text changed', type: 'text' } }))
  const kinds = () => nextUp(data(), calc(data())).map((x) => x.kind)

  it('keeps ours: the work that costs the most hours leads', () => {
    expect(kinds()).toEqual(['rec', 'pick', 'fail', 'flags'])
    const items = nextUp(data(), calc(data()))
    expect(items[0].risk).toBeGreaterThan(items[1].risk)
    // A lot of pickups outweigh the recording left.
    upd((d) => { for (let i = 0; i < 20; i++) d.data.pickups.push({ id: 'z' + i, chapterId: '3', pid: '3-1', t: '00:01.0', ty: 'misread', script: 'x', ctx: 'x', src: 'you' }) })
    expect(kinds().slice(0, 2)).toEqual(['pick', 'rec'])
  })

  it('breaks ties by group (in progress and not ready first), then the least advanced stage', () => {
    const items = nextUp(data(), calc(data()))
    const zero = items.filter((x) => x.risk === 0)
    expect(zero.map((x) => x.kind)).toEqual(['fail', 'flags'])
    expect(zero[0].group).toBe(0)
    expect(zero[1].group).toBeGreaterThan(zero[0].group)
  })

  it('draws the items in that order', () => {
    render(<Production />)
    const titles = [...document.querySelectorAll('.side-next .next b')].map((b) => b.textContent ?? '')
    expect(titles[0]).toMatch(/^Finish recording/)
    expect(titles[1]).toMatch(/^Pickup session/)
    expect(titles[2]).toMatch(/fails/)
  })
})

describe('This week and the other placeholders', () => {
  it('This week is worked out from the take log through the provider', () => {
    const w = weekFigures(data())
    expect(w.week).toEqual({ ok: true, value: 2770 })
    expect(w.last24h).toEqual({ ok: true, value: 1500 })
    expect(w.target).toBeGreaterThan(0)
    render(<Production />)
    expect(document.querySelector('[data-week]')!.textContent).toContain(hm(2770 / 3600))
    expect(document.querySelector('[data-rest]')!.textContent).toBe(hm(1500 / 3600) + ' recorded')
  })

  it('shows what a different provider reports, not a fixed figure', () => {
    setMeasurementProvider(createMockMeasurements(undefined, [{ at: '2026-09-26T07:00', seconds: 600 }]))
    render(<Production />)
    expect(document.querySelector('[data-rest]')!.textContent).toBe('0:10 recorded')
  })

  it('says "not measured yet" when nothing has been measured', () => {
    upd((d) => { d.mock.measurements = 'none' })
    render(<Production />)
    expect(document.querySelector('[data-week]')!.textContent).toBe(NOT_MEASURED)
    expect(document.querySelector('[data-rest]')!.textContent).toBe(NOT_MEASURED)
    expect(document.querySelector('.side-week .prog')).toBeNull()
    expect(document.querySelector('[data-act="pickups"] .s')!.textContent).toBe(NOT_MEASURED)
  })

  it('draws the recorded line from the take log, and none without one', () => {
    const s = recordedSeries(data())
    expect(s.ok && s.value.at(-1)![1]).toBeCloseTo(5770 / 3600, 5)
    expect(s.ok && s.value.map((p) => p[1])).toEqual([...(s.ok ? s.value.map((p) => p[1]) : [])].sort((a, b) => a - b))
    const { container } = render(<Production />)
    expect(container.querySelector('.side-chart polyline')).not.toBeNull()
    upd((d) => { d.mock.measurements = 'none' })
    expect(container.querySelector('.side-chart polyline')).toBeNull()
    expect(container.querySelector('.side-chart')!.textContent).toContain('Recorded days ' + NOT_MEASURED)
  })

  it('room tone comes from the provider for the microphone in use', () => {
    expect(roomToneLabel('USB audio interface · Input 1')).toBe('Room −64.1 dB')
    expect(roomToneLabel('USB microphone')).not.toBe(roomToneLabel('USB audio interface · Input 1'))
    expect(roomToneLabel('no such mic')).toBe('Room ' + NOT_MEASURED)
  })

  it('the Booth footer chip shows the reading, and "not measured yet" when there is none', () => {
    boot('booth')
    render(<BoothPage />)
    const chip = () => document.querySelector('.lvl-inline .bchip2') as HTMLElement
    expect(chip().textContent).toBe('Room −64.1 dB')
    expect(chip().className).toContain('ok')
    upd((d) => { d.mock.measurements = 'none' })
    expect(chip().textContent).toBe('Room ' + NOT_MEASURED)
    expect(chip().className).not.toContain('ok')
    upd((d) => { d.mock.measurements = 'available'; d.ui.booth.mic = 'Built-in microphone' })
    expect(chip().textContent).toBe(roomToneLabel('Built-in microphone'))
  })

  it('booth time for pickups comes from the provider; unmeasured pickups take the measured average', () => {
    const one = sessionMinutes(['c3a'])
    expect(one.ok).toBe(true)
    expect(sessionMinutes([]).ok && (sessionMinutes([]) as { value: number }).value).toBe(0)
    const a = sessionMinutes(['c3a', 'c3b']), b = sessionMinutes(['c3a', 'unknown'])
    expect(a.ok && b.ok).toBe(true)
    setMeasurementProvider({ ...createMockMeasurements(), pickupSessionSeconds: () => ({ ok: true, value: 600 }) })
    expect(sessionMinutes(['c3a'])).toEqual({ ok: true, value: 10 })
  })

  it('Pickups shows the session time, and "not measured yet" without a source', () => {
    boot('pickups')
    render(<Pickups />)
    const about = () => screen.getByText('About').parentElement!.querySelector('b')!.textContent
    expect(about()).toMatch(/^\d+ min$/)
    upd((d) => { d.mock.measurements = 'none' })
    expect(about()).toBe(NOT_MEASURED)
  })

  it('the fixed inputs live in one config module', () => {
    expect(progress.WPH).toBe(WPH)
    expect(progress.RATIO).toBe(RATIO)
    expect(progress.PACE).toBe(PACE)
    expect(PICKUP_HOURS).toBeGreaterThan(0)
    const root = join(__dirname, '..', 'src')
    const files: string[] = []
    const walk = (d: string): void => readdirSync(d).forEach((f) => { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) && files.push(p) })
    walk(root)
    const stray = files.filter((f) => !f.includes('/fixtures/') && !f.includes('/config/') && /\b9300\b|\b0\.7 \+ 3|-64\.1|6:00 \/ 8:00|3:05 recorded/.test(readFileSync(f, 'utf8')))
    expect(stray).toEqual([])
  })
})

describe('Contract', () => {
  const mountSchedule = () => { boot('schedule'); return render(<><Schedule /><OverlayHost /></>) }

  it('offers the payment types from data', () => {
    expect(PAYMENT_TYPES.map((t) => t.id)).toEqual(['pfh', 'royalty', 'none'])
  })

  it('works a value out only from a per-finished-hour rate', () => {
    const fh = data().chapters.reduce((a, c) => a + c.words, 0) / WPH
    upd((d) => { d.data.contract = { payment: 'pfh', amount: 200 } })
    expect(contractValue(data())).toBeCloseTo(200 * fh, 6)
    upd((d) => { d.data.contract = { payment: 'pfh', amount: null } })
    expect(contractValue(data())).toBeNull()
    upd((d) => { d.data.contract = { payment: 'royalty', amount: 50 } })
    expect(contractValue(data())).toBeNull()
    upd((d) => { d.data.contract = { payment: 'none', amount: null } })
    expect(contractValue(data())).toBeNull()
  })

  it('edits the payment type and the amount on Schedule, next to the due date', async () => {
    mountSchedule()
    expect(document.getElementById('contract-value')).not.toBeNull()
    const amount = document.getElementById('contract-amount') as HTMLInputElement
    fireEvent.change(amount, { target: { value: '300' } })
    fireEvent.blur(amount)
    expect(data().contract).toEqual({ payment: 'pfh', amount: 300 })
    await chooseOption('#contract-type', 'Royalty share')
    expect(data().contract).toEqual({ payment: 'royalty', amount: null })
    expect(document.getElementById('contract-value')).toBeNull()
    const share = document.getElementById('contract-amount') as HTMLInputElement
    fireEvent.change(share, { target: { value: '40' } })
    fireEvent.blur(share)
    expect(data().contract.amount).toBe(40)
    expect(document.getElementById('contract-value')).toBeNull()
  })

  it('shows no amount and no value for none or unspecified (the no PFH rate case)', async () => {
    mountSchedule()
    await chooseOption('#contract-type', 'None or unspecified')
    expect(data().contract).toEqual({ payment: 'none', amount: null })
    expect(document.getElementById('contract-amount')).toBeNull()
    expect(document.getElementById('contract-value')).toBeNull()
  })

  it('clearing the amount leaves it unset, and a negative one is refused', () => {
    rtlAct(() => setContractAmount(120))
    rtlAct(() => setContractAmount(null))
    expect(data().contract.amount).toBeNull()
    rtlAct(() => setContractAmount(150))
    rtlAct(() => setContractAmount(-5))
    expect(data().contract.amount).toBe(150)
    rtlAct(() => setPaymentType('none'))
    rtlAct(() => setContractAmount(10))
    expect(data().contract.amount).toBeNull()
  })
})

describe('Milestones', () => {
  const rowOf = (id: number) => document.querySelector(`[data-msrow="${id}"]`) as HTMLElement
  const mount = () => { boot('schedule'); return render(<><Schedule /><OverlayHost /></>) }

  it('estimates only a milestone tied to a measure', () => {
    mount()
    upd((d) => { d.data.milestones[0].done = false })
    expect(within(rowOf(1)).getByRole('img', { name: 'Not estimated' })).toBeInTheDocument()
    expect(within(rowOf(3)).getByRole('img', { name: /\(est\./ })).toBeInTheDocument()
  })

  it('has a done flag that overrides the estimate', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Mark All chapters recorded complete' }))
    expect(data().milestones.find((m) => m.id === 3)!.done).toBe(true)
    expect(within(rowOf(3)).getByRole('img', { name: 'Done' })).toBeInTheDocument()
  })

  it('the checkpoint is a measure of the first 15 finished minutes and is estimated like one', () => {
    mount()
    upd((d) => { d.data.milestones.push({ id: 9, name: 'Sample', date: '2026-10-02', scope: 'checkpoint' }) })
    expect(measOf('checkpoint')).toBe('checkpoint')
    expect(progress.minutesOf('checkpoint')).toBe(15)
    expect(remainFor(data(), 'checkpoint')).toBe(remainFor(data(), 'min15'))
    expect(within(rowOf(9)).getByRole('img', { name: /\(est\./ })).toBeInTheDocument()
  })

  it('changes the minutes of a "first N finished minutes" milestone and prices the work from the chapters in that window', async () => {
    mount()
    upd((d) => { d.data.milestones.push({ id: 9, name: 'Sample', date: '2026-10-05', scope: 'min15' }) })
    fireEvent.click(document.querySelector('[data-msedit="9"]')!)
    const d = within(screen.getByRole('dialog'))
    fireEvent.change(d.getByLabelText('How many finished minutes'), { target: { value: '30' } })
    fireEvent.click(d.getByRole('button', { name: 'Save' }))
    expect(data().milestones.find((m) => m.id === 9)!.scope).toBe('min30')
    const b = data()
    // Nothing is done in the later chapters, so a longer window costs more work; a book with the window done costs nothing.
    expect(remainFor(b, 'min30')).toBeGreaterThanOrEqual(remainFor(b, 'min15'))
    expect(remainFor(b, 'min15')).toBe(0)
    const fresh = { ...b, chapters: b.chapters.map((c) => ({ ...c, rec: 0, edit: 0, proof: 0 })) }
    const per = (RATIO.rec + RATIO.edit + RATIO.proof) / 60
    expect(remainFor(fresh, 'min15')).toBeCloseTo(15 * per, 6)
  })

  it('every offered measure round-trips through the stored scope', () => {
    expect(measOf('min20')).toBe('minN')
    expect(measOf('ch4')).toBe('chN')
    expect(measOf('custom')).toBe('custom')
  })
})

describe('Recording check', () => {
  it('stores the model, the text and how much was recorded, and is current as of the last save', () => {
    const k = data().checks.find((c) => c.chapterId === '3')!
    expect(k).toMatchObject({ model: expect.any(String), textKey: textKey(data(), '3'), rec: 100 })
    expect(checkState(data(), '3')).toBe('current')
  })

  it('is out of date once more is recorded or the text changes, and absent before any check', () => {
    expect(checkState(data(), '5')).toBe('stale')
    expect(checkState(data(), '7')).toBe('none')
    upd((d) => { d.data.paragraphs.find((p) => p.chapterId === '3')!.text += ' Changed.' })
    expect(checkState(data(), '3')).toBe('stale')
    upd((d) => { d.data.chapters.find((c) => c.id === '1')!.rec = 100; d.data.checks.push({ chapterId: '1', model: 'Whisper base', textKey: textKey(d.data, '1'), rec: 100, at: d.data.today }) })
    expect(checkState(data(), '1')).toBe('current')
    upd((d) => { d.data.chapters.find((c) => c.id === '1')!.rec = 90 })
    expect(checkState(data(), '1')).toBe('stale')
  })

  it('a new check replaces the old result and is current again', () => {
    expect(checkState(data(), '5')).toBe('stale')
    rtlAct(() => detectPickups(['5'], true))
    expect(checkState(data(), '5')).toBe('current')
    expect(data().checks.filter((c) => c.chapterId === '5')).toHaveLength(1)
    expect(data().checks.find((c) => c.chapterId === '5')!.rec).toBe(100)
  })

  it('Production counts the same data Pickups uses', () => {
    const s = checkSummary(data())
    render(<Production />)
    for (const key of ['current', 'stale', 'none'] as const) expect(document.querySelector(`[data-chk="${key}"]`)!.textContent).toBe(String(s[key].length))
    expect(s.current).toContain('3')
    expect(s.stale).toContain('5')
    expect(s.none).toContain('7')
  })

  it('the Check recordings button offers the chapters that are out of date or unchecked', () => {
    const spy = vi.spyOn(modals, 'checkRecordings').mockImplementation(() => {})
    render(<Production />)
    fireEvent.click(document.getElementById('chk-prod')!)
    const s = checkSummary(data())
    expect(spy).toHaveBeenCalledWith([...s.stale, ...s.none])
    spy.mockRestore()
  })

  it('the Check recordings dialog labels each chapter', () => {
    boot('pickups')
    render(<><Pickups /><OverlayHost /></>)
    rtlAct(() => modals.checkRecordings([]))
    const row = (id: string) => document.querySelector(`[data-ckc="${id}"]`)!.closest('tr')!.textContent
    expect(row('3')).toContain('Checked, as of last save')
    expect(row('5')).toContain('Out of date')
    expect(row('7')).toContain('Not checked yet')
  })
})

describe('TAKE_LOG fixture', () => {
  it('adds up to the recorded length of the sample book', () => {
    const rw = data().chapters.reduce((a, c) => a + (c.words * c.rec) / 100, 0)
    expect(TAKE_LOG.reduce((a, e) => a + e.seconds, 0)).toBeCloseTo((rw / WPH) * 3600, 0)
  })
})
