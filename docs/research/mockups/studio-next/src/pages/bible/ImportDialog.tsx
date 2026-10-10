import { useMemo, useRef, useState } from 'react'
import '@/styles/extraction.css'
import { PROMPT_TEMPLATE } from '@/config/extractionPrompt'
import { EXAMPLE_CSV, EXAMPLE_JSON } from '@/fixtures/extractionExample'
import { pct } from '@/format/evidence'
import { parseImport } from '@/format/extractionImport'
import { buildPrompt } from '@/format/extractionPrompt'
import { planImport, type PreviewLine } from '@/selectors/extractionImport'
import { confirmImport } from '@/state/commands/extraction'
import { useData } from '@/state/store'
import { openModal, toast } from '@/ui/overlay'
import { Btn, IconButton, Pill, Seg, Textarea } from '@/ui/primitives'

function copy(text: string, done: string): void {
  try {
    navigator.clipboard.writeText(text).then(() => toast(done), () => toast('Copy failed.'))
  } catch {
    toast('Copy failed.')
  }
}

const ACTION: Record<PreviewLine['action'], string> = { add: 'Add', merge: 'Merge', skip: 'Skip' }

/**
 * Bring in entries made elsewhere: a CSV or JSON file, or a JSON blob pasted from any LLM the narrator ran the manuscript through.
 * The preview is worked out by the same code that adds them; nothing is added until Add is pressed, and nothing is ever deleted.
 */
