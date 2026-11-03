import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Companion from '@/pages/Companion'
import { OverlayHost } from '@/ui/OverlayHost'
import { chName } from '@/selectors/chapters'
import { baseRows, noteProgress } from '@/selectors/proof'
import { createInitialState, getState, resetState, undoLast, update } from '@/state/store'
import { mmss } from '@/format/time'
import { WPH } from '@/selectors/progress'
import { daw } from '@/state/daw'

const mount = (opts = {}, ch = '5') => {
  resetState(createInitialState({ ...opts }))
  update((d) => { d.mock.companion = true; d.mock.dawChapter = ch })
  return render(<><Companion /><OverlayHost /></>)
}
afterEach(cleanup)
beforeEach(() => resetState(createInitialState()))

describe('Companion', () => {
  it('follows the chapter the DAW playhead is in', () => {
    mount()
    const { data } = getState()
    const ch5 = data.chapters.find((c) => c.id === '5')!
    expect(screen.getByText(new RegExp(chName(data, ch5).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' · ¶ 2'))).toBeInTheDocument()
    expect(screen.getByText(/Pickups in this chapter · 4/)).toBeInTheDocument()
    cleanup()
    mount({}, '3')
    expect(screen.getByText(/Pickups in this chapter · 3/)).toBeInTheDocument()
    expect(screen.getByText('No notes for this chapter')).toBeInTheDocument()
    expect(screen.getByText('0 of 0')).toBeInTheDocument()
  })

  it('shows the selected note, and the first of the chapter when the selection is elsewhere', () => {
    mount()
    expect(screen.getByText('misread')).toBeInTheDocument()
    update((d) => { d.ui.proof.sel = 9 })
    cleanup(); mount()
    expect(document.querySelector('.type')!.textContent).toBe('misread')
  })

  it('previous and next move within the chapter notes only', async () => {
    mount()
    const u = userEvent.setup()
    const notes = baseRows(getState().data, { scope: 'chapter', chapter: '5' })
    update((d) => { d.ui.proof.sel = notes[0].id })
    await u.click(screen.getByLabelText('Previous note'))
    expect(getState().ui.proof.sel).toBe(notes[0].id)
    await u.click(screen.getByLabelText('Next note'))
    expect(getState().ui.proof.sel).toBe(notes[1].id)
    update((d) => { d.ui.proof.sel = notes.at(-1)!.id })
    await u.click(screen.getByLabelText('Next note'))
    expect(getState().ui.proof.sel).toBe(notes.at(-1)!.id)
  })

  it('a decision sets the note, is undoable and is shown on the note', async () => {
    mount()
    const u = userEvent.setup()
    const id = getState().ui.proof.sel!
    const prev = getState().data.proofNotes.find((n) => n.id === id)!.res
    await u.click(screen.getByRole('button', { name: 'Waive' }))
    expect(getState().data.proofNotes.find((n) => n.id === id)!.res).toBe('waive')
    expect(screen.getByRole('button', { name: 'Waive' })).toHaveAttribute('aria-pressed', 'true')
    expect(getState().history.at(-1)!.label).toMatch(/^Decision “Waive” at /)
    const notes = baseRows(getState().data, { scope: 'chapter', chapter: '5' })
    // The Companion counts what is cleared, like Proof.
    expect(screen.getByText(noteProgress(getState().data, notes).cleared + ' of ' + notes.length)).toBeInTheDocument()
    undoLast()
    expect(getState().data.proofNotes.find((n) => n.id === id)!.res).toBe(prev)
  })

  it('play and go-to use the DAW; go-to is off when REAPER is not linked', async () => {
    mount()
    const u = userEvent.setup()
    daw().calls.length = 0
    await u.click(screen.getByLabelText('Play ±3 s'))
    await u.click(screen.getByLabelText('Show in REAPER'))
    expect(daw().calls.map((c) => c.name)).toEqual(['playAround', 'gotoTime'])
    expect(await screen.findByText('REAPER cursor moved')).toBeInTheDocument()
    act(() => update((d) => { d.mock.setup = 'reaper-off' }))
    expect(screen.getByLabelText('Show in REAPER')).toBeDisabled()
    expect(screen.getByText('REAPER not running')).toBeInTheDocument()
  })

  it('record this line is a toast; the full app button leaves the Companion', async () => {
    mount()
    const u = userEvent.setup()
    await u.click(screen.getAllByLabelText('Record this line')[0])
    expect(await screen.findByText('Recording this line')).toBeInTheDocument()
    await u.click(screen.getByLabelText('Open the full app'))
    expect(getState().mock.companion).toBe(false)
  })

  it('derives This chapter from the chapter data', () => {
    mount({}, '4')
    const c4 = getState().data.chapters.find((c) => c.id === '4')!
    expect(screen.getByText(mmss(Math.round(((c4.words / WPH) * 3600 * c4.rec) / 100)))).toBeInTheDocument()
    expect(screen.getByText('FAIL')).toBeInTheDocument()
    cleanup()
    mount({}, '3')
    expect(screen.getByText('Not yet')).toBeInTheDocument()
  })

  for (const headingStyle of ['gutenberg', 'numbered', 'colon'] as const) {
    for (const chapters of [12, 40] as const) {
      it(`names the chapter from data: ${headingStyle}, ${chapters} chapters`, () => {
        mount({ headingStyle, chapters })
        const { data } = getState()
        const c = data.chapters.find((x) => x.id === '5')!
        expect(document.querySelector('.cmpb .label')!.textContent).toContain(chName(data, c))
      })
    }
  }
})
