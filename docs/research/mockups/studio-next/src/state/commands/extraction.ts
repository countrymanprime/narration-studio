import { sourceLabel, type ExtractionSourceId } from '@/config/extraction'
import type { Evidence, Payload } from '@/domain/extraction'
import { paragraphChapter } from '@/selectors/chapters'
import type { ImportPlan } from '@/selectors/extractionImport'
import { componentProvider } from '@/providers/components'
import { extractionProvider } from '@/providers/extraction'
import { scanSources } from '@/selectors/components'
import { toast, toastUndo } from '@/ui/overlay'
import { act, getState, undoEntry, update } from '../store'
import { acceptSuggestion, ingestRaw, rejectSuggestion, reviewSuggestion, type Decision } from '../extractionCore'

const what = (id: string): string => {
  const s = getState().data.suggestions.find((x) => x.id === id)
  const p = s?.payload
  if (!p) return 'suggestion'
  return p.kind === 'entry' ? p.name : p.kind === 'alias' ? p.alias : p.kind === 'property' ? p.key : p.kind === 'claim' ? p.text : p.kind === 'relationship' ? p.relation : p.quote
}

function decide(label: string, id: string, fn: (d: import('immer').Draft<import('../types').StudioState>) => Decision): Decision {
  let res: Decision = { ok: false, reason: 'Nothing happened.' }
  const text = label + ' “' + what(id) + '”'
  const entry = act(text, (d) => {
    res = fn(d)
    if (res.ok && d.ui.bible.selSug === id) {
      const s = d.data.suggestions.find((x) => x.id === id)
      d.ui.bible.selSug = null
      if (s?.entryId) d.ui.bible.sel = s.entryId
    }
  }, { restoreUi: ['bible.selSug', 'bible.sel'] })
  if (res.ok) toastUndo(text + '.', entry)
  else {
    /* Nothing changed: take the empty step back out so Undo does not list it. */
    undoEntry(entry)
    toast(res.reason)
  }
  return res
}

/** Accept a suggestion (optionally with the text changed): it is applied, the entry or name it made no longer needs review. One undo step. */
export const acceptSuggestionCmd = (id: string, payload?: Payload): Decision => decide(payload ? 'Edited and accepted' : 'Accepted', id, (d) => acceptSuggestion(d.data, id, payload))
export const rejectSuggestionCmd = (id: string): Decision => decide('Rejected', id, (d) => rejectSuggestion(d.data, id))
/** An automatic acceptance looked at and kept. */
export const reviewSuggestionCmd = (id: string): Decision => decide('Reviewed', id, (d) => reviewSuggestion(d.data, id))

export function setVerifyOnly(on: boolean): void {
  update((d) => { d.ui.bible.verifyOnly = on; if (on) d.ui.bible.reviewOnly = false })
}
export function selectSuggestion(id: string | null): void {
  update((d) => { d.ui.bible.selSug = id })
}

/** Go to the line a quote was found on, in the Script. */
export function openEvidence(ev: Evidence): void {
  update((d) => {
    d.ui.chapter = paragraphChapter(d.data, ev.paragraphId)
    d.ui.script.pendingPid = ev.paragraphId
    d.ui.page = 'script'
    d.ui.script.drawer = null
  })
}

/** Run a source over the book. What was already offered, and what was rejected, is not offered again. One undo step. */
export async function runExtraction(id: ExtractionSourceId): Promise<void> {
  const p = extractionProvider(id)
  if (!p) return
  const ok = p.available()
  if (!ok.ok) { toast(sourceLabel(id) + ': ' + ok.reason); return }
  const raws = await p.run(getState().data)
  let added = 0
  const entry = act('Scanned the manuscript (' + sourceLabel(id) + ')', (d) => { added = ingestRaw(d.data, raws, id, d.data.today).added.length })
  const skipped = raws.length - added
  toastUndo(added + (added === 1 ? ' suggestion' : ' suggestions') + ' added' + (skipped ? '; ' + skipped + ' already offered or rejected before' : '') + '.', entry)
}

/** Add what an import preview showed: every row at once, nothing removed. One undo step. */
export function confirmImport(plan: ImportPlan): number {
  let added = 0
  const entry = act('Imported ' + plan.raws.length + ' from a file', (d) => { added = ingestRaw(d.data, plan.raws, 'imported', d.data.today).added.length })
  toastUndo(added + (added === 1 ? ' item' : ' items') + ' added to the Story Bible.', entry)
  return added
}

/**
 * Scan the manuscript with the rules and with every analysis tool that has been downloaded. Each source files its findings under its own
 * name; all of them are checked the same way (the 75% rule and the quote in the text). One undo step takes the whole scan back.
 */
export async function scanManuscript(): Promise<void> {
  const ids = scanSources(getState().ui, componentProvider().specs())
  const runs: Array<{ id: ExtractionSourceId; raws: Awaited<ReturnType<NonNullable<ReturnType<typeof extractionProvider>>['run']>> }> = []
  for (const id of ids) {
    const p = extractionProvider(id)
    if (!p) continue
    const ok = p.available()
    if (!ok.ok) { toast(sourceLabel(id) + ': ' + ok.reason); continue }
    runs.push({ id, raws: await p.run(getState().data) })
  }
  let added = 0
  const total = runs.reduce((n, r) => n + r.raws.length, 0)
  const entry = act('Scanned the manuscript (' + runs.map((r) => sourceLabel(r.id)).join(', ') + ')', (d) => {
    for (const r of runs) added += ingestRaw(d.data, r.raws, r.id, d.data.today).added.length
  })
  const skipped = total - added
  toastUndo(added + (added === 1 ? ' suggestion' : ' suggestions') + ' added' + (skipped ? '; ' + skipped + ' already offered or rejected before' : '') + '.', entry)
}
