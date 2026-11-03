/**
 * The status report. `buildReport` turns the book into a plain document (numbers and names, no layout) from selectors only; the HTML and
 * JSON builders are pure functions of that document. Unticking a section leaves it out of the document altogether.
 */
import type { BookData } from '@/domain/schemas'
import { fmtD, hm, num, parseIso } from '@/format/time'
import { chName, chTag } from './chapters'
import { masterFails, masterRowFor } from './master'
import { isDone, pickupList, typeLabel } from './pickups'
import { activeLimits, calc, contractValue, isFinished, vals } from './progress'

export type ReportSection = 'chapters' | 'words' | 'schedule' | 'pickups' | 'delivery' | 'amount' | 'rate'
export type ReportFormat = 'html' | 'json'
export type ReportInclude = Record<ReportSection, boolean>

export const REPORT_SECTIONS: Array<{ id: ReportSection; label: string; money?: boolean }> = [
  { id: 'chapters', label: 'Chapters and stages' },
  { id: 'words', label: 'Words and finished hours' },
  { id: 'schedule', label: 'Schedule and milestones' },
  { id: 'pickups', label: 'Open pickups' },
  { id: 'delivery', label: 'Delivery check' },
  { id: 'amount', label: 'Contracted amount', money: true },
  { id: 'rate', label: 'Rate', money: true },
]

/** The sections that can be offered: the money ones only exist when the contract pays per finished hour. */
export const reportSections = (b: BookData): typeof REPORT_SECTIONS => REPORT_SECTIONS.filter((s) => !s.money || contractValue(b) != null)
/** Everything is included except the money sections. */
export const defaultInclude = (b: BookData): ReportInclude =>
  Object.fromEntries(REPORT_SECTIONS.map((s) => [s.id, !s.money && reportSections(b).some((x) => x.id === s.id)])) as ReportInclude

export interface ReportDoc {
  title: string
  asOf: string
  source: { file: string; imported: string }
  status: 'finished' | 'ok' | 'tight' | 'behind'
  summary: { chapters: number; words?: number; finishedHours?: number; recordedHours?: number; recordedPct?: number; due?: string; daysLeft?: number }
  chapters?: { rows: Array<{ id: string; name: string; words?: number; finishedHours?: number; prep?: string; recorded?: number; edited?: number; proofed?: number; openPickups?: number | null; mastered?: boolean }>; total?: { words: number; finishedHours: number } }
  milestones?: Array<{ name: string; date: string; done: boolean }>
  pickups?: Array<{ chapter: string; open: number; kinds: string[] }>
  delivery?: { pass: number; unchecked: number; fail: Array<{ chapter: string; limits: string[] }> }
  money?: { contractedAmount?: number; ratePerFinishedHour?: number }
  generatedBy: string
}

export function buildReport(b: BookData, inc: ReportInclude): ReportDoc {
  const k = calc(b)
  const allowed = new Set(reportSections(b).map((s) => s.id))
  const on = (id: ReportSection): boolean => !!inc[id] && allowed.has(id)
  const limits = activeLimits(b)
  const doc: ReportDoc = {
    title: b.projectName, asOf: b.today, source: { file: b.manuscript.name, imported: b.manuscript.imported },
    status: isFinished(k) ? 'finished' : k.verdict,
    summary: { chapters: b.chapters.filter((c) => c.n != null).length },
    generatedBy: 'Narration Studio',
  }
  if (on('words')) {
    doc.summary.words = k.W
    doc.summary.finishedHours = round2(k.fh)
    doc.summary.recordedHours = round2(k.rw / k.wph)
    doc.summary.recordedPct = k.W ? Math.round((k.rw / k.W) * 100) : 0
  }
  if (on('schedule')) {
    doc.summary.due = b.due
    doc.summary.daysLeft = k.daysLeft
    doc.milestones = b.milestones.slice().sort((x, y) => x.date.localeCompare(y.date)).map((m) => ({ name: m.name, date: m.date, done: !!m.done }))
  }
  if (on('chapters') || on('words')) {
    const words = on('words')
    doc.chapters = {
      rows: b.chapters.map((c) => {
        const v = vals(b, c)
        return {
          id: c.id, name: chName(b, c), ...(words ? { words: c.words, finishedHours: round2(c.words / k.wph) } : {}),
          ...(on('chapters') ? { prep: c.prep, recorded: v.rec, edited: v.edit, proofed: v.proof, openPickups: v.rec < 100 ? null : v.pick, mastered: v.master } : {}),
        }
      }),
      ...(words ? { total: { words: k.W, finishedHours: round2(k.fh) } } : {}),
    }
  }
  if (on('pickups')) {
    const open = pickupList(b).filter((x) => !isDone(b, x.id))
    doc.pickups = b.chapters.flatMap((c) => {
      const mine = open.filter((x) => x.chapterId === c.id)
      return mine.length ? [{ chapter: chTag(b, c), open: mine.length, kinds: [...new Set(mine.map((x) => typeLabel(x).toLowerCase()))] }] : []
    })
  }
  if (on('delivery')) {
    doc.delivery = {
      pass: k.pass, unchecked: b.chapters.length - k.measured,
      fail: b.chapters.flatMap((c) => {
        const row = masterRowFor(b, c.id)
        const f = row && !row.waiting ? masterFails(row, limits) : []
        return f.length ? [{ chapter: chTag(b, c), limits: f.map((x) => limits[x].l.toLowerCase()) }] : []
      }),
    }
  }
  const worth = contractValue(b)
  if (worth != null && (on('amount') || on('rate'))) {
    doc.money = { ...(on('amount') ? { contractedAmount: Math.round(worth * 100) / 100 } : {}), ...(on('rate') ? { ratePerFinishedHour: b.contract.amount as number } : {}) }
  }
  return doc
}
const round2 = (n: number): number => Math.round(n * 10000) / 10000

