import { useEffect, useMemo, useRef, useState } from 'react'
import { reEsc } from '@/format/text'
import { phrasesOf } from '@/selectors/phrases'
import { candidateOf, NARRATOR, speakerCandidates, UNKNOWN_SPEAKER, type SpeakerCandidate } from '@/selectors/speakers'
import { setSpeaker } from '@/state/commands/script'
import { getState } from '@/state/store'
import { closePop, openPopoverAt } from './overlay'
import { Input, Swatch } from '@/ui/primitives'

/** Speakers worth suggesting for a phrase: aliases that speak in its chapter, or are named in its text. */
export function speakersInChapter(key: string): SpeakerCandidate[] {
  const { data } = getState()
  const pid = key.split(':')[0]
  const chapterId = data.paragraphs.find((p) => p.id === pid)?.chapterId
  if (!chapterId) return []
  const paras = data.paragraphs.filter((p) => p.chapterId === chapterId)
  const text = paras.map((p) => p.text).join(' ')
  const spoken = new Set<string>()
  paras.forEach((p) => phrasesOf(p, data).forEach((ph) => { if (ph.q && ph.spk !== UNKNOWN_SPEAKER) spoken.add(ph.spk) }))
  return speakerCandidates(data).filter((c) => spoken.has(c.alias) || new RegExp('\\b' + reEsc(c.alias) + '\\b', 'i').test(text))
}

function Picker({ phraseKey, cur, confirmed }: { phraseKey: string; cur: string; confirmed: boolean }) {
  const [q, setQ] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.focus(), [])
  const data = getState().data
  const here = useMemo(() => speakersInChapter(phraseKey), [phraseKey])
  const term = q.trim().toLowerCase()
  const list = term
    ? speakerCandidates(data).filter((c) => c.alias.toLowerCase().includes(term) || c.entryName.toLowerCase().includes(term))
    : here
  const choose = (alias: string): void => { setSpeaker(phraseKey, alias); closePop() }
  const rows: Array<{ code: string; text: string; sub?: string; on: boolean; colour?: string }> = []
  if (!term && cur !== UNKNOWN_SPEAKER && cur !== NARRATOR && !confirmed) rows.push({ code: cur, text: 'Confirm “' + cur + '”', on: false, colour: candidateOf(data, cur)?.speakerColour })
  list.forEach((c) => rows.push({ code: c.alias, text: c.alias, sub: c.entryName, on: cur === c.alias && confirmed, colour: c.speakerColour }))
  return (
    <div className="stack" style={{ gap: 6, minWidth: 280 }}>
      <Input ref={ref} type="text" id="spk-q" role="combobox" aria-expanded="true" aria-controls="spk-l" placeholder="Search speakers" aria-label="Search speakers" autoComplete="off" value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); const f = rows[0]; if (f) choose(f.code) }
          else if (e.key === 'Escape') { e.stopPropagation(); closePop() }
        }} />
      <div className="label" style={{ padding: '2px 4px' }}>{term ? 'Matches' : 'In this chapter'}</div>
      <div id="spk-l" role="listbox" style={{ maxHeight: 240, overflow: 'auto' }}>
        {rows.length ? rows.map((r) => (
          <button key={r.code + r.text} type="button" className="item" role="option" aria-selected={r.on} data-spk-pick={r.code} onClick={() => choose(r.code)}>
            <span style={{ width: 16, flex: 'none' }}>{r.on ? '✓' : ''}</span>
            {r.colour ? <Swatch colour={r.colour} /> : null}
            <span style={{ flex: 1 }}>{r.text}</span>
            {r.sub ? <span className="sub">{r.sub}</span> : null}
          </button>
        )) : <div className="sub" style={{ padding: 8 }}>No speakers match.</div>}
      </div>
    </div>
  )
}

/** Who says this phrase. Opens at a point (a click in the reader) or under an element (a chip in the Booth). */
export function openSpeakerPicker(at: HTMLElement | { x: number; y: number }, phraseKey: string, cur: string, confirmed: boolean): void {
  const z = getState().ui.prefs.zoom || 1
  const render = () => <Picker phraseKey={phraseKey} cur={cur} confirmed={confirmed} />
  if (at instanceof HTMLElement) {
    const r = at.getBoundingClientRect()
    openPopoverAt(r.left / z, r.bottom / z + 6, render, '', at)
  } else openPopoverAt(at.x, at.y, render, '')
}
