import { capsOf, dawLabel } from '@/selectors/daw'
import { Btn } from '@/ui/primitives'
import { useRef, useState } from 'react'
import { num } from '@/format/time'
import { chName, chapterById, numberedChapters, outlineName, paragraphsOf } from '@/selectors/chapters'
import { vals } from '@/selectors/progress'
import { finishImport, type ImportMode } from '@/state/commands/manuscript'
import { useData, useMock } from '@/state/store'
import { platformProfiles } from '@/selectors/platform'
import { setDeliveryProfile } from '@/state/commands/schedule'
import { FieldRow, Select } from '@/ui/primitives'
import { Checkbox } from '@/ui/primitives/Checkbox'

type Step = 'choose' | 'review' | 'changes'

/** Import (first time) or replace (re-import) the manuscript: choose a file, check the outline, and for a replace see what changes. */
export function ImportFlow({ mode, close }: { mode: ImportMode; close: () => void }) {
  const data = useData()
  const mock = useMock()
  const replacing = mode === 'replace'
  const outline = data.chapters
  const pending = data.pendingManuscript
  const subIdx = pending.subtitle ? outline.findIndex((c) => c.id === pending.subtitle?.chapterId) : -1
  const [step, setStep] = useState<Step>('choose')
  const [sel, setSel] = useState(Math.max(0, subIdx))
  const [keepSub, setKeepSub] = useState(true)
  const [chars, setChars] = useState(true)
  const [fname, setFname] = useState('')
  const [profile, setProfile] = useState(data.deliveryProfile)
  const fileRef = useRef<HTMLInputElement>(null)
  const steps: Step[] = replacing ? ['choose', 'review', 'changes'] : ['choose', 'review']
  const daw = mock.setup !== 'builtin'
  const name = dawLabel(capsOf(mock).daw)
  const chosen = (name: string): void => { setFname(name); setStep('review') }
  const done = (): void => { close(); if (!replacing) setDeliveryProfile(profile); finishImport(mode) }

  const selected = outline[Math.min(sel, outline.length - 1)]
  const firstText = selected ? paragraphsOf(data, selected.id)[0]?.text : undefined
  const preview = firstText ? (firstText.length > 170 ? firstText.slice(0, 170).trimEnd() + '…' : firstText) : 'The first lines of the selected section appear here.'
  const subCh = pending.subtitle ? chapterById(data, pending.subtitle.chapterId) : undefined
  const hit = pending.changes.flatMap((c) => { const ch = chapterById(data, c.chapterId); return ch ? [{ c, ch }] : [] })
  const totalChapters = numberedChapters(data).length

  return (
    <>
      <div className="dh">
        <div>
          <div className="label">{replacing ? 'Replace manuscript' : 'Import manuscript'} · step {steps.indexOf(step) + 1} of {steps.length}</div>
          <h2 style={{ fontSize: 26 }}>{step === 'choose' ? 'Choose your manuscript' : step === 'review' ? 'Check the chapter outline' : 'What this changes in your project'}</h2>
          <div className="sub">{step === 'choose' ? (replacing ? 'Replaces the manuscript imported ' + data.manuscript.imported + '.' : 'Use a .docx, .md or .txt file. A copy is kept in your project.') : fname || 'Manuscript'}</div>
        </div>
        <span className="spacer" />
        <Btn data-x onClick={close}>Cancel</Btn>
      </div>
      {step === 'choose' ? (
        <>
          <div className="db stack">
            <div id="drop" className="stack" style={{ border: '2px dashed var(--line-strong)', borderRadius: 10, padding: 32, textAlign: 'center' }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) chosen(f.name) }}>
              <b>Drop a manuscript here</b><span className="sub">or</span>
              <div className="row" style={{ justifyContent: 'center' }}>
                <button type="button" className="btn primary" id="choose" onClick={() => { if (mock.autoSample) chosen('manuscript.docx'); else fileRef.current?.click() }}>Choose a file…</button>
                {/* native-control-ok: file input (hidden behind the Choose a file button; the browser file picker has no styled equivalent) */}<input ref={fileRef} type="file" id="imf" accept=".docx,.md,.txt" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) chosen(f.name) }} />
              </div>
            </div>
          </div>
          <div className="df"><span className="sub" style={{ marginRight: 'auto' }}>The manuscript is read-only. Your marks and notes are stored separately.</span></div>
        </>
      ) : step === 'review' ? (
        <>
          <div className="db stack">
            <div className="row">
              <span className="pill ok">{totalChapters} chapters</span>
              <span className="pill neutral">{num(outline.reduce((a, c) => a + c.words, 0))} words</span>
              <span className="pill neutral">{pending.characterSuggestions} character suggestions</span>
              <span className="pill warn">{pending.itemsToReview} {pending.itemsToReview === 1 ? 'item needs' : 'items need'} review</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16 }}>
              <div className="panel">
                <div className="ph"><h2>Chapter outline</h2></div>
                <div className="tblwrap" style={{ maxHeight: 300 }}>
                  <table>
                    <thead><tr><th>Detected heading</th><th>Words</th></tr></thead>
                    <tbody>
                      {outline.map((c, i) => (
                        <tr key={c.id} tabIndex={0} data-o={i} aria-selected={i === sel} onClick={() => setSel(i)} onKeyDown={(e) => { if (e.key === 'Enter') setSel(i) }}>
                          <td>{outlineName(data, c)}</td><td className="mono">{num(c.words)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="stack">
                <div className="panel">
                  <div className="ph"><h2>{selected ? outlineName(data, selected) : ''}</h2></div>
                  <div className="pb"><p style={{ margin: 0, fontFamily: 'var(--f-serif)', lineHeight: 1.6 }}>{preview}</p></div>
                </div>
                {pending.subtitle && subCh ? (
                  <div className="banner">
                    <div><b>Subtitle detected</b><div className="sub">“{pending.subtitle.text}” is part of this heading. Keep it with the chapter title?</div></div>
                    <Checkbox id="ksub" checked={keepSub} onCheckedChange={setKeepSub} label="Keep detected subtitle" />
                  </div>
                ) : null}
                <Checkbox id="kch" checked={chars} onCheckedChange={setChars} label="Review character suggestions after import" />
                {replacing ? null : (
                  <FieldRow label="Delivery profile" htmlFor="import-profile">
                    <Select id="import-profile" aria-label="Delivery profile" value={profile} onValueChange={setProfile} options={platformProfiles().map((p) => ({ value: p.id, label: p.label }))} />
                  </FieldRow>
                )}
              </div>
            </div>
          </div>
          <div className="df">
            <span className="sub" style={{ marginRight: 'auto' }}>Import creates the project’s read-only manuscript.</span>
            <Btn data-back onClick={() => setStep('choose')}>Back</Btn>
            {replacing
              ? <Btn className="primary" data-next onClick={() => setStep('changes')}>Next: what changes</Btn>
              : <button type="button" className="btn primary" data-next onClick={() => done()}>Import reviewed manuscript</button>}
          </div>
        </>
      ) : (
        <>
          <div className="db stack">
            <div className="banner info"><span>{daw
              ? <><b>Your recordings live in your DAW.</b> The app will not touch them. Chapters whose text changed are flagged so you can check the recording in {name}.</>
              : <><b>Your recordings were made in the app.</b> For chapters whose text changed, the app archives the takes (they are kept in the project’s archive folder, not deleted) and flags the chapter.</>}</span></div>
            <div className="tblwrap">
              <table>
                <thead><tr><th>Chapter</th><th>Change</th><th>Recorded</th><th>What happens</th></tr></thead>
                <tbody>
                  {hit.map((x) => {
                    const rec = vals(data, x.ch).rec
                    return <tr key={x.ch.id}><td><b>{chName(data, x.ch)}</b></td><td>{x.c.what}</td><td>{rec}%</td><td>{rec > 0 ? (daw ? 'Flag: check recording in ' + name : 'Archive takes and flag') : 'Flag only: not recorded yet'}</td></tr>
                  })}
                </tbody>
              </table>
            </div>
            <div className="row">
              <span className="pill ok">{totalChapters - hit.length} chapters unchanged</span>
              <span className="pill neutral">Marks and notes on unchanged text are kept</span>
              <span className="pill warn">Marks on changed text are flagged for review</span>
            </div>
          </div>
          <div className="df">
            <Btn data-back onClick={() => setStep('review')}>Back</Btn>
            <button type="button" className="btn primary" data-apply onClick={done}>Replace manuscript</button>
          </div>
        </>
      )}
    </>
  )
}
