import { entryOfSpeaker, speakerColourOf } from '@/selectors/speakers'
import { setEntryColour } from '@/state/commands/bible'
import { act as rtlAct, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { contextItemsFor, keyHandlersFor } from '@/app/registry'
import { modals } from '@/app/modals'
import '@/app/context'
import { chLabel, chName } from '@/selectors/chapters'
import { searchManuscript } from '@/selectors/search'
import { phrasesOf } from '@/selectors/phrases'
import { lookup, openFind } from '@/state/commands/script'
import { createInitialState, getState, resetState, update } from '@/state/store'
import { OverlayHost } from '@/ui/OverlayHost'
import ScriptPage from '@/pages/Script'
import { openMarkComposer } from '@/pages/script/dialogs'
import type { HeadingStyle } from '@/format/headings'

const boot = (opts: { headingStyle?: HeadingStyle; chapters?: 12 | 40 } = {}): void => {
  const s = createInitialState(opts)
  s.ui.page = 'script'
  resetState(s)
}
const upd = (fn: Parameters<typeof update>[0]): void => { rtlAct(() => update(fn)) }
const mount = () => render(<><OverlayHost /><ScriptPage /></>)

beforeEach(() => { boot() })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('Script: chapter names come from the data, in every heading style', () => {
  for (const style of ['gutenberg', 'numbered', 'colon'] as const) {
    for (const n of [12, 40] as const) {
      it(`${style}, ${n} chapters`, () => {
        boot({ headingStyle: style, chapters: n })
        mount()
        const { data } = getState()
        expect(data.chapters).toHaveLength(n + 2)
        const list = document.getElementById('chlist')!
        expect(list.querySelectorAll('li')).toHaveLength(n + 2)
        data.chapters.forEach((c) => {
          const btn = list.querySelector(`[data-jump="${c.id}"]`)!
          expect(btn.textContent).toContain(c.title)
          const label = chLabel(data, c)
          if (label) expect(within(btn as HTMLElement).getByText(label)).toBeTruthy()
          expect(document.querySelector(`#ch-${c.id} h2`)!.textContent).toBe(c.title)
          expect(screen.getByRole('group', { name: 'Prep state for ' + chName(data, c) })).toBeTruthy()
        })
        expect(document.getElementById('stk-t')!.textContent).toBe(chName(data, data.chapters.find((c) => c.id === '8')!))
      })
    }
  }
})

describe('Script: prep state', () => {
  it('changes the dot, the pressed button and the data, and says so', () => {
    mount()
    const dot = () => document.querySelector('#chlist [data-jump="8"] .pdot')!
    expect(dot().className).toContain(getState().data.chapters.find((c) => c.id === '8')!.prep)
    const group = screen.getByRole('group', { name: 'Prep state for ' + chName(getState().data, getState().data.chapters.find((c) => c.id === '8')!) })
    fireEvent.click(within(group).getByText('Prepped'))
    expect(dot().className).toBe('pdot prepped')
    expect(within(group).getByText('Prepped').getAttribute('aria-pressed')).toBe('true')
    expect(within(group).getByText('Not started').getAttribute('aria-pressed')).toBe('false')
    expect(getState().data.chapters.find((c) => c.id === '8')!.prep).toBe('prepped')
    expect(document.getElementById('live')!.textContent).toContain('Prepped')
  })
  it('arrow keys on the reader step the prep state of the chapter in view', () => {
    mount()
    const rd = document.getElementById('rdscroll')!
    const prep = () => getState().data.chapters.find((c) => c.id === '8')!.prep
    upd((d) => { d.data.chapters.find((c) => c.id === '8')!.prep = 'none' })
    fireEvent.keyDown(rd, { key: 'ArrowRight' })
    expect(prep()).toBe('progress')
    fireEvent.keyDown(rd, { key: 'ArrowRight' })
    fireEvent.keyDown(rd, { key: 'ArrowRight' })
    expect(prep()).toBe('prepped')
    fireEvent.keyDown(rd, { key: 'ArrowLeft' })
    expect(prep()).toBe('progress')
  })
})

describe('Script: find', () => {
  it('highlights every match, counts them, steps and closes', () => {
    mount()
    expect(document.getElementById('findbar')!.hidden).toBe(true)
    rtlAct(() => openFind('queen'))
    const n = searchManuscript(getState().data, 'queen').length
    expect(n).toBeGreaterThan(1)
    expect(document.getElementById('findbar')!.hidden).toBe(false)
    expect(document.getElementById('findcount')!.textContent).toBe('1 of ' + n)
    expect(document.querySelectorAll('.a-find')).toHaveLength(n)
    expect(document.querySelectorAll('.a-find-cur')).toHaveLength(1)
    const q = document.getElementById('findq') as HTMLInputElement
    expect(q.value).toBe('queen')
    fireEvent.keyDown(q, { key: 'Enter' })
    expect(document.getElementById('findcount')!.textContent).toBe('2 of ' + n)
    fireEvent.keyDown(q, { key: 'Enter', shiftKey: true })
    fireEvent.keyDown(q, { key: 'Enter', shiftKey: true })
    expect(document.getElementById('findcount')!.textContent).toBe(n + ' of ' + n)
    fireEvent.change(q, { target: { value: 'zzzzqq' } })
    expect(document.getElementById('findcount')!.textContent).toBe('No matches')
    expect(document.querySelectorAll('.a-find')).toHaveLength(0)
    fireEvent.keyDown(q, { key: 'Escape' })
    expect(getState().ui.script.find.open).toBe(false)
    expect(document.getElementById('findbar')!.hidden).toBe(true)
  })
  it('lists results and picking one makes it current', () => {
    mount()
    rtlAct(() => openFind('queen'))
    const list = document.getElementById('findlist')!
    expect(list.hidden).toBe(false)
    fireEvent.click(list.querySelector('[data-fi="2"]')!)
    expect(getState().ui.script.find.i).toBe(2)
    expect(getState().ui.script.find.list).toBe(false)
  })
  it('Escape closes Find only when no menu is open and no drawer is showing', () => {
    mount()
    rtlAct(() => openFind('queen'))
    const [h] = keyHandlersFor('script')
    upd((d) => { d.ui.script.drawer = 'rail' })
    expect(h(new KeyboardEvent('keydown', { key: 'Escape' }), { typing: false, hadPop: false, plain: true })).toBe(true)
    expect(getState().ui.script.drawer).toBeNull()
    expect(getState().ui.script.find.open).toBe(true)
    h(new KeyboardEvent('keydown', { key: 'Escape' }), { typing: false, hadPop: true, plain: true })
    expect(getState().ui.script.find.open).toBe(true)
    h(new KeyboardEvent('keydown', { key: 'Escape' }), { typing: false, hadPop: false, plain: true })
    expect(getState().ui.script.find.open).toBe(false)
  })
})

describe('Script: selection toolbar', () => {
  const selectIn = (pid: string, a: number, b: number, pid2 = pid): void => {
    const t1 = document.querySelector(`p[data-pid="${pid}"]`)!
    const t2 = document.querySelector(`p[data-pid="${pid2}"]`)!
    const walk = (el: Element, off: number): [Node, number] => {
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      let n: Node | null
      let left = off
      while ((n = w.nextNode())) {
        const len = n.textContent!.length
        if (left <= len) return [n, left]
        left -= len
      }
      throw new Error('offset out of range')
    }
    const r = document.createRange()
    r.setStart(...walk(t1, a))
    r.setEnd(...walk(t2, b))
    r.getBoundingClientRect = () => ({ left: 100, top: 100, width: 50, height: 20, right: 150, bottom: 120, x: 100, y: 100, toJSON() { return {} } }) as DOMRect
    const s = window.getSelection()!
    s.removeAllRanges()
    s.addRange(r)
  }
  it('is absent without a selection', async () => {
    mount()
    fireEvent.mouseUp(document.getElementById('reader')!)
    await new Promise((r) => setTimeout(r, 5))
    expect(document.querySelector('.seltool')).toBeNull()
  })
  it('offers Mark, Story Bible and Look up for a selection in one paragraph', async () => {
    mount()
    selectIn('8-1', 0, 5)
    fireEvent.mouseUp(document.getElementById('reader')!)
    await waitFor(() => expect(document.querySelector('.seltool')).not.toBeNull())
    const tool = within(document.querySelector('.seltool') as HTMLElement)
    expect(tool.getByRole('button', { name: 'Mark' })).toBeTruthy()
    expect(tool.getByRole('button', { name: 'Story Bible' })).toBeTruthy()
    fireEvent.click(tool.getByRole('button', { name: 'Look up' }))
    expect(getState().ui.script.tab).toBe('bible')
    expect(document.querySelector('.seltool')).toBeNull()
  })
  it('is disabled across paragraphs', async () => {
    mount()
    selectIn('8-1', 2, 4, '8-2')
    fireEvent.mouseUp(document.getElementById('reader')!)
    await waitFor(() => expect(document.querySelector('.seltool')).not.toBeNull())
    const b = within(document.querySelector('.seltool') as HTMLElement).getByText('Select within one paragraph')
    expect((b as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('Script: marks', () => {
  const g = (pid: string) => {
    const p = getState().data.paragraphs.find((x) => x.id === pid)!
    return { pid, s: 0, e: 6, q: p.text.slice(0, 6) }
  }
  it('the composer creates a note with its text', async () => {
    mount()
    const before = getState().data.annotations.length
    rtlAct(() => openMarkComposer('stress', g('8-3')))
    const dlg = screen.getByRole('dialog', { name: 'Mark text' })
    await userEvent.type(within(dlg).getByLabelText(/Note/), 'lean on this')
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }))
    const a = getState().data.annotations
    expect(a).toHaveLength(before + 1)
    expect(a[a.length - 1]).toMatchObject({ type: 'mark', mark: 'stress', text: 'lean on this', p: '8-3', s: 0, e: 6 })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(getState().ui.script.tab).toBe('marks')
  })
  it('a query needs its question, then opens a thread in the Queries tab', async () => {
    mount()
    const before = getState().data.annotations.length
    rtlAct(() => openMarkComposer('ask', g('8-3')))
    const dlg = screen.getByRole('dialog', { name: 'Mark text' })
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }))
    expect(getState().data.annotations).toHaveLength(before)
    expect(screen.getByText('Write the query first.')).toBeTruthy()
    await userEvent.type(within(dlg).getByLabelText('Your query'), 'Which spelling?')
    await userEvent.click(within(dlg).getByRole('button', { name: 'Save' }))
    const a = getState().data.annotations.at(-1)!
    expect(a).toMatchObject({ mark: 'ask', status: 'open', thread: [], text: 'Which spelling?' })
    expect(getState().ui.script.tab).toBe('queries')
  })
})

describe('Script: queries and notes are threads', () => {
  const openQueries = () => upd((d) => { d.ui.script.tab = 'queries'; d.ui.script.qfilter = 'all' })
  const card = (id: string) => document.querySelector(`[data-card="${id}"]`) as HTMLElement
  const openAsk = () => getState().data.annotations.find((a) => a.mark === 'ask' && a.status === 'open')!

  it('adds to a thread, resolves and reopens', async () => {
    mount()
    openQueries()
    const a = openAsk()
    const c = card(a.id)
    expect(within(c).getByText('Open')).toBeTruthy()
    await userEvent.type(within(c).getByLabelText('Reply or note'), 'They meant the live animals.')
    await userEvent.click(within(c).getByRole('button', { name: 'Reply' }))
    expect(within(card(a.id)).getByText('They meant the live animals.')).toBeTruthy()
    expect(getState().data.annotations.find((x) => x.id === a.id)!.thread!.at(-1)).toMatchObject({ who: 'author', text: 'They meant the live animals.' })
    await userEvent.click(within(card(a.id)).getByRole('button', { name: 'Mark resolved' }))
    expect(getState().data.annotations.find((x) => x.id === a.id)!.status).toBe('resolved')
    expect(within(card(a.id)).getByText('Resolved')).toBeTruthy()
    await userEvent.click(within(card(a.id)).getByRole('button', { name: 'Reopen' }))
    expect(getState().data.annotations.find((x) => x.id === a.id)!.status).toBe('open')
  })
  it('an empty reply is refused', async () => {
    mount()
    openQueries()
    const a = openAsk()
    const n = a.thread?.length ?? 0
    await userEvent.click(within(card(a.id)).getByRole('button', { name: 'Reply' }))
    expect(screen.getByText('Write the reply or note first.')).toBeTruthy()
    expect(getState().data.annotations.find((x) => x.id === a.id)!.thread?.length ?? 0).toBe(n)
  })
  it('edits a message', async () => {
    mount()
    openQueries()
    const res = getState().data.annotations.find((a) => a.thread?.length)!
    const c0 = card(res.id)
    await userEvent.click(within(c0).getAllByRole('button', { name: 'Edit this message' })[0])
    const box = within(card(res.id)).getByLabelText('Edit message')
    await userEvent.clear(box)
    await userEvent.type(box, 'Changed wording')
    await userEvent.click(within(card(res.id)).getByRole('button', { name: 'Save' }))
    expect(card(res.id).textContent).toContain('Changed wording')
  })
  it('deletes a message and offers Undo, which restores it', async () => {
    mount()
    openQueries()
    const res = getState().data.annotations.find((a) => a.thread && a.thread.length > 1)!
    const first = res.thread![0].text
    await userEvent.click(within(card(res.id)).getAllByRole('button', { name: 'Delete message' }).at(-1)!)
    // the thread message after the opening text goes
    expect(screen.getByText('Message deleted.')).toBeTruthy()
    const lenNow = getState().data.annotations.find((a) => a.id === res.id)!.thread!.length
    expect(lenNow).toBe(res.thread!.length - 1)
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(getState().data.annotations.find((a) => a.id === res.id)!.thread![0].text).toBe(first)
    expect(getState().data.annotations.find((a) => a.id === res.id)!.thread).toHaveLength(res.thread!.length)
  })
  it('Copy the query puts the passage and the question on the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    mount()
    openQueries()
    const a = openAsk()
    await userEvent.click(within(card(a.id)).getByRole('button', { name: 'Copy the query' }))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('“' + a.q + '”\n' + a.text))
  })
})

