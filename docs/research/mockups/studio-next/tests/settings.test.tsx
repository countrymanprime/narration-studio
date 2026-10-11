import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { chooseOption } from './helpers/select'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SHORTCUTS } from '@/app/help'
import { modals } from '@/app/modals'
import SettingsPage from '@/pages/Settings'
import { OverlayHost } from '@/ui/OverlayHost'
import { createInitialState, getState, resetState, update } from '@/state/store'
import { SIZES } from '@/selectors/reader'
import { initialPrefs } from '@/state/slices/ui'

const mount = () => render(<><SettingsPage /><OverlayHost /></>)
beforeEach(() => resetState(createInitialState({ prefs: initialPrefs })))
afterEach(cleanup)

describe('Settings', () => {
  it('chooses the recorder: REAPER, Audacity or built-in', async () => {
    mount()
    const u = userEvent.setup()
    const radios = within(screen.getByRole('radiogroup', { name: 'Recording' })).getAllByRole('radio')
    expect(radios).toHaveLength(3)
    expect(radios.map((r) => r.getAttribute('aria-labelledby')).every(Boolean)).toBe(true)
    expect(radios[0]).toHaveAttribute('aria-checked', 'true')
    await u.click(radios[1])
    expect(getState().mock.setup).toBe('audacity')
    await u.click(radios[2])
    expect(getState().mock.setup).toBe('builtin')
    expect(screen.getByRole('radio', { name: /^Built-in recorder/ })).toHaveAttribute('aria-checked', 'true')
  })

  it('shows REAPER as chosen while REAPER is not running', () => {
    update((d) => { d.mock.setup = 'reaper-off' })
    mount()
    expect(screen.getByRole('radio', { name: /^REAPER\./ })).toHaveAttribute('aria-checked', 'true')
  })

  it('switches the definition source and saves it in the preferences', async () => {
    mount()
    const u = userEvent.setup()
    expect(screen.getByRole('radio', { name: /^Web page/ })).toHaveAttribute('aria-checked', 'true')
    await u.click(screen.getByRole('radio', { name: /^Local dictionary/ }))
    expect(getState().ui.prefs.dictSource).toBe('local')
    await u.click(screen.getByRole('radio', { name: /^Online service/ }))
    expect(getState().ui.prefs.dictSource).toBe('api')
  })

  it('shows the local dictionary as installed or not, and downloads or removes it', async () => {
    mount()
    const u = userEvent.setup()
    const dict = within(document.getElementById('dictbtn')!.parentElement!)
    expect(dict.getByText('Installed')).toBeInTheDocument()
    await u.click(document.getElementById('dictbtn')!)
    expect(getState().mock.dictLocal).toBe('missing')
    expect(dict.getByText('Not installed')).toBeInTheDocument()
    expect(await screen.findByText('Local dictionary removed.')).toBeInTheDocument()
    expect(document.getElementById('dictbtn')).toHaveAccessibleName('Download')
    await u.click(document.getElementById('dictbtn')!)
    expect(getState().mock.dictLocal).toBe('installed')
    expect(await screen.findByText('Local dictionary downloaded.')).toBeInTheDocument()
  })

  it('shows the online service as online or offline', () => {
    mount()
    expect(screen.getByText('Online')).toBeInTheDocument()
    cleanup()
    update((d) => { d.mock.net = 'offline' })
    mount()
    expect(screen.getByText('Offline')).toBeInTheDocument()
  })

  it('reader text changes the saved preferences and the preview quote', async () => {
    mount()
    const prev = document.getElementById('sprev')!
    expect(prev.style.fontSize).toBe('20px')
    fireEvent.change(document.getElementById('ts-s')!, { target: { value: String(SIZES.indexOf(28)) } })
    fireEvent.change(document.getElementById('ts-l')!, { target: { value: '2' } })
    expect(getState().ui.prefs.readerSize).toBe(28)
    expect(document.getElementById('sprev')!.style.fontSize).toBe('28px')
    expect(document.getElementById('sprev')!.style.lineHeight).toBe('2')
    expect(prev).toHaveTextContent('Off with her head!')
    expect(screen.getByLabelText('Font')).toBeInTheDocument()
  })

  it('lists the marks and opens the marks dialog', async () => {
    const spy = vi.fn()
    const old = modals.marks
    modals.marks = spy
    mount()
    getState().data.marks.forEach((m) => expect(screen.getAllByText(new RegExp(m.name)).length).toBeGreaterThan(0))
    await userEvent.click(screen.getByRole('button', { name: 'Edit marks…' }))
    expect(spy).toHaveBeenCalled()
    modals.marks = old
  })

  it('theme radios save the choice', async () => {
    mount()
    const u = userEvent.setup()
    expect(screen.getByRole('radio', { name: 'Match my system' })).toHaveAttribute('aria-checked', 'true')
    await u.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(getState().ui.prefs.theme).toBe('dark')
    await u.click(screen.getByRole('radio', { name: 'Light' }))
    expect(getState().ui.prefs.theme).toBe('light')
  })

  it('lists the keyboard shortcuts read-only', () => {
    mount()
    const sec = screen.getByRole('heading', { name: 'Keyboard shortcuts' }).closest('section')!
    expect(sec.querySelectorAll('kbd')).toHaveLength(SHORTCUTS.length)
    expect(sec.querySelectorAll('input,button')).toHaveLength(0)
  })

  describe('Story Bible types', () => {
    const typeRow = (i: number) => document.querySelector<HTMLInputElement>(`[data-sbtn="${i}"]`)!
    it('renaming a type moves its entries and the Story Bible filter', async () => {
      mount()
      const u = userEvent.setup()
      update((d) => { d.ui.bible.kind = 'Location' })
      const i = getState().data.bibleTypes.findIndex((t) => t.k === 'Location')
      const n = getState().data.bible.filter((e) => e.kind === 'Location').length
      await u.clear(typeRow(i))
      await u.type(typeRow(i), 'Place{Enter}')
      const { data, ui } = getState()
      expect(data.bibleTypes[i].k).toBe('Place')
      expect(data.bible.filter((e) => e.kind === 'Place')).toHaveLength(n)
      expect(data.bible.some((e) => e.kind === 'Location')).toBe(false)
      expect(ui.bible.kind).toBe('Place')
    })
    it('refuses an empty or taken name', async () => {
      mount()
      const u = userEvent.setup()
      await u.clear(typeRow(1))
      await u.type(typeRow(1), 'Character{Enter}')
      expect(getState().data.bibleTypes[1].k).toBe('Location')
      await u.tab()
      expect(typeRow(1).value).toBe('Location')
    })
    it('changes the colour', async () => {
      mount()
      await chooseOption(screen.getByLabelText('Colour for Location'), 'Red')
      expect(getState().data.bibleTypes[1].c).toBe('bad')
    })
    it('remove is disabled while a type is in use, and when it is the last one', async () => {
      mount()
      const u = userEvent.setup()
      const rm = (i: number) => document.querySelector<HTMLButtonElement>(`[data-sbtx="${i}"]`)!
      expect(rm(0)).toBeDisabled()
      await u.type(screen.getByLabelText('New type'), 'Creature')
      await u.click(screen.getByRole('button', { name: 'Add type' }))
      const last = getState().data.bibleTypes.length - 1
      expect(getState().data.bibleTypes[last].k).toBe('Creature')
      expect(rm(last)).toBeEnabled()
      await u.click(rm(last))
      expect(getState().data.bibleTypes.some((t) => t.k === 'Creature')).toBe(false)
      update((d) => { d.data.bibleTypes = [d.data.bibleTypes[0]] })
      cleanup(); mount()
      expect(rm(0)).toBeDisabled()
    })
    it('adding needs a new name', async () => {
      mount()
      const u = userEvent.setup()
      await u.type(screen.getByLabelText('New type'), 'Item')
      await u.click(screen.getByRole('button', { name: 'Add type' }))
      expect(await screen.findByText('Give the type a new name.')).toBeInTheDocument()
      expect(within(document.body).getAllByLabelText('Type name')).toHaveLength(getState().data.bibleTypes.length)
    })
  })
})
