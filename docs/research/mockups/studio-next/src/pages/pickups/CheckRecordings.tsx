import { Btn, IconButton, Select, Slider } from '@/ui/primitives'
import { useEffect, useMemo, useRef, useState } from 'react'
import { hm } from '@/format/time'
import { chName } from '@/selectors/chapters'
import { speech } from '@/providers/speech'
import { checkOf, checkState } from '@/selectors/checks'
import { WPH, vals } from '@/selectors/progress'
import { detectPickups, projectBasis } from '@/state/commands/pickups'
import { update, useData, useStudio } from '@/state/store'
import { toast } from '@/ui/overlay'
import { Checkbox } from '@/ui/primitives/Checkbox'

const CHECK_LABEL = { current: 'Checked, as of last save', stale: 'Out of date', none: 'Not checked yet' } as const

/** What a stored check says about a chapter: the engine, the lines to redo, and how far the recording reaches. */
function resultText(k: ReturnType<typeof checkOf>): string {
  if (!k) return ''
  const bits = [k.model]
  if (k.gaps != null) bits.push(k.gaps + (k.gaps === 1 ? ' line to redo' : ' lines to redo'))
  if (k.unfinished && k.unfinished.start + k.unfinished.end > 0 && k.readTo != null && k.paras != null) bits.push('read ' + k.readTo + ' of ' + k.paras + ' paragraphs')
  return bits.join(' · ')
}

/** Minutes of recorded audio in the chosen chapters. */
export function audioMinutes(chapters: Array<{ words: number; rec: number }>): number {
  return chapters.reduce((a, c) => a + ((c.words / WPH) * 60 * c.rec) / 100, 0)
}
/** Rough time to check: audio length times the model's factor, shared between the workers. */
export function estimateMinutes(audioMin: number, model: string, workers: number): number {
  const engines = speech().engines()
  const f = (engines.find((x) => x.id === model) ?? engines[0]).factor
  return Math.max(1, Math.round((audioMin * f) / workers))
}

