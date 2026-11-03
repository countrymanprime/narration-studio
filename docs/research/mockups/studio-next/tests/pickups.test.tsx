import { act as rtlAct, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { chooseOption } from './helpers/select'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { modals } from '@/app/modals'
import { contextItemsFor } from '@/app/registry'
import type { HeadingStyle } from '@/format/headings'
import { chName } from '@/selectors/chapters'
import { pickupList, sessionPickups } from '@/selectors/pickups'
import { initialPrefs } from '@/state/slices/ui'
import { createInitialState, getState, resetState, update } from '@/state/store'
import { OverlayHost } from '@/ui/OverlayHost'
import { closePop, closeTopModal, dismissToast, getOverlay } from '@/ui/overlay'
import { estimateMinutes, audioMinutes } from '@/pages/pickups/CheckRecordings'
import { speech } from '@/providers/speech'
import { daw } from '@/state/daw'
import PickupsPage from '@/pages/Pickups'
import '@/pages'

const mount = () => render(<><OverlayHost /><PickupsPage /></>)
const setup = (opts: Parameters<typeof createInitialState>[0] = {}) => {
  const s = createInitialState({ ...opts, prefs: initialPrefs })
  s.ui.page = 'pickups'
  resetState(s)
}

beforeEach(() => setup())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  while (getOverlay().modals.length) closeTopModal()
  closePop()
  getOverlay().toasts.forEach((t) => dismissToast(t.id))
})

