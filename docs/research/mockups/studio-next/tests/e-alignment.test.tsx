import { act as rtlAct, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HeardEdit } from '@/fixtures/alignment'
import { alignment, createMockAlignment, setAlignmentProvider, type HeardWord } from '@/providers/alignment'
import { alignToScript, buildDoc, flagOf, flagged, isLow } from '@/selectors/scriptedit'
import { createInitialState, getState, resetState, update } from '@/state/store'
import { OverlayHost } from '@/ui/OverlayHost'
import EditingPage from '@/pages/Editing'
import '@/pages'

const reset = (chapter = '5') => { const s = createInitialState({ prefs: undefined }); s.ui.page = 'editing'; s.ui.chapter = chapter; resetState(s) }
const doc = (chapter = '5') => buildDoc(getState().data, chapter)
const w = (text: string, conf = 0.95): HeardWord => ({ text, off0: 0, off1: 0.2, conf })
const original = alignment()
beforeEach(() => reset())
afterEach(() => { cleanup(); setAlignmentProvider(original) })

describe('setting what was heard against the script', () => {
  it('matches words ignoring case and punctuation; words only on one side are extra, not read, or a misread', () => {
    const ops = alignToScript(['The', 'cat,', 'sat', 'down.'], [w('the'), w('um'), w('cat'), w('sad'), w('down')])
    expect(ops.map((o) => (o.kind === 'x' ? 'x:' + o.heard.text : o.st + ':' + o.i))).toEqual(['ok:0', 'x:um', 'ok:1', 'mis:2', 'ok:3'])
    const miss = alignToScript(['a', 'b', 'c'], [w('a'), w('c')])
    expect(miss.map((o) => (o.kind === 'x' ? 'x' : o.st))).toEqual(['ok', 'miss', 'ok'])
    // Equal numbers pair in order; with unequal numbers the words that look alike are paired, and the rest are left over.
    const mixed = alignToScript(['one', 'cat', 'end'], [w('one'), w('cap'), w('zebra'), w('end')])
    expect(mixed.map((o) => (o.kind === 'x' ? 'x:' + o.heard.text : o.st + ':' + (o.heard?.text ?? ''))).join(' ')).toBe('ok:one mis:cap x:zebra ok:end')
    const drop = alignToScript(['one', 'three', 'cat', 'end'], [w('one'), w('cap'), w('end')])
    expect(drop.map((o) => (o.kind === 'x' ? 'x' : o.st + ':' + (o.heard?.text ?? ''))).join(' ')).toBe('ok:one miss: mis:cap ok:end')
  })
  it('the mock provider builds a transcript from the text and the sample data: words with start, end and confidence, timed inside the take', () => {
    const h = alignment().heard({ id: 'T05-5', text: getState().data.passages.find((p) => p.id === 'ps5-3')!.takes[1].text, len: 17 })!
    expect(h.len).toBe(17)
    expect(h.words.length).toBeGreaterThan(30)
    h.words.forEach((x, i) => {
      expect(x.off1).toBeGreaterThan(x.off0)
      if (i) expect(x.off0).toBeGreaterThanOrEqual(h.words[i - 1].off1)
      expect(x.conf).toBeGreaterThan(0)
      expect(x.conf).toBeLessThanOrEqual(1)
    })
    expect(h.words[0].off0).toBeGreaterThanOrEqual(0)
    expect(h.words.at(-1)!.off1).toBeLessThanOrEqual(17)
    expect(h.words.filter((x) => x.added).map((x) => x.text)).toEqual(['um,', 'sorry,', 'one', 'second,', 'so,'])
    expect(h.words.find((x) => x.text === 'mourning,')!.conf).toBe(0.54)
  })
  it('answers null while nothing has been transcribed', () => {
    update((d) => { d.mock.alignment = 'none' })
    expect(alignment().heard({ id: 'x', text: 'one two' })).toBeNull()
    const d = doc()
    expect(d.aligned).toBe(false)
    expect(d.items.every((i) => i.t0 === null && i.st === 'ok')).toBe(true)
  })
  it('can produce extra words, missing words, misreads and low confidence from its sample data, so every state can be shown', () => {
    const p = createMockAlignment({ t: [{ op: 'add', at: 1, words: 'er', conf: 0.9 }, { op: 'drop', at: 2 }, { op: 'sub', at: 3, heard: 'cap', conf: 0.5 }, { op: 'low', at: 0, conf: 0.4 }] }, () => [])
    const h = p.heard({ id: 't', text: 'one two three cat end' })!
    const ops = alignToScript(['one', 'two', 'three', 'cat', 'end'], h.words)
    expect(ops.map((o) => (o.kind === 'x' ? 'extra' : o.st))).toEqual(['ok', 'extra', 'ok', 'miss', 'mis', 'ok'])
    expect(h.words[0].conf).toBe(0.4)
    expect(() => HeardEdit.parse({ op: 'drop', at: 1 })).not.toThrow()
  })
  it('snaps a cut point to a zero crossing within 2 ms', () => {
    for (const t of [12.3456, 166.5, 200]) expect(Math.abs(alignment().snap(t) - t)).toBeLessThanOrEqual(0.0035)
  })
})