/** Checking recordings runs speech recognition over the audio and compares it with the manuscript. The settings are chosen here before it starts. */
export function CheckRecordings({ pre, close }: { pre: string[]; close: () => void }) {
  const data = useData()
  const cfg = useStudio((s) => s.ui.check)
  const basis = projectBasis()
  const recorded = useMemo(() => data.chapters.filter((c) => vals(data, c).rec > 0), [data])
  const [sel, setSel] = useState<Set<string>>(() => new Set(pre.filter((id) => recorded.some((c) => c.id === id))))
  const [run, setRun] = useState<string[] | null>(null)
  const chosen = recorded.filter((c) => sel.has(c.id))
  const audio = audioMinutes(chosen.map((c) => ({ words: c.words, rec: vals(data, c).rec })))
  const est = estimateMinutes(audio, cfg.model, cfg.workers)
  const setCfg = (patch: Partial<typeof cfg>): void => update((d) => { Object.assign(d.ui.check, patch) })
  const toggle = (id: string, on: boolean): void => setSel((p) => { const n = new Set(p); if (on) n.add(id); else n.delete(id); return n })

  if (run) return <Running ids={run} close={close} />
  return (
    <>
      <div className="dh"><div><div className="label">Pickups</div><h2 style={{ fontSize: 26 }}>Check recordings</h2></div></div>
      <div className="db" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 20 }}>
        <div className="stack" style={{ gap: 14 }}>
          <label className="stack" style={{ gap: 4 }}>
            <span className="label">Speech model</span>
            <Select id="ck-m" aria-label="Speech model" value={cfg.model} onValueChange={(v) => setCfg({ model: v })} options={speech().engines().map((m) => ({ value: m.id, label: m.label }))} />
          </label>
          <label className="stack" style={{ gap: 4 }}>
            <span className="optrow"><span className="label">Chunk length</span><b className="mono" id="ck-cv">{cfg.chunk} s</b></span>
            <Slider id="ck-c" aria-label="Chunk length" min={10} max={120} step={5} value={cfg.chunk} onValueChange={(v) => setCfg({ chunk: v })} />
          </label>
          <label className="stack" style={{ gap: 4 }}>
            <span className="optrow"><span className="label">Overlap between chunks</span><b className="mono" id="ck-ov">{cfg.overlap} s</b></span>
            <Slider id="ck-o" aria-label="Overlap between chunks" min={0} max={10} step={1} value={cfg.overlap} onValueChange={(v) => setCfg({ overlap: v })} />
          </label>
          <label className="stack" style={{ gap: 4 }}>
            <span className="optrow"><span className="label">Parallel workers</span><b className="mono" id="ck-wv">{cfg.workers}</b></span>
            <Slider id="ck-w" aria-label="Parallel workers" min={1} max={8} step={1} value={cfg.workers} onValueChange={(v) => setCfg({ workers: v })} />
          </label>
          <div className="optrow" style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}><span>Audio to check</span><b className="mono" id="ck-a">{hm(audio / 60)}</b></div>
          <div className="optrow"><span>Estimated time</span><b className="mono" id="ck-e">about {est} min</b></div>
        </div>
        <div className="stack" style={{ gap: 6, minWidth: 0 }}>
          <div className="row">
            <span className="label">Chapters</span><span className="spacer" />
            <button type="button" className="btn sm quiet" id="ck-all" onClick={() => setSel(new Set(recorded.map((c) => c.id)))}>All</button>
            <button type="button" className="btn sm quiet" id="ck-none" onClick={() => setSel(new Set())}>None</button>
          </div>
          <div className="tblwrap" style={{ maxHeight: 300 }}>
            <table>
              <tbody>
                {recorded.map((c) => (
                  <tr key={c.id}>
                    <td style={{ width: 30 }}><Checkbox data-ckc={c.id} checked={sel.has(c.id)} aria-label={'Check ' + chName(data, c)} onCheckedChange={(c2) => toggle(c.id, c2)} /></td>
                    <td>{chName(data, c)}</td>
                    <td className="sub"><div>{CHECK_LABEL[checkState(data, c.id, basis)]}</div>{checkOf(data, c.id) ? <div data-ckr={c.id}>{resultText(checkOf(data, c.id))}</div> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="df">
        <span className="sub" style={{ marginRight: 'auto' }}>Skipped, changed or unclear lines become pickups.</span>
        <Btn onClick={close}>Cancel</Btn>
        <button type="button" className="btn primary" id="ck-run" disabled={!sel.size} onClick={() => setRun(chosen.map((c) => c.id))}>
          Check {sel.size} {sel.size === 1 ? 'chapter' : 'chapters'}
        </button>
      </div>
    </>
  )
}

/** Progress while the check runs: at most `workers` chapters move at once. */
function Running({ ids, close }: { ids: string[]; close: () => void }) {
  const data = useData()
  const cfg = useStudio((s) => s.ui.check)
  const [pct, setPct] = useState<number[]>(() => ids.map(() => 0))
  const live = useRef({ pct, workers: cfg.workers })
  live.current.workers = cfg.workers
  useEffect(() => {
    const timer = setInterval(() => {
      let busy = 0
      const next = live.current.pct.map((p) => {
        if (p >= 100) return p
        if (busy < live.current.workers) { busy++; return Math.min(100, p + 14) }
        return p
      })
      live.current.pct = next
      setPct(next)
      if (next.every((p) => p >= 100)) {
        clearInterval(timer)
        close()
        detectPickups(ids, true)
      }
    }, 200)
    return () => clearInterval(timer)
  }, [ids, close])
  const stop = (): void => { close(); toast('Stopped. Nothing was added.') }
  return (
    <>
      <div className="dh"><div><div className="label">{cfg.model} · {cfg.workers} workers · {cfg.chunk} s chunks</div><h2 style={{ fontSize: 26 }}>Checking…</h2></div></div>
      <div className="db stack">
        {ids.map((id, i) => (
          <div className="optrow" key={id}>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chName(data, data.chapters.find((c) => c.id === id)!)}</span>
            <div className="meter" style={{ width: 180 }}><div className="zone" id={'ckp' + i} style={{ left: 0, width: pct[i] + '%', background: 'var(--copper)' }} /></div>
          </div>
        ))}
      </div>
      <div className="df"><IconButton icon="stop" tip="Stop" id="ck-stop" onClick={stop} /></div>
    </>
  )
}
