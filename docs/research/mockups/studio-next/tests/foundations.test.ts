import { describe, expect, it } from 'vitest'
import { makeBook } from '@/fixtures/book'
import { chapterName, chapterTag, roman } from '@/format/headings'
import { calc, vals } from '@/selectors/progress'
import { pickupList, openPickups } from '@/selectors/pickups'
import { masterFails } from '@/selectors/master'
import { activeLimits } from '@/selectors/progress'
import { phrasesOf } from '@/selectors/phrases'
import { appearsIn } from '@/selectors/bible'
import { act, createInitialState, getState, resetState, undoEntry, undoLast } from '@/state/store'
import { chName } from '@/selectors/chapters'

describe('headings: one formatter per idea', () => {
  it('formats the three manuscript styles', () => {
    const b = makeBook()
    const c = b.chapters.find((x) => x.id === '7')!
    expect(chapterName(c, 'gutenberg')).toBe('CHAPTER VII. A Mad Tea-Party')
    expect(chapterName(c, 'numbered')).toBe('7. A Mad Tea-Party')
    expect(chapterName(c, 'colon')).toBe('Chapter 7: A Mad Tea-Party')
    expect(chapterTag(c, 'gutenberg')).toBe('CHAPTER VII')
    expect(roman(12)).toBe('XII')
  })
  it('credits have no label', () => {
    const b = makeBook()
    expect(chName(b, b.chapters[0])).toBe('Opening credits')
  })
})

describe('fixtures', () => {
  it('parse through the schemas, with sample chapters when asked', () => {
    expect(makeBook().chapters).toHaveLength(14)
    expect(makeBook({ chapters: 40 }).chapters).toHaveLength(42)
  })
  it('derive pickups from queued lines and proof notes', () => {
    const b = makeBook()
    expect(pickupList(b).map((x) => x.id).sort()).toEqual(['c3a', 'c3b', 'c3c', 'p1', 'p2', 'p4', 'p9'])
    expect(openPickups(b, '3')).toBe(3)
    expect(openPickups(b, '5')).toBe(4)
  })
})

describe('selectors', () => {
  it('derive stage values from the data behind them', () => {
    const b = makeBook()
    // 10 notes: 5 decided, but only the waived one is cleared (the four pickups are not redone yet).
    expect(vals(b, b.chapters.find((c) => c.id === '5')!).proof).toBe(10)
    const v4 = vals(b, b.chapters.find((c) => c.id === '4')!)
    expect(v4.master).toBe(true)
    // Ch 4 fails two checks (noise floor and room tone at the start), so the QC cell says FAIL, not one check's name.
    expect(v4.qc).toBe('FAIL')
    expect(vals(b, b.chapters.find((c) => c.id === '3')!).master).toBe(false)
  })
  it('totals the book', () => {
    const k = calc(makeBook())
    expect(k.W).toBe(29222)
    expect(k.pass).toBe(3)
    expect(k.fail).toBe(1)
  })
  it('checks master rows against the limits', () => {
    const b = makeBook()
    const limits = activeLimits(b)
    expect(masterFails(b.masterRows.find((r) => r.id === '4')!, limits)).toEqual(['nf', 'head'])
  })
  it('suggests speakers from "said X"', () => {
    const b = makeBook()
    const p = b.paragraphs.find((x) => x.id === '8-2')!
    const ph = phrasesOf(p, { bible: b.bible, bibleTypes: b.bibleTypes, confirmedSpeakers: {} }).filter((x) => x.q)
    expect(ph.map((x) => x.spk)).toEqual(['Five', 'Five'])
  })
  it('counts where an entry appears', () => {
    const b = makeBook()
    const e = b.bible.find((x) => x.id === 'queen-of-hearts')!
    expect(appearsIn(b, e).map((c) => c.id)).toContain('8')
  })
})

describe('store and undo', () => {
  it('records an undoable change and undoes it', () => {
    resetState(createInitialState())
    const before = getState().data.proofNotes.find((n) => n.id === 3)!.res
    act('Decision', (d) => { d.data.proofNotes.find((n) => n.id === 3)!.res = 'waive' })
    expect(getState().data.proofNotes.find((n) => n.id === 3)!.res).toBe('waive')
    expect(undoLast().ok).toBe(true)
    expect(getState().data.proofNotes.find((n) => n.id === 3)!.res).toBe(before)
  })
  it('refuses to undo a DAW change that is no longer last', () => {
    resetState(createInitialState())
    const e1 = act('Trim', (d) => { d.data.proofNotes.find((n) => n.id === 5)!.res = 'fixed' }, { daw: true })
    act('Other', (d) => { d.data.proofNotes.find((n) => n.id === 6)!.res = 'waive' })
    expect(undoEntry(e1).ok).toBe(false)
  })
  it('refuses when REAPER’s own last action is something else', () => {
    resetState(createInitialState())
    const e = act('Trim', (d) => { d.data.proofNotes.find((n) => n.id === 5)!.res = 'fixed' }, { daw: true })
    resetState({ ...getState(), mock: { ...getState().mock, reaperTop: 'other' } })
    expect(undoEntry(e).ok).toBe(false)
  })
})

import { stripTags as stripTagsForTest } from '../src/format/text'
describe('stripTags', () => {
  it('removes tags, including nested ones that would rebuild a tag', () => {
    expect(stripTagsForTest('a <em>b</em> c')).toBe('a b c')
    expect(stripTagsForTest('<scr<script>ipt>x')).toBe('iptx')
    expect(stripTagsForTest('1 < 2 > 0')).toBe('1  0')
    expect(stripTagsForTest('a < b')).toBe('a  b')
  })
})