describe('the chapter, set against what was heard', () => {
  it('Chapter V: extra words, a word not read, misreads and low confidence come from the provider, with stable ids', () => {
    const d = doc()
    expect(d.aligned).toBe(true)
    // Six runs said and not written; "several" not read; "morning" and "isn't" misread; four words the recogniser was unsure of.
    expect(d.counts).toEqual({ extra: 6, miss: 1, mis: 2, low: 4 })
    const p3 = d.paras.find((p) => p.p.id === '5-3')!
    expect(p3.items.filter((i) => i.st === 'extra').map((i) => i.key + ':' + i.text)).toEqual(['5-3:x0:um,', '5-3:x1:sorry,', '5-3:x2:one', '5-3:x3:second,', '5-3:x4:so,'])
    const mis = p3.items.find((i) => i.st === 'mis')!
    expect([mis.text, mis.heard, mis.conf]).toEqual(['morning,', 'mourning,', 0.54])
    expect(p3.items.find((i) => i.st === 'miss')!.text).toBe('several')
    expect(p3.items.find((i) => i.text === 'hardly')!.conf).toBe(0.62)
    expect(isLow(p3.items.find((i) => i.text === 'hardly')!)).toBe(true)
    // The keys are the same every time the document is built.
    expect(doc().items.map((i) => i.key)).toEqual(d.items.map((i) => i.key))
  })
  it('every heard word has a start and an end that follow each other, in the take it was heard in', () => {
    const d = doc()
    const p3 = d.paras.find((p) => p.p.id === '5-3')!
    const timed = p3.items.filter((i) => i.t0 != null && i.st !== 'miss')
    timed.forEach((i, k) => { expect(i.t1!).toBeGreaterThan(i.t0!); if (k) expect(i.t0!).toBeGreaterThanOrEqual(timed[k - 1].t1! - 1e-6) })
    // The take began at 164.0 s; the words that are in it are timed inside it.
    const take = p3.take!
    const inTake = p3.items.filter((i) => i.takeId === take.id && i.t0 != null && i.off0! >= 0 && i.st !== 'miss')
    inTake.forEach((i) => { expect(i.t0!).toBeGreaterThanOrEqual(take.start - 1e-3); expect(i.t1!).toBeLessThanOrEqual(take.start + take.len + 1e-3) })
    expect(p3.start).toBeLessThan(take.start)
  })
  it('works for other chapters through the same provider: Chapter III shows what the speech check found, Chapter VII only what was recorded', () => {
    const c3 = doc('3')
    expect(c3.counts.miss).toBe(5)
    expect(c3.counts.mis).toBeGreaterThanOrEqual(1)
    const c7 = doc('7')
    expect(c7.paras.filter((p) => p.recorded).length).toBeGreaterThan(0)
    expect(c7.paras.filter((p) => !p.recorded).length).toBeGreaterThan(0)
    expect(c7.paras.find((p) => !p.recorded)!.items.every((i) => i.t0 === null)).toBe(true)
    const c8 = doc('8')
    expect(c8.items.every((i) => i.t0 === null)).toBe(true)
  })
  it('a swapped provider changes what the screen shows, with no change to the screen', () => {
    setAlignmentProvider(createMockAlignment({ '5-2': [{ op: 'add', at: 0, words: 'right then', conf: 0.9 }] }, () => []))
    const d = doc()
    expect(d.items.filter((i) => i.st === 'extra' && i.pid === '5-2').map((i) => i.text)).toEqual(['right', 'then'])
    // The sample's other differences are gone with the sample; only what the take itself reads twice is left.
    expect(d.counts).toEqual({ extra: 2, miss: 0, mis: 0, low: 0 })
  })
  it('switching the active take aligns the words to that take: a take that stopped leaves the rest not read', () => {
    update((d) => { const p = d.data.passages.find((x) => x.id === 'ps5-3')!; p.takes.forEach((t) => { t.active = t.id === 'T05-4' }) })
    const p3 = doc().paras.find((p) => p.p.id === '5-3')!
    expect(p3.take!.id).toBe('T05-4')
    expect(p3.items.filter((i) => i.st === 'miss').length).toBeGreaterThan(8)
    expect(p3.items.find((i) => i.text === 'hardly')!.t0).toBeGreaterThan(150.2)
    expect(p3.items.find((i) => i.st === 'extra')).toBeUndefined()
  })
  it('a second read of the line is a run of extra words marked as such, and cut words and kept additions stop being flagged', () => {
    const d = doc()
    const p15 = d.paras.find((p) => p.p.id === '5-15')!
    expect(p15.items.filter((i) => i.dup).map((i) => i.text)).toEqual(['“Serpent!”', 'screamed', 'the', 'Pigeon.'])
    const run = flagged(d, 'extra').find((i) => i.key === '5-15:x0')!
    expect(flagOf(run)).toBe('extra')
    update((x) => { x.data.accepted.push('5-15:x0', '5-15:x1', '5-15:x2', '5-15:x3') })
    expect(flagged(doc(), 'extra').some((i) => i.pid === '5-15')).toBe(false)
    expect(doc().counts.extra).toBe(5)
  })
})