describe('Pickups list', () => {
  it.each<[HeadingStyle, 12 | 40]>([['gutenberg', 12], ['numbered', 12], ['colon', 12], ['gutenberg', 40], ['colon', 40]])(
    'groups the lines by chapter with the manuscript heading (%s, %i chapters)',
    (headingStyle, chapters) => {
      setup({ headingStyle, chapters })
      mount()
      const { data } = getState()
      const rows = document.querySelectorAll('tr[data-pk]')
      expect(rows).toHaveLength(7)
      for (const id of ['3', '5']) {
        const c = data.chapters.find((x) => x.id === id)!
        expect(screen.getByText(chName(data, c))).toBeInTheDocument()
      }
      expect(screen.getByText(/· 3 open/)).toBeInTheDocument()
      expect(screen.getByText(/· 4 open/)).toBeInTheDocument()
    },
  )

  it('draws bold and italic in a line from a proof note, and nothing else as markup', () => {
    mount()
    expect(document.querySelector('[data-pk="p1"] td:nth-child(4) i')?.textContent).toBe('you')
    expect(document.querySelector('[data-pk="p4"] td:nth-child(4) b')?.textContent).toBe('hookah')
    expect(document.querySelector('[data-pk="p1"]')!.textContent).not.toContain('<i>')
  })

  it('shows only the current chapter when the scope is one chapter', () => {
    update((d) => { d.ui.pickups.scope = 'chapter'; d.ui.chapter = '3' })
    mount()
    expect(document.querySelectorAll('tr[data-pk]')).toHaveLength(3)
  })

  it('leaving a line out, and putting it back, changes the session count', async () => {
    mount()
    const lines = () => screen.getByText('Lines').parentElement!.querySelector('b')!.textContent
    expect(lines()).toBe('7')
    await userEvent.click(document.querySelector('[data-inc="c3a"]')!)
    expect(lines()).toBe('6')
    expect(screen.getByRole('button', { name: 'Open 6 in Booth' })).toBeEnabled()
    expect(sessionPickups(getState().data, pickupList(getState().data))).toHaveLength(6)
    await userEvent.click(document.querySelector('[data-inc="c3a"]')!)
    expect(lines()).toBe('7')
  })

  it('a recorded line is not part of the session and can be opened again', async () => {
    mount()
    await userEvent.click(document.querySelector('[data-donep="c3b"]')!)
    expect(getState().data.pickDone).toContain('c3b')
    expect(screen.getByText('Recorded')).toBeInTheDocument()
    expect(document.querySelector('[data-inc="c3b"]')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('Lines').parentElement!.querySelector('b')!.textContent).toBe('6')
    await userEvent.click(document.querySelector('[data-donep="c3b"]')!)
    expect(getState().data.pickDone).not.toContain('c3b')
  })

  it('removes a line and the toast brings it back', async () => {
    mount()
    await userEvent.click(document.querySelector('[data-delp="c3a"]')!)
    expect(document.querySelector('[data-pk="c3a"]')).toBeNull()
    expect(getState().history.at(-1)?.label).toBe('Removed a pickup')
    await userEvent.click(within(document.getElementById('toasts')!).getByRole('button', { name: 'Undo' }))
    expect(document.querySelector('[data-pk="c3a"]')).not.toBeNull()
  })

  it('a hand-added line finds its paragraph', async () => {
    update((d) => { d.ui.chapter = '3'; d.ui.pickups.scope = 'chapter' })
    mount()
    const para = getState().data.paragraphs.find((p) => p.id === '3-3')!
    await userEvent.click(document.getElementById('addp')!)
    await userEvent.type(document.getElementById('apt')!, '09:01.0')
    await userEvent.type(document.getElementById('apl')!, para.text.slice(0, 20))
    await userEvent.click(document.getElementById('apok')!)
    const added = getState().data.pickups.find((x) => x.src === 'you')!
    expect(added).toMatchObject({ chapterId: '3', pid: '3-3', t: '09:01.0', ctx: para.text })
    expect(document.querySelector(`[data-pk="${added.id}"]`)).not.toBeNull()
  })

  it('asks for the line first and stores no pid when nothing matches', async () => {
    mount()
    await userEvent.click(document.getElementById('addp')!)
    await userEvent.click(document.getElementById('apok')!)
    expect(getState().data.pickups.filter((x) => x.src === 'you')).toHaveLength(0)
    expect(screen.getByText('Type the line first.')).toBeInTheDocument()
    await userEvent.type(document.getElementById('apl')!, 'Nothing like this anywhere')
    await userEvent.click(document.getElementById('apok')!)
    expect(getState().data.pickups.find((x) => x.src === 'you')).toMatchObject({ pid: null, t: '—' })
  })

  it('keys: arrows move, Space includes or leaves out, Enter opens the Booth on that line', async () => {
    mount()
    const rows = () => [...document.querySelectorAll<HTMLElement>('tr[data-pk]')]
    rows()[0].focus()
    fireEvent.keyDown(rows()[0], { key: 'ArrowDown' })
    expect(document.activeElement).toBe(rows()[1])
    fireEvent.keyDown(rows()[1], { key: ' ' })
    expect(getState().data.pickOut).toEqual([rows()[1].dataset.pk])
    fireEvent.keyDown(rows()[1], { key: ' ' })
    expect(getState().data.pickOut).toEqual([])
    fireEvent.keyDown(rows()[1], { key: 'Enter' })
    expect(getState().ui.page).toBe('booth')
    expect(getState().ui.pickups.lines).toEqual([rows()[1].dataset.pk])
    expect(getState().ui.pickups.mode).toBe(true)
  })

  it('opens the whole session in the Booth and adds markers in REAPER', async () => {
    mount()
    await userEvent.click(document.getElementById('expm')!)
    const last = daw().calls.at(-1)!
    expect(last.name).toBe('addPickupMarkers')
    expect(last.args[0]).toHaveLength(7)
    expect(daw().markers().filter((m) => m.label.startsWith('PICKUP: '))).toHaveLength(7)
    expect(getState().history.at(-1)).toMatchObject({ label: 'Added 7 markers in REAPER', daw: true })
    await userEvent.click(document.getElementById('rp')!)
    expect(getState().ui.page).toBe('booth')
    expect(getState().ui.pickups.lines).toHaveLength(7)
  })

  it('REAPER off disables the check and the markers', () => {
    update((d) => { d.mock.setup = 'reaper-off' })
    mount()
    expect(document.getElementById('chk')).toBeDisabled()
    expect(document.getElementById('expm')).toBeDisabled()
  })

  it('right-click on a row offers the line actions', () => {
    mount()
    const items = contextItemsFor(document.querySelector('tr[data-pk="c3a"]')!, { clientX: 0, clientY: 0 })!
    const labels = items.map((i) => ('l' in i ? i.l : 'label' in i ? i.label : '-'))
    expect(labels).toContain('Leave out of the session')
    expect(labels).toContain('Open in Booth at this line')
    expect(labels).toContain('Go to the note in Proof')
  })
})

