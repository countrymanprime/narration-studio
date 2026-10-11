/** Exporting the status report. The mock keeps no file: the report is built in memory and a record of it is stored in the book's data. */
import { buildReport, reportContent, reportFileName, reportPath, type ReportFormat, type ReportInclude } from '@/selectors/report'
import { toastUndo } from '@/ui/overlay'
import { act, getState } from '../store'

export interface ExportedReport { file: string; location: string; content: string }

export function exportStatusReport(include: ReportInclude, format: ReportFormat): ExportedReport {
  const b = getState().data
  const content = reportContent(buildReport(b, include), format)
  const file = reportFileName(b, format)
  const location = reportPath(b, format)
  const e = act('Exported a status report', (d) => {
    d.data.reports.push({
      id: d.data.reports.reduce((a, r) => Math.max(a, r.id), 0) + 1, file, location, format, at: d.data.today, include: { ...include }, size: content.length,
    })
  })
  toastUndo('Status report saved as ' + file + '.', e, 7000)
  return { file, location, content }
}
