import { useEffect, useState } from 'react'
import { pronOfWord, pronStatus, wordsInChapter } from '@/selectors/bible'
import { pronunciation } from '@/providers/pronunciation'
import { setPronSource } from '@/state/commands/pronunciation'
import { PronSourceTag } from '@/ui/PronSource'
import { addWord, saveSay } from '@/state/commands/script'
import { setPrefs } from '@/state/commands/prefs'
import { update, useData, useUi } from '@/state/store'
import { openMenu } from '@/ui/Menu'
import { toast } from '@/ui/overlay'
import { Btn, IconButton, Input } from '@/ui/primitives'
import { DICT_SOURCES, DictBlock, ExtLinks } from './Dict'

function WordCard({ w }: { w: string }) {
  const data = useData()
  const P = data.pronunciations[w]
  const st = pronStatus(data, w)
  const src = pronOfWord(data, w).src
  const [say, setSay] = useState(P?.say ?? '')
  useEffect(() => setSay(P?.say ?? ''), [P?.say])
  const save = (v = say): void => saveSay(w, v)
  const defs = useUi().prefs.dictSource
  const definitionSource = pronunciation().sources().find((x) => x.definitions === defs)?.id
  return (
    <div className="wordcard">
      <div className="row">
        <h3>{w}</h3><span className={'pill ' + (st === 'Set' ? 'ok' : 'neutral')}>{st}</span><span className="spacer" />
        <IconButton icon="speaker" tip="Hear the reference clip" data-pl onClick={() => toast('Playing “' + w + '” reference clip')} />
        <IconButton icon="record" className="rec" tip="Record my own clip" tipSide="r" data-rm onClick={() => toast('Recording your own pronunciation')} />
      </div>
      <div className="row">
        <label className="label" htmlFor="sayit">How I will say it</label><span className="spacer" />
        <PronSourceTag src={src} label="Source of the pronunciation" onPick={(id) => setPronSource({ kind: 'word', word: w }, id)} />
      </div>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <Input
          type="text" id="sayit" value={say} placeholder="for example: kroh-KAY" onChange={(e) => setSay(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save() }}
        />
        <Btn id="saysave" onClick={() => save()}>Save</Btn>
      </div>
      <DictBlock w={w} onUse={(v) => { setSay(v); saveSay(w, v, definitionSource) }} />
      <div className="label">Look up on the web</div>
      <ExtLinks w={w} />
      {P ? null : <div><IconButton icon="plus" tip="Add to my words" id="addword" onClick={() => addWord(w)} /></div>}
    </div>
  )
}

export function WordsTab({ chId }: { chId: string }) {
  const data = useData()
  const ui = useUi()
  const w = ui.script.word
  const list = wordsInChapter(data, chId)
  const pick = (k: string): void => update((d) => { d.ui.script.word = k })
  return (
    <>
      <div className="row">
        <span className="label">Definitions from</span><span className="spacer" />
        <Btn
          id="dsrc" title="Definition source" data-keeppop
          onClick={(e) => openMenu(e.currentTarget, Object.entries(DICT_SOURCES).map(([v, l]) => ({ v, l })), ui.prefs.dictSource, (v) => setPrefs({ dictSource: v as keyof typeof DICT_SOURCES }))}
        >Source: {DICT_SOURCES[ui.prefs.dictSource]}</Btn>
      </div>
      {w ? <WordCard key={w} w={w} /> : null}
      <div className="label">In this chapter</div>
      {list.length ? (
        <div className="tblwrap">
          <table>
            <thead><tr><th>Word</th><th>Say it</th><th>Status</th></tr></thead>
            <tbody>
              {list.map((k) => {
                const st = pronStatus(data, k)
                return (
                  <tr key={k} tabIndex={0} data-w={k} aria-selected={w === k} onClick={() => pick(k)} onKeyDown={(e) => { if (e.key === 'Enter') pick(k) }}>
                    <td><b>{k}</b></td>
                    <td className="mono" style={{ fontSize: 12 }}>
                      <span className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>{data.pronunciations[k]?.say ? <PronSourceTag src={pronOfWord(data, k).src} iconOnly /> : null}<span>{data.pronunciations[k]?.say || '—'}</span></span>
                    </td>
                    <td><span className={'pill ' + (st === 'Set' ? 'ok' : 'neutral')}>{st}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : <div className="sub">No words marked for pronunciation in this chapter.</div>}
    </>
  )
}