describe('the script as the page draws it', () => {
  it('marks extra words, a word not read, a misread and a low-confidence word, and counts them in the legend', () => {
    render(<><OverlayHost /><EditingPage /></>)
    const k = (key: string) => document.querySelector(`[data-k="${key}"]`) as HTMLElement
    expect(k('5-3:x0').className).toContain('xw')
    expect(k('5-3:x0').textContent).toBe('um,')
    expect(k('5-3:x0').getAttribute('title')).toMatch(/^Not in the script · \d\d:\d\d\.\d · 93%$/)
    expect(document.querySelector('[data-k="5-3:40"]')!.className).toContain('st-miss')
    expect(document.querySelector('.st-mis')!.getAttribute('title')).toBe('Heard “mourning” · 54%')
    expect(k('5-3:14').className).toContain('low')
    expect(k('5-3:14').getAttribute('title')).toBe('Low confidence 62%')
    expect(document.querySelector('[data-legend="extra"]')!.textContent).toBe('Extra')
  })
  it('says the recogniser has not run yet, and draws plain text with no marks', () => {
    update((d) => { d.mock.alignment = 'none' })
    render(<><OverlayHost /><EditingPage /></>)
    expect(screen.getByText('Not transcribed yet')).toBeInTheDocument()
    expect(document.querySelector('.xw')).toBeNull()
    expect(document.querySelector('.st-mis')).toBeNull()
  })
  it('names what flags the words in the header', () => {
    render(<><OverlayHost /><EditingPage /></>)
    expect(document.querySelector('#legend')!.getAttribute('aria-label')).toContain('Flagged by Whisper with word timestamps')
    rtlAct(() => {})
  })
})