describe('Script: words and pronunciation', () => {
  it('saving how I say a word updates its status', async () => {
    mount()
    upd((d) => { d.ui.script.tab = 'pron'; d.ui.script.word = 'Knave' })
    expect(screen.getAllByText('Not set').length).toBeGreaterThan(0)
    await userEvent.type(document.getElementById('sayit') as HTMLInputElement, 'nayv-test')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(getState().data.pronunciations.Knave.say).toBe('nayv-test')
    const card = document.querySelector('.wordcard') as HTMLElement
    expect(within(card).getByText('Set')).toBeTruthy()
    const row = document.querySelector('tr[data-w="Knave"]') as HTMLElement
    expect(within(row).getByText('Set')).toBeTruthy()
    expect(within(row).getByText('nayv-test')).toBeTruthy()
  })
  it('a local dictionary shows an inline entry and can be used', async () => {
    mount()
    upd((d) => { d.ui.prefs.dictSource = 'local'; d.ui.script.tab = 'pron'; d.ui.script.word = 'Knave' })
    await userEvent.click(screen.getByRole('button', { name: 'Use' }))
    expect(getState().data.pronunciations.Knave.say).toBe('nayv')
  })
  it('says when the local dictionary is missing and when the online one is offline', async () => {
    mount()
    upd((d) => { d.ui.prefs.dictSource = 'local'; d.mock.dictLocal = 'missing'; d.ui.script.tab = 'pron'; d.ui.script.word = 'Knave' })
    expect(screen.getByText(/is not installed/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Download' }))
    expect(getState().mock.dictLocal).toBe('installed')
    upd((d) => { d.ui.prefs.dictSource = 'api'; d.mock.net = 'offline' })
    expect(screen.getByText(/cannot be reached/)).toBeTruthy()
  })
})

describe('Script: speakers', () => {
  const openPicker = (el: HTMLElement) => {
    const items = contextItemsFor(el, { clientX: 0, clientY: 0 })!
    const it = items.find((i) => 'l' in i && i.l.startsWith('Speaker:')) as { l: string; fn: () => void }
    rtlAct(() => it.fn())
    return it
  }
  it('confirming a suggested speaker marks the phrase confirmed', async () => {
    mount()
    const sug = document.querySelector('.phr-sug[data-spk]:not([data-spk="?"])') as HTMLElement
    expect(sug).not.toBeNull()
    const key = sug.dataset.ph!
    const spk = sug.dataset.spk!
    expect(openPicker(sug).l.endsWith('(suggested)…')).toBe(true)
    await userEvent.click(screen.getByRole('option', { name: new RegExp('Confirm “' + spk + '”') }))
    expect(getState().data.confirmedSpeakers[key]).toBe(spk)
    expect(document.querySelector(`[data-ph="${key}"]`)!.classList.contains('phr-sug')).toBe(false)
  })
  it('the picker suggests people in the chapter first, and searches everyone', async () => {
    mount()
    const ph = [...document.querySelectorAll<HTMLElement>('.phr-sug')][0]
    openPicker(ph)
    expect(screen.getAllByText('In this chapter').length).toBeGreaterThan(0)
    expect(screen.queryByRole('option', { name: /Duchess/ })).toBeNull()
    await userEvent.type(screen.getByLabelText('Search speakers'), 'duch')
    expect(screen.getByRole('option', { name: /Duchess/ })).toBeTruthy()
  })
  it('the picker has no Narrator option, even when searching for it', async () => {
    mount()
    const ph = [...document.querySelectorAll<HTMLElement>('.phr-sug')][0]
    openPicker(ph)
    expect(screen.queryByRole('option', { name: /narrator/i })).toBeNull()
    await userEvent.type(screen.getByLabelText('Search speakers'), 'narr')
    expect(screen.queryByRole('option', { name: /narrator/i })).toBeNull()
    expect(screen.getByText('No speakers match.')).toBeTruthy()
  })
  it('rows show the alias with its Story Bible entry as the secondary text', async () => {
    mount()
    openPicker([...document.querySelectorAll<HTMLElement>('.phr-sug')][0])
    await userEvent.type(screen.getByLabelText('Search speakers'), 'gardeners')
    expect(screen.getByRole('option', { name: /Five.*The gardeners/ })).toBeTruthy()
  })
  it('speaker chips take the colour of their speaker, and the narrator can choose another', () => {
    mount()
    const chip = () => document.querySelector<HTMLElement>('.phr-first[data-spk]:not([data-spk="?"])')!
    const entry = entryOfSpeaker(getState().data, chip().dataset.spk!)!
    const colour = speakerColourOf(entry)
    expect(chip().style.getPropertyValue('--spk-c')).toBe('var(--' + colour + ')')
    expect(chip().style.getPropertyValue('--spk-soft')).toBe('var(--' + colour + '-soft)')
    const other = colour === 'ok' ? 'bad' : 'ok'
    rtlAct(() => setEntryColour(entry.id, other))
    expect(chip().style.getPropertyValue('--spk-c')).toBe('var(--' + other + ')')
  })
})

describe('Script: story bible link', () => {
  it('lookup of an unknown text offers to create an entry, which adds it to the Story Bible', async () => {
    mount()
    const g = { pid: '8-3', s: 0, e: 6, q: 'Zzyzxa' }
    rtlAct(() => lookup(g.q, g))
    expect(getState().ui.script.miss).toBe('Zzyzxa')
    await userEvent.click(screen.getByRole('button', { name: 'Create an entry' }))
    await userEvent.click(screen.getByRole('button', { name: 'Location' }))
    const e = getState().data.bible.find((x) => x.name === 'Zzyzxa')!
    expect(e).toMatchObject({ kind: 'Location', aka: ['Zzyzxa'], user: true })
    expect(getState().ui.script.entryId).toBe(e.id)
    expect(screen.getByRole('heading', { name: 'Zzyzxa' })).toBeTruthy()
  })
  it('the side panel shows the entry read-only; editing happens on the Story Bible page', () => {
    mount()
    upd((d) => { d.ui.script.tab = 'bible'; d.ui.script.entryId = 'alice' })
    expect(screen.queryByLabelText('Description', { selector: 'textarea' })).toBeNull()
    expect(screen.getByLabelText('Description').textContent).toContain('protagonist')
  })
})

describe('Script: chapter boundary', () => {
  it('Mark reviewed clears the flag banner', async () => {
    mount()
    upd((d) => { d.data.chapters.find((c) => c.id === '8')!.flag = { text: 'Text changed.', type: 'text' } })
    expect(screen.getByText('Text changed.')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Mark reviewed' }))
    expect(screen.queryByText('Text changed.')).toBeNull()
    expect(getState().data.chapters.find((c) => c.id === '8')!.flag).toBeUndefined()
  })
  it('Record in Booth opens the Booth on that chapter', async () => {
    mount()
    const btn = document.querySelector('[data-rec="5"]') as HTMLElement
    await userEvent.click(btn)
    expect(getState().ui.page).toBe('booth')
    expect(getState().ui.chapter).toBe('5')
  })
})

describe('Script: no manuscript', () => {
  it('shows the empty state and opens the import once', async () => {
    vi.useFakeTimers()
    const spy = vi.fn()
    const old = modals.importFlow
    modals.importFlow = spy
    upd((d) => { d.mock.hasManuscript = false })
    mount()
    expect(screen.getByText('This project has no manuscript yet. Import one to begin.')).toBeTruthy()
    expect(document.getElementById('scriptpg')).toBeNull()
    vi.runAllTimers()
    expect(spy).toHaveBeenCalledWith('import')
    cleanup()
    mount()
    vi.runAllTimers()
    expect(spy).toHaveBeenCalledTimes(1)
    modals.importFlow = old
  })
})