export const reportFileName = (b: BookData, format: ReportFormat): string =>
  b.projectName.toLowerCase().normalize('NFKD').replace(/[‘’'’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-status-' + b.today + '.' + format

/** Where the file would be saved: the report folder and the file name, with the folder's own separator. */
export function reportPath(b: BookData, format: ReportFormat): string {
  const sep = b.reportDir.includes('\\') ? '\\' : '/'
  return (b.reportDir ? b.reportDir.replace(/[\\/]+$/, '') + sep : '') + reportFileName(b, format)
}

export const reportJson = (doc: ReportDoc): string => JSON.stringify(doc, null, 2)

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const day = (iso: string): string => fmtD(parseIso(iso))
const STATUS = { finished: 'Finished', ok: 'On track', tight: 'Tight', behind: 'Behind' } as const
const PREP: Record<string, string> = { prepped: '✓', progress: '◐', none: '○' }
const pct = (p: number): string => (p >= 100 ? '✓' : p > 0 ? p + '%' : '—')
const money = (n: number): string => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** The summary sentence, from what the document holds. */
export function summaryLine(doc: ReportDoc): string {
  const s = doc.summary
  const parts = [STATUS[doc.status] + '.']
  const counts = [s.chapters + ' chapters']
  if (s.words != null) counts.push(num(s.words) + ' words')
  if (s.finishedHours != null) counts.push(hm(s.finishedHours) + ' finished audio')
  parts.push(counts.join(', ') + '.')
  if (s.recordedHours != null) parts.push(hm(s.recordedHours) + ' recorded (' + s.recordedPct + '%).')
  if (s.due) parts.push('Due ' + day(s.due) + ', ' + s.daysLeft + ' days left.')
  return parts.join(' ')
}

/** The report as one HTML fragment (the part inside the page), used for the saved file and for the preview. */
export function reportBodyHtml(doc: ReportDoc): string {
  const h: string[] = []
  h.push('<div class="k">Status report</div>', '<h1>' + esc(doc.title) + '</h1>')
  h.push('<div class="m">As of ' + esc(fmtD(parseIso(doc.asOf)) + ', ' + parseIso(doc.asOf).getFullYear()) + ' · ' + esc(doc.source.file) + ' · imported ' + esc(doc.source.imported) + '</div>')
  h.push('<p class="lead"><b>' + esc(summaryLine(doc).split('. ')[0] + '.') + '</b> ' + esc(summaryLine(doc).split('. ').slice(1).join('. ')) + '</p>')
  if (doc.chapters) {
    const r = doc.chapters.rows
    const stages = r.length > 0 && 'prep' in r[0]
    const words = r.length > 0 && 'words' in r[0]
    h.push('<h2>Chapters and stages</h2><table><thead><tr><th>Chapter</th>' + (words ? '<th class="n">Words</th><th class="n">Fin.</th>' : '') +
      (stages ? '<th>Prep</th><th>Rec</th><th>Edit</th><th>Proof</th><th>Pick.</th><th>Mast.</th>' : '') + '</tr></thead><tbody>')
    for (const x of r) {
      h.push('<tr><td>' + esc(x.name) + '</td>' + (words ? '<td class="n">' + num(x.words ?? 0) + '</td><td class="n">' + hm(x.finishedHours ?? 0) + '</td>' : '') +
        (stages ? '<td>' + PREP[x.prep ?? 'none'] + '</td><td>' + pct(x.recorded ?? 0) + '</td><td>' + pct(x.edited ?? 0) + '</td><td>' + pct(x.proofed ?? 0) + '</td><td>' + (x.openPickups == null ? '—' : x.openPickups) + '</td><td>' + (x.mastered ? '✓' : '—') + '</td>' : '') + '</tr>')
    }
    h.push('</tbody>' + (doc.chapters.total ? '<tfoot><tr><td>Total</td><td class="n">' + num(doc.chapters.total.words) + '</td><td class="n">' + hm(doc.chapters.total.finishedHours) + '</td>' + (stages ? '<td colspan="6"></td>' : '') + '</tr></tfoot>' : '') + '</table>')
  }
  if (doc.milestones) {
    h.push('<h2>Milestones</h2><table class="plain"><tbody>')
    for (const m of doc.milestones) h.push('<tr><td>' + esc(m.name) + '</td><td class="r">' + esc(day(m.date)) + (m.done ? ' · done' : '') + '</td></tr>')
    h.push('</tbody></table>')
  }
  if (doc.pickups || doc.delivery) {
    h.push('<h2>Open items</h2><table class="plain"><tbody>')
    if (doc.pickups) {
      if (!doc.pickups.length) h.push('<tr><td>No open pickups</td><td class="r"></td></tr>')
      for (const p of doc.pickups) h.push('<tr><td>' + p.open + ' open pickup' + (p.open === 1 ? '' : 's') + ' in ' + esc(p.chapter) + '</td><td class="r">' + esc(p.kinds.join(', ')) + '</td></tr>')
    }
    if (doc.delivery) {
      const d = doc.delivery
      const fails = d.fail.length ? d.fail.length + ' fail (' + d.fail.map((f) => f.chapter + ', ' + f.limits.join(' and ')).join('; ') + ')' : '0 fail'
      h.push('<tr><td>Delivery check</td><td class="r">' + esc(d.pass + ' pass · ' + fails + ' · ' + d.unchecked + ' unchecked') + '</td></tr>')
    }
    h.push('</tbody></table>')
  }
  if (doc.money) {
    h.push('<h2>Contract</h2><table class="plain"><tbody>')
    if (doc.money.contractedAmount != null) h.push('<tr><td>Contracted amount</td><td class="r">' + esc(money(doc.money.contractedAmount)) + '</td></tr>')
    if (doc.money.ratePerFinishedHour != null) h.push('<tr><td>Rate</td><td class="r">' + esc(money(doc.money.ratePerFinishedHour)) + ' per finished hour</td></tr>')
    h.push('</tbody></table>')
  }
  h.push('<div class="g">Generated by ' + esc(doc.generatedBy) + '</div>')
  return h.join('')
}

/** The paper look of the report, shared by the saved file and the dialog's preview. The report is always light, whatever the app's theme. */
export const REPORT_CSS =
  '.rpt{font:14px/1.5 Georgia,"IBM Plex Serif",serif;color:#1c1a17;background:#fff;padding:24px 28px;max-width:820px;margin:0 auto}' +
  '.rpt .k{font:600 11px/1 system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#6b6258}' +
  '.rpt h1{font:600 28px/1.2 Georgia,serif;margin:6px 0 2px}.rpt .m{font:12px system-ui,sans-serif;color:#6b6258}' +
  '.rpt .lead{border-top:1px solid #1c1a17;margin:16px 0;padding-top:10px}' +
  '.rpt h2{font:600 11px/1 system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#6b6258;margin:20px 0 6px}' +
  '.rpt table{width:100%;border-collapse:collapse;font:12px system-ui,sans-serif}.rpt th{text-align:left;font-size:10px;letter-spacing:.08em;text-transform:uppercase;border-bottom:1px solid #1c1a17;padding:3px 6px 3px 0}' +
  '.rpt td{padding:3px 6px 3px 0;border-bottom:1px solid #e4ddd2}.rpt .n{text-align:right}.rpt .r{text-align:right}.rpt tfoot td{font-weight:700;border-bottom:0}' +
  '.rpt .g{font:11px system-ui,sans-serif;color:#9a9186;text-align:right;margin-top:18px}'

export function reportHtml(doc: ReportDoc): string {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
    esc(doc.title + ' – status report') + '</title><style>' + REPORT_CSS + 'body{margin:0;background:#fff}</style></head><body><article class="rpt">' + reportBodyHtml(doc) + '</article></body></html>'
}

/** The file's content in the chosen format. */
export const reportContent = (doc: ReportDoc, format: ReportFormat): string => (format === 'json' ? reportJson(doc) : reportHtml(doc))

