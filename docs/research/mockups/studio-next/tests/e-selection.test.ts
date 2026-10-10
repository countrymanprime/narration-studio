import { beforeEach, describe, expect, it } from 'vitest'
import { curTime, cutLength, origTime, takeShift } from '@/selectors/cuts'
import { buildDoc, rangeKeys, scriptSpan, selKeys, stepFlag, stepKey, stepPhrase, summarize, flagged, itemAt, laterAudio, firstFrom } from '@/selectors/scriptedit'
import { clickWord, extendSel, moveCursor, selectBetween, selectedKeys, selectKeys , clearSel } from '@/state/commands/scriptedit'
import { createInitialState, getState, resetState } from '@/state/store'

beforeEach(() => { const s = createInitialState({ prefs: undefined }); s.ui.page = 'editing'; s.ui.chapter = '5'; resetState(s) })
const doc = () => buildDoc(getState().data, '5')

describe('selection model', () => {
  it('a selection is a run of whole words in the order of the text, whichever way it was dragged', () => {
    const d = doc()
    expect(rangeKeys(d, '5-3:x0', '5-3:x3')).toEqual(['5-3:x0', '5-3:x1', '5-3:x2', '5-3:x3'])
    expect(rangeKeys(d, '5-3:x3', '5-3:x0')).toEqual(['5-3:x0', '5-3:x1', '5-3:x2', '5-3:x3'])
    expect(rangeKeys(d, '5-3:16', '5-3:x1')).toEqual(['5-3:16', '5-3:x0', '5-3:x1'])
    expect(rangeKeys(d, 'nope', '5-3:x1')).toEqual([])
    expect(selKeys(d, null)).toEqual([])
    expect(selKeys(d, { anchor: '5-3:x0', head: '5-3:x1' })).toEqual(['5-3:x0', '5-3:x1'])
  })
  it('a selection can cross paragraphs', () => {
    const d = doc()
    const keys = rangeKeys(d, '5-2:5', '5-3:1')
    expect(keys[0]).toBe('5-2:5')
    expect(keys.at(-1)).toBe('5-3:1')
    expect(new Set(keys.map((k) => k.split(':')[0]))).toEqual(new Set(['5-2', '5-3']))
  })
  it('steps a word, a phrase and to the next flagged word, and stays inside the text at the ends', () => {
    const d = doc()
    expect(stepKey(d, null, 1)).toBe(d.items[0].key)
    expect(stepKey(d, null, -1)).toBe(d.items.at(-1)!.key)
    expect(stepKey(d, '5-3:16', 1)).toBe('5-3:x0')
    expect(stepKey(d, d.items[0].key, -1)).toBe(d.items[0].key)
    expect(stepKey(d, d.items.at(-1)!.key, 1)).toBe(d.items.at(-1)!.key)
    const next = stepPhrase(d, '5-3:0', 1)!
    expect(d.items[d.index.get(next)!].uKey).not.toBe(d.items[d.index.get('5-3:0')!].uKey)
    expect(stepPhrase(d, next, -1)).toBe('5-3:0')
    expect(stepFlag(d, null, 1)).toBe('5-3:14')
    expect(stepFlag(d, '5-3:14', 1)).toBe('5-3:x0')
    expect(stepFlag(d, '5-3:14', -1)).toBe(flagged(d).at(-1)!.key)
    expect(flagged(d).filter((i) => i.pid === '5-3').map((i) => i.key)).toEqual(['5-3:14', '5-3:x0', '5-3:31', '5-3:x4', '5-3:40'])
  })
  it('finds the word at a time, and the first heard word from a cursor', () => {
    const d = doc()
    const it = d.items[d.index.get('5-3:20')!]
    expect(itemAt(d, it.t0! + 0.01)!.key).toBe('5-3:20')
    expect(firstFrom(d, '5-3:40')!.key).not.toBe('5-3:40')
  })
  it('commands: a click places the cursor, Shift extends from it, a drag selects, Escape clears', () => {
    clickWord('5-3:20')
    expect(getState().ui.editing).toMatchObject({ cursor: '5-3:20', sel: null })
    clickWord('5-3:23', true)
    expect(getState().ui.editing.sel).toEqual({ anchor: '5-3:20', head: '5-3:23' })
    expect(selectedKeys()).toHaveLength(4)
    selectBetween('5-3:x0', '5-3:x2')
    expect(selectedKeys()).toEqual(['5-3:x0', '5-3:x1', '5-3:x2'])
    expect(clearSel()).toBe(true)
    expect(getState().ui.editing.sel).toBeNull()
    expect(clearSel()).toBe(false)
  })
  it('moving the cursor with a selection starts from its end; extending past the ends stays in the text', () => {
    selectBetween('5-3:20', '5-3:22')
    moveCursor(1)
    expect(getState().ui.editing).toMatchObject({ cursor: '5-3:23', sel: null })
    extendSel(1)
    extendSel(1)
    expect(getState().ui.editing.sel).toEqual({ anchor: '5-3:23', head: '5-3:25' })
    selectKeys([])
    expect(getState().ui.editing.sel).toEqual({ anchor: '5-3:23', head: '5-3:25' })
  })
  it('moving to a passage’s line selects that passage for the takes', () => {
    clickWord('5-9:3')
    expect(getState().ui.editing.passage).toBe('ps5-9')
    clickWord('5-2:1')
    expect(getState().ui.editing.passage).toBe('ps5-9')
  })
})