export function ImportDialog({ close }: { close: () => void }) {
  const data = useData()
  const [text, setText] = useState('')
  const [hint, setHint] = useState<'csv' | 'json' | undefined>(undefined)
  const [fname, setFname] = useState('')
  const [showEx, setShowEx] = useState(false)
  const [exFormat, setExFormat] = useState<'json' | 'csv'>('json')
  const fileRef = useRef<HTMLInputElement>(null)
  const parsed = useMemo(() => (text.trim() ? parseImport(text, hint) : null), [text, hint])
  const plan = useMemo(() => (parsed ? planImport(data, parsed.rows, parsed.errors) : null), [data, parsed])
  const example = exFormat === 'json' ? EXAMPLE_JSON : EXAMPLE_CSV
  const count = (a: PreviewLine['action']): number => plan?.lines.filter((l) => l.action === a).length ?? 0
  const verify = plan?.lines.filter((l) => l.status === 'needs-verification').length ?? 0

  const choose = (f: File): void => {
    const r = new FileReader()
    r.onload = () => { setText(String(r.result ?? '')); setHint(/\.json$/i.test(f.name) ? 'json' : /\.csv$/i.test(f.name) ? 'csv' : undefined); setFname(f.name) }
    r.onerror = () => toast('That file could not be read.')
    r.readAsText(f)
  }
  const prompt = (): void => {
    const fmt = parsed?.rows.length || parsed?.errors.length ? parsed.format : exFormat
    copy(buildPrompt(PROMPT_TEMPLATE, fmt, fmt === 'json' ? EXAMPLE_JSON : EXAMPLE_CSV), 'Prompt copied. Paste it into your LLM, followed by the manuscript.')
  }
  const add = (): void => { if (plan?.raws.length) { confirmImport(plan); close() } }

  return (
    <>
      <div className="dh">
        <div>
          <div className="label">Story Bible</div>
          <h2 style={{ fontSize: 26 }}>Import entries</h2>
          <div className="sub">A CSV or JSON file, or a JSON blob from any LLM you ran the manuscript through.</div>
        </div>
        <span className="spacer" />
        <Btn data-x onClick={close}>Cancel</Btn>
      </div>
      <div className="db stack">
        <div className="row" style={{ gap: 8 }}>
          <Btn id="impchoose" onClick={() => fileRef.current?.click()}>Choose a file…</Btn>
          {/* the browser file picker has no styled equivalent */}
          <input /* native-control-ok: file input hidden behind the Choose a file button */ ref={fileRef} type="file" id="impfile" accept=".csv,.json" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) choose(f); e.target.value = '' }} />
          {fname ? <span className="sub" data-impname>{fname}</span> : null}
          <span className="spacer" />
          <IconButton icon="copy" tip="Copy prompt for your own LLM" id="impprompt" onClick={prompt} />
          <IconButton icon={showEx ? 'hide' : 'show'} tip={showEx ? 'Hide the format example' : 'Show the format example'} id="impexample" aria-pressed={showEx} onClick={() => setShowEx(!showEx)} />
        </div>
        {showEx ? (
          <div className="stack" style={{ gap: 6 }} data-example>
            <div className="row">
              <Seg label="Example format" value={exFormat} options={[['json', 'JSON'], ['csv', 'CSV']]} onChange={setExFormat} />
              <span className="spacer" />
              <IconButton icon="copy" tip="Copy the example" id="impcopyex" onClick={() => copy(example, 'Example copied.')} />
            </div>
            <pre className="exbox" id="impex" tabIndex={0} aria-label="Format example">{example}</pre>
          </div>
        ) : null}
        <Textarea id="imppaste" aria-label="Paste JSON or CSV" placeholder="Or paste JSON (or CSV) here" value={text} spellCheck={false}
          style={{ minHeight: 96, fontFamily: 'var(--f-mono)', fontSize: 12 }} onChange={(e) => { setText(e.target.value); setHint(undefined); setFname('') }} />
        {plan ? (
          <div className="stack" style={{ gap: 8 }} data-preview>
            <div className="row">
              <Pill kind="ok">{count('add')} to add</Pill>
              <Pill kind="neutral">{count('merge')} to merge</Pill>
              <Pill kind="neutral">{count('skip')} skipped</Pill>
              <Pill kind={verify ? 'warn' : 'neutral'}>{verify} to verify</Pill>
              <Pill kind={plan.errors.length ? 'bad' : 'neutral'}>{plan.errors.length} {plan.errors.length === 1 ? 'error' : 'errors'}</Pill>
            </div>
            {plan.lines.length ? (
              <div className="tblwrap">
                <table className="impprev" aria-label="What will be added">
                  <colgroup><col style={{ width: 48 }} /><col /><col style={{ width: 70 }} /><col style={{ width: 150 }} /><col style={{ width: '30%' }} /></colgroup>
                  <thead><tr><th>Row</th><th>What</th><th>Action</th><th>Becomes</th><th>Note</th></tr></thead>
                  <tbody>
                    {plan.lines.map((l) => (
                      <tr key={l.row + l.where} data-improw={l.row} data-action={l.action}>
                        <td>{l.row}</td>
                        <td data-tip={l.label}>{l.label}</td>
                        <td>{ACTION[l.action]}</td>
                        <td>{l.status ? (l.status === 'needs-verification' ? 'To verify' : 'Accepted') : '—'}{l.confidence != null ? ' · ' + pct(l.confidence) + '%' : l.status ? ' · no score' : ''}</td>
                        <td data-tip={l.note}>{l.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {plan.errors.length ? (
              <div className="tblwrap">
                <table className="impprev" aria-label="Rows with errors">
                  <colgroup><col style={{ width: 48 }} /><col style={{ width: 140 }} /><col /></colgroup>
                  <thead><tr><th>Row</th><th>Where</th><th>Problem</th></tr></thead>
                  <tbody>
                    {plan.errors.map((er, i) => (
                      <tr key={i} data-imperr={er.row}>
                        <td>{er.row || '—'}</td>
                        <td data-tip={er.where}>{er.where || '—'}</td>
                        <td data-tip={er.reason} style={{ whiteSpace: 'normal' }}>{er.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="df">
        <Btn onClick={close}>Cancel</Btn>
        <Btn className="primary" id="impadd" disabled={!plan?.raws.length} onClick={add}>Add{plan?.raws.length ? ' ' + plan.raws.length : ''} to the Story Bible</Btn>
      </div>
    </>
  )
}

/** Open the import dialog (the Story Bible's Import button and the first-scan prompt both do). */
export const openImportDialog = (): void => { openModal({ label: 'Import entries', wide: true, render: ({ close }) => <ImportDialog close={close} /> }) }