describe('Check recordings', () => {
  const open = (pre: string[]) => { mount(); rtlAct(() => modals.checkRecordings(pre)) }

  it('estimates from the audio, the model and the workers', async () => {
    open(['3', '5'])
    const { data } = getState()
    const ch = (id: string) => data.chapters.find((c) => c.id === id)!
    const audio = audioMinutes([ch('3'), ch('5')])
    const per = (m: string, w: number) => Math.max(1, Math.round((audio * speech().engines().find((x) => x.id === m)!.factor) / w))
    expect(estimateMinutes(audio, 'Whisper base', 4)).toBe(per('Whisper base', 4))
    expect(document.getElementById('ck-e')!.textContent).toBe('about ' + per('Whisper base', 4) + ' min')
    await chooseOption(document.getElementById('ck-m')!, 'Whisper medium')
    expect(document.getElementById('ck-e')!.textContent).toBe('about ' + per('Whisper medium', 4) + ' min')
    fireEvent.change(document.getElementById('ck-w')!, { target: { value: '1' } })
    expect(getState().ui.check.workers).toBe(1)
    expect(document.getElementById('ck-e')!.textContent).toBe('about ' + per('Whisper medium', 1) + ' min')
    expect(estimateMinutes(0, 'Whisper tiny', 8)).toBe(1)
  })

  it('lists only chapters that are recorded, and selects with All and None', async () => {
    open([])
    const { data } = getState()
    const boxes = document.querySelectorAll('[data-ckc]')
    expect(boxes).toHaveLength(data.chapters.filter((c) => c.rec > 0).length)
    expect(document.getElementById('ck-run')).toBeDisabled()
    await userEvent.click(document.getElementById('ck-all')!)
    expect(screen.getByRole('button', { name: `Check ${boxes.length} chapters` })).toBeEnabled()
    await userEvent.click(document.getElementById('ck-none')!)
    expect(document.getElementById('ck-run')).toBeDisabled()
  })

  it('names the chapters in the manuscript style', () => {
    setup({ headingStyle: 'colon', chapters: 40 })
    open([])
    const { data } = getState()
    expect(within(document.querySelector('.dlg')!).getByText(chName(data, data.chapters.find((c) => c.id === '7')!))).toBeInTheDocument()
    expect(document.querySelectorAll('[data-ckc]').length).toBe(8)
  })

  it('a run adds speech pickups once per chapter, marks chapters checked, and can be undone', async () => {
    vi.useFakeTimers()
    open(['3', '7'])
    fireEvent.click(document.getElementById('ck-run')!)
    expect(screen.getByText('Checking…')).toBeInTheDocument()
    rtlAct(() => { vi.advanceTimersByTime(200 * 12) })
    const { data } = getState()
    const added = data.pickups.filter((x) => x.id.startsWith('d'))
    // Chapter 3 has a stretch left out and a misread; chapter 7 has extra words said. Each is a kind of gap.
    expect(added.map((x) => [x.chapterId, x.pid, x.gap]).sort()).toEqual([['3', '3-2', 'missing'], ['3', '3-4', 'misread'], ['7', '7-1', 'extra']])
    expect(added.every((x) => x.src === 'speech' && x.pid && x.ctx)).toBe(true)
    expect(added.find((x) => x.gap === 'missing')).toMatchObject({ ty: 'skip', conf: 0.93 })
    expect(added.find((x) => x.gap === 'misread')).toMatchObject({ ty: 'misread', conf: 0.91 })
    expect(added.find((x) => x.gap === 'extra')).toMatchObject({ ty: 'repeat', conf: 0.88 })
    expect(data.checks.map((k) => k.chapterId)).toContain('7')
    expect(screen.getByText(/Checked 2 chapters · 3 lines to redo/)).toBeInTheDocument()
    expect(document.querySelector('.dlg')).toBeNull()
    /* Again: nothing is added twice. */
    rtlAct(() => modals.checkRecordings(['3', '7']))
    fireEvent.click(document.getElementById('ck-run')!)
    rtlAct(() => { vi.advanceTimersByTime(200 * 12) })
    expect(getState().data.pickups.filter((x) => x.id.startsWith('d'))).toHaveLength(3)
    expect(screen.getByText(/0 lines to redo/)).toBeInTheDocument()
    /* The second run found nothing, so it recorded no undo entry. */
    expect(getState().history.filter((e) => e.label.startsWith('Added 3 pickups'))).toHaveLength(1)
  })

  it('Stop ends the run and adds nothing', () => {
    vi.useFakeTimers()
    open(['3'])
    fireEvent.click(document.getElementById('ck-run')!)
    rtlAct(() => { vi.advanceTimersByTime(400) })
    fireEvent.click(document.getElementById('ck-stop')!)
    rtlAct(() => { vi.advanceTimersByTime(4000) })
    expect(getState().data.pickups.filter((x) => x.id.startsWith('d'))).toHaveLength(0)
    expect(screen.getByText('Stopped. Nothing was added.')).toBeInTheDocument()
  })

  it('undo from the toast removes the added pickups', async () => {
    vi.useFakeTimers()
    open(['3'])
    fireEvent.click(document.getElementById('ck-run')!)
    rtlAct(() => { vi.advanceTimersByTime(200 * 12) })
    expect(getState().data.pickups.filter((x) => x.id.startsWith('d'))).toHaveLength(2)
    fireEvent.click(within(document.getElementById('toasts')!).getByRole('button', { name: 'Undo' }))
    expect(getState().data.pickups.filter((x) => x.id.startsWith('d'))).toHaveLength(0)
  })

  it('the page button preselects chapters with text that are not checked yet or whose check is out of date', () => {
    mount()
    fireEvent.click(document.getElementById('chk')!)
    const on = [...document.querySelectorAll<HTMLElement>('[data-ckc]')].filter((b) => b.getAttribute('aria-checked') === 'true').map((b) => b.dataset.ckc)
    // Chapter 5 was checked when less of it was recorded, so its check is out of date and it is offered again.
    expect(on).toEqual(['open', '5', '7'])
  })
})
