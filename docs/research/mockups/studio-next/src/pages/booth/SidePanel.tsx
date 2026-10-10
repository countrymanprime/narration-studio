import { memo, useMemo } from 'react'
import type { BookData, Pickup } from '@/domain/schemas'
import { mmss } from '@/format/time'
import { stripTags } from '@/format/text'
import { entryById, pronStatus, sayOf, softOf, typeColour } from '@/selectors/bible'
import { annById, annMessages, markOf } from '@/selectors/annotations'
import { entryOfSpeaker, speakerVars, UNKNOWN_SPEAKER } from '@/selectors/speakers'
import { chTag } from '@/selectors/chapters'
import { isDone } from '@/selectors/pickups'
import type { BoothUnit } from '@/selectors/booth'
import { dismissSuspected, jumpPick, openEntryInBible } from '@/state/commands/booth'
import { suspectedLines } from '@/selectors/booth'
import { useStudio } from '@/state/store'
import { toast } from '@/ui/overlay'
import { IconButton } from '@/ui/primitives'

/** What the narrator clicked in the text: the Story Bible entry and/or the note on it, read-only. */
function Reference({ data, entryId, annId }: { data: BookData; entryId: string | null; annId: string | null }) {
  const entry = entryById(data, entryId)
  const ann = annById(data, annId)
  if (!entry && !ann) return null
  const c = entry ? typeColour(data, entry.kind) : 'faint'
  return (
    <div className="stack bref" style={{ gap: 8 }} id="bref">
      <span className="bl">Reference</span>
      {entry ? (
        <div className="stack" style={{ gap: 8 }} data-ref="entry">
          <div className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
            <b className="bref-name">{entry.name}</b>
            <span className="pill" style={{ background: 'var(--' + softOf(c) + ')', color: 'var(--' + c + ')' }}>{entry.kind}</span>
            <span style={{ flex: 1 }} />
            <IconButton icon="book" tip="Open in Story Bible" tipSide="l" data-bopen={entry.id} onClick={() => openEntryInBible(entry.id)} />
          </div>
          <div style={{ whiteSpace: 'pre-wrap', color: entry.sum ? 'var(--bfg)' : 'var(--bdim)' }}>{entry.sum || '—'}</div>
          {entry.kind === 'Character' ? (
            <div className="stack" style={{ gap: 3 }}>
              <span className="bl">How they talk</span>
              <div style={{ whiteSpace: 'pre-wrap', color: entry.voice ? 'var(--bfg)' : 'var(--bdim)' }}>{entry.voice || '—'}</div>
            </div>
          ) : null}
          <div className="stack" style={{ gap: 3 }}>
            <span className="bl">Names</span>
            {entry.aka.map((a) => <div className="brow" key={a}><span style={{ flex: 1 }}>{a}</span><span className="mono">{sayOf(entry, a) || '—'}</span></div>)}
          </div>
        </div>
      ) : null}
      {ann ? (
        <div className="stack" style={{ gap: 6 }} data-ref="note">
          <div className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
            <b>{ann.type === 'pron' ? 'Pronunciation' : markOf(data, ann).name}</b>
            <span className="bdim bref-q">“{ann.q}”</span>
          </div>
          {annMessages(ann).map((m, i) => (
            <div className="bmsg" key={i}>{m.who !== 'you' ? <span className="bdim">{m.who === 'author' ? 'Author' : 'Proofer'}{m.at ? ' · ' + m.at : ''}: </span> : null}{m.text}</div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Reference for what was clicked, last punch, voices in this scene, coming-up words and this session's numbers; in a pickup session, the lines first. */
export const SidePanel = memo(function SidePanel({ data, chapterId, units, cur, lines, pickMode, at }: {
  data: BookData; chapterId: string; units: BoothUnit[]; cur: number; lines: Pickup[]; pickMode: boolean; at: string | null
}) {
  const b = useStudio((s) => s.ui.booth)
  const ref = b.ref
  const near = units.slice(Math.max(0, cur - 6), cur + 9)
  const voices = useMemo(() => {
    const byEntry = new Map<string, { id: string; name: string; voice: string; aliases: string[] }>()
    near.forEach((u) => {
      const en = u.q && u.spk !== UNKNOWN_SPEAKER ? entryOfSpeaker(data, u.spk) : undefined
      if (!en) return
      const g = byEntry.get(en.id) ?? { id: en.id, name: en.name, voice: en.voice, aliases: [] }
      if (!g.aliases.includes(u.spk)) g.aliases.push(u.spk)
      byEntry.set(en.id, g)
    })
    return [...byEntry.values()]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.bible, data.bibleTypes, units, cur])
  const ahead = units.slice(cur, cur + 12)
  const pids = new Set(ahead.map((u) => u.pid))
  const words = [...new Set(data.annotations.filter((a) => a.type === 'pron' && a.key && pids.has(a.p)).map((a) => a.key as string))]
  const last = b.punches[b.punches.length - 1]
  const open = lines.filter((x) => !isDone(data, x.id)).length
  const flagged = useMemo(() => suspectedLines(data, chapterId), [data, chapterId])
  return (
    <>
      {ref ? <Reference data={data} entryId={ref.entryId} annId={ref.annId} /> : null}
      {pickMode ? (
        <div className="stack" style={{ gap: 6 }}>
          <span className="bl">Pickups · {open} open</span>
          {lines.map((x) => {
            const c = data.chapters.find((y) => y.id === x.chapterId)
            const dn = isDone(data, x.id)
            return (
              <button type="button" key={x.id} className={'pkrow' + (dn ? ' done' : '') + (x.id === at ? ' on' : '')} data-pj={x.id} onClick={() => jumpPick(x.id)}>
                <span className="mono">{c ? chTag(data, c) : x.chapterId} · {x.t}</span><span className="pkl">{stripTags(x.script)}</span><span>{dn ? '✓' : ''}</span>
              </button>
            )
          })}
        </div>
      ) : null}
      {flagged.length ? (
        <div className="stack" style={{ gap: 6 }}>
          <span className="bl">Suspected · {flagged.length}</span>
          {flagged.map((x) => (
            <div className="brow" key={x.id} data-flag={x.id}>
              <span className="mono">{x.t}</span><span className="pkl">{x.ty === 'skip' ? 'Skipped' : 'Read again'} · {stripTags(x.script)}</span>
              <IconButton icon="x" tip="Dismiss" tipSide="l" data-fdismiss={x.id} onClick={() => dismissSuspected(x.id)} />
            </div>
          ))}
        </div>
      ) : null}
      <div className="stack" style={{ gap: 6 }}><span className="bl">Last punch</span>
        <div>{last ? 'Rolled from ¶ ' + (last.pi + 1) + ' · ' + last.at : 'No punches yet'}</div>
        {b.punchAt !== null && units[b.punchAt] ? <div className="bdim">Next roll starts from ¶ {units[b.punchAt].pi + 1}</div> : null}</div>
      <div className="stack" style={{ gap: 6 }}>
        <span className="bl">Voices in this scene</span>
        {voices.length ? voices.map((v) => (
          <div className="brow" key={v.id}>
            <span className="stack" style={{ gap: 3 }}>{v.aliases.map((c) => <span className="bchip" data-spk={c} key={c} style={speakerVars(data, c)}>{c}</span>)}</span>
            <span style={{ flex: 1 }}>{v.voice || 'No voice note yet'}</span>
            <IconButton icon="speaker" tip="Hear the reference clip" tipSide="r" data-bref={v.name} onClick={() => toast('Playing the reference clip for ' + v.name)} />
          </div>
        )) : <div className="bdim">No one speaks nearby.</div>}
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <span className="bl">Coming up</span>
        {words.length ? words.map((w) => (
          <div className="brow" key={w}><b>{w}</b><span className="mono" style={{ flex: 1 }}>{data.pronunciations[w]?.say || '—'}</span><span className="bdim">{pronStatus(data, w) === 'Set' ? 'set' : 'not set'}</span></div>
        )) : <div className="bdim">No marked words ahead.</div>}
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <span className="bl">This session</span>
        <div>
          Recorded <b className="mono">{mmss(b.recAll + (b.rec ? b.recSec : 0))}</b> · {b.punches.length} {b.punches.length === 1 ? 'punch' : 'punches'}
        </div>
      </div>
    </>
  )
})
