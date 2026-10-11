import { capsOf, dawLabel } from '@/selectors/daw'
import { modals } from '@/app/modals'
import { fmtD, parseIso } from '@/format/time'
import { NEUTRAL_PROFILE } from '@/fixtures/platforms'
import { numberedChapters } from '@/selectors/chapters'
import { vals } from '@/selectors/progress'
import { toast } from '@/ui/overlay'
import { clearSuggestions } from '../extractionCore'
import { getState, update } from '../store'

export type ImportMode = 'import' | 'replace'

/**
 * Open the import dialog once per "no manuscript" period. The Script page calls this when it shows its
 * empty state; the flag is cleared when a manuscript is imported, a new project starts or the mock state changes.
 */
export function ensureImportPrompt(): void {
  const s = getState()
  if (s.mock.hasManuscript) {
    if (s.ui.importPromptShown) update((d) => { d.ui.importPromptShown = false })
    return
  }
  if (s.ui.importPromptShown) return
  update((d) => { d.ui.importPromptShown = true })
  setTimeout(() => modals.importFlow('import'), 0)
}

/** The import or replace finished: flag the chapters whose text changed and say what happened. */
export function finishImport(mode: ImportMode): void {
  const s = getState()
  const daw = s.mock.setup !== 'builtin'
  const { changes } = s.data.pendingManuscript
  update((d) => {
    if (mode === 'replace') {
      for (const change of changes) {
        const c = d.data.chapters.find((x) => x.id === change.chapterId)
        if (!c) continue
        const rec = vals(s.data, c).rec
        if (rec > 0) {
          if (daw) c.flag = { text: 'Text changed: ' + change.what + '. Check the recording in ' + dawLabel(capsOf(s.mock).daw) + '.', type: 'daw' }
          else {
            c.archived = c.rec
            c.rec = 0
            c.edit = 0
            c.proof = 0
            c.flag = { text: 'Text changed: ' + change.what + '. ' + c.archived + '% of takes archived.', type: 'archived' }
          }
        } else c.flag = { text: 'Text changed: ' + change.what + '.', type: 'text' }
      }
    }
    /* Bookmarks belong to the text they sit in: a new manuscript starts without them. */
    d.data.bookmarks = []
    /* What was offered for the old text points at paragraphs that are gone. */
    clearSuggestions(d.data)
    d.ui.bible.selSug = null
    d.ui.script.bmAt = null
    d.ui.script.bmFlash = null
    d.mock.hasManuscript = true
    d.ui.importPromptShown = false
    d.data.manuscript.imported = fmtD(parseIso(d.data.today))
  })
  toast(mode === 'replace' ? 'Manuscript replaced. ' + changes.length + ' chapters flagged.' : 'Manuscript imported. ' + numberedChapters(s.data).length + ' chapters found.')
}

/** The narrator has looked at a flagged chapter. */
export function markReviewed(chapterId: string): void {
  update((d) => {
    const c = d.data.chapters.find((x) => x.id === chapterId)
    if (c) delete c.flag
  })
}

/** Bring back the takes the replace archived (built-in recorder). */
export function restoreArchived(chapterId: string): void {
  update((d) => {
    const c = d.data.chapters.find((x) => x.id === chapterId)
    if (!c) return
    c.rec = c.archived ?? 0
    c.edit = c.archived ?? 0
    c.proof = 0
    delete c.archived
    delete c.flag
  })
  toast('Archived takes restored.')
}

/** Open a project. Only the Alice project exists in this mock. */
export function openProject(id: string): boolean {
  const s = getState()
  if (id !== 'alice') {
    toast('That project is not available here.')
    return false
  }
  update((d) => { d.data.projectName = s.data.projects[0].name })
  toast(s.mock.launch === 'daw' ? 'Opened from ' + dawLabel(capsOf(s.mock).daw) + ': Alice.rpp' : 'Opened ' + s.data.projects[0].name)
  return true
}

/** Start an empty project and go to Script, which offers the import. */
export function newProject(): void {
  update((d) => {
    d.mock.hasManuscript = false
    d.data.bookmarks = []
    clearSuggestions(d.data)
    d.ui.bible.selSug = null
    d.ui.importPromptShown = false
    d.data.projectName = 'Untitled book'
    d.data.deliveryProfile = NEUTRAL_PROFILE
    d.ui.page = 'script'
  })
}

export function togglePin(id: string): void {
  update((d) => {
    d.ui.pinned = d.ui.pinned.includes(id) ? d.ui.pinned.filter((x) => x !== id) : [...d.ui.pinned, id]
  })
}