describe('what a selection comes to', () => {
  it('the time range of words that were said and are not written, snapped, with the same range from the take’s start', () => {
    const d = doc()
    const sum = summarize(getState().data, d, rangeKeys(d, '5-3:x0', '5-3:x3'))
    expect(sum.allExtra).toBe(true)
    expect(sum.audible).toHaveLength(4)
    expect(sum.words).toBe('um, sorry, one second')
    const r = sum.ranges[0]
    expect(sum.ranges).toHaveLength(1)
    expect(r.takeId).toBe('T05-5')
    const first = d.items[d.index.get('5-3:x0')!]
    const last = d.items[d.index.get('5-3:x3')!]
    expect(Math.abs(r.start - first.t0!)).toBeLessThanOrEqual(0.0021)
    expect(Math.abs(r.end - last.t1!)).toBeLessThanOrEqual(0.0021)
    expect(r.off0).toBeCloseTo(first.off0!, 3)
    expect(r.a).toBeCloseTo(r.start, 3)
    expect(sum.len).toBeCloseTo(r.end - r.start, 3)
  })
  it('a pad moves both ends inward so less of the audio is cut', () => {
    const d = doc()
    const keys = rangeKeys(d, '5-3:x0', '5-3:x3')
    const a = summarize(getState().data, d, keys, 0).len
    const b = summarize(getState().data, d, keys, 100).len
    expect(a - b).toBeGreaterThan(0.19)
  })
  it('counts low-confidence words, leaves out words that were not read, and has one range for each paragraph', () => {
    const d = doc()
    const sum = summarize(getState().data, d, rangeKeys(d, '5-3:13', '5-3:16'))
    expect(sum.low).toBe(1)
    expect(sum.allExtra).toBe(false)
    const across = summarize(getState().data, d, rangeKeys(d, '5-3:38', '5-4:2'))
    expect(across.ranges.map((r) => r.pid)).toEqual(['5-3', '5-4'])
    // "several" was not read: it has no audio to cut.
    const miss = summarize(getState().data, d, ['5-3:40'])
    expect(miss.audible).toHaveLength(0)
    expect(miss.ranges).toHaveLength(0)
  })
  it('spans of the script for a note: only words that are written count', () => {
    const d = doc()
    const para = getState().data.paragraphs.find((p) => p.id === '5-3')!
    const items = rangeKeys(d, '5-3:13', '5-3:x1').map((k) => d.items[d.index.get(k)!])
    const g = scriptSpan(para, items)!
    expect(g.q).toBe(para.text.slice(g.s, g.e))
    expect(g.q.split(/\s+/).length).toBe(items.filter((i) => i.kind === 'w').length)
    expect(scriptSpan(para, [d.items[d.index.get('5-3:x0')!]])).toBeNull()
  })
  it('says where the audio after a range goes', () => {
    const d = doc()
    const sum = summarize(getState().data, d, rangeKeys(d, '5-3:x0', '5-3:x3'))
    const later = laterAudio(d, sum.ranges[0])!
    expect(later.before - later.after).toBeCloseTo(sum.len, 2)
  })
})

describe('where a cut puts the audio', () => {
  const cuts = [{ a: 10, b: 12, mode: 'close' as const }, { a: 30, b: 31, mode: 'close' as const }, { a: 50, b: 55, mode: 'gap' as const }]
  it('moves everything after a closed cut up by its length, and nothing for a cut that leaves a gap', () => {
    expect(curTime(cuts, 5)).toBe(5)
    expect(curTime(cuts, 10)).toBe(10)
    expect(curTime(cuts, 11)).toBe(10)
    expect(curTime(cuts, 12)).toBe(10)
    expect(curTime(cuts, 20)).toBe(18)
    expect(curTime(cuts, 40)).toBe(37)
    expect(curTime(cuts, 52)).toBe(49)
    expect(cutLength(cuts)).toBe(3)
  })
  it('puts a time back to where it was before any cut, whichever order the cuts were made in', () => {
    for (const t of [5, 10, 18, 27, 37, 49]) expect(curTime(cuts, origTime(cuts, t))).toBeCloseTo(t, 9)
    expect(origTime(cuts, 18)).toBe(20)
    expect(origTime(cuts, 37)).toBe(40)
    expect(origTime([...cuts].reverse(), 37)).toBe(40)
  })
  it('moves words after a cut inside the same take', () => {
    const c = [{ a: 0, b: 2, mode: 'close' as const, takeId: 't', off0: 3, off1: 5 }, { a: 0, b: 1, mode: 'gap' as const, takeId: 't', off0: 8, off1: 9 }] as never[]
    expect(takeShift(c, 't', 4)).toBe(0)
    expect(takeShift(c, 't', 5)).toBe(2)
    expect(takeShift(c, 't', 9)).toBe(2)
    expect(takeShift(c, 'u', 9)).toBe(0)
  })
})
