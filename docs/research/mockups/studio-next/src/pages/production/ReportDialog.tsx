import { useMemo, useState } from 'react'
import { fmtD, parseIso } from '@/format/time'
import {
  REPORT_CSS, buildReport, defaultInclude, reportBodyHtml, reportJson, reportPath, reportSections, type ReportFormat, type ReportInclude,
} from '@/selectors/report'
import { exportStatusReport } from '@/state/commands/report'
import { useData } from '@/state/store'
import { Btn, Checkbox, IconButton, Seg } from '@/ui/primitives'

/** What goes in the status report, with a live preview of the document. Export builds it in memory (the mock has no file system). */
export function ReportDialog({ close }: { close: () => void }) {
  const data = useData()
  const [include, setInclude] = useState<ReportInclude>(() => defaultInclude(data))
  const [format, setFormat] = useState<ReportFormat>('html')
  const doc = useMemo(() => buildReport(data, include), [data, include])
  const html = useMemo(() => reportBodyHtml(doc), [doc])
  return (
    <>
      <div className="dh">
        <div className="stack" style={{ gap: 2 }}>
          <h2 style={{ fontSize: 26 }}>Export status report</h2>
          <div className="sub">{data.projectName} · as of {fmtD(parseIso(data.today))}</div>
        </div>
        <span className="spacer" />
        <IconButton icon="x" tip="Close" data-x onClick={close} />
      </div>
      <div className="db rp">
        <div className="stack rp-form" style={{ gap: 14 }}>
          <span className="label">Include</span>
          <div className="stack" style={{ gap: 10 }}>
            {reportSections(data).map((s) => (
              <Checkbox key={s.id} label={s.label} labelClassName="row" data-section={s.id} checked={include[s.id]} onCheckedChange={(v) => setInclude((p) => ({ ...p, [s.id]: v }))} />
            ))}
          </div>
          <span className="label">Format</span>
          <div className="row">
            <Seg<ReportFormat> label="Format" value={format} onChange={setFormat} options={[['html', 'HTML'], ['json', 'JSON']]} />
          </div>
          <code className="rp-path" data-path>{reportPath(data, format)}</code>
        </div>
        <div className="rp-preview" data-preview aria-label="Preview of the report">
          {format === 'html'
            ? <><style>{REPORT_CSS}</style><article className="rpt" dangerouslySetInnerHTML={{ __html: html }} /></>
            : <pre className="rp-json">{reportJson(doc)}</pre>}
        </div>
      </div>
      <div className="df">
        <Btn id="rp-cancel" onClick={close}>Cancel</Btn>
        <Btn id="rp-export" className="primary" onClick={() => { exportStatusReport(include, format); close() }}>Export</Btn>
      </div>
    </>
  )
}
