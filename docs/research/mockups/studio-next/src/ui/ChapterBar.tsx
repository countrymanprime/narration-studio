import { chName } from '@/selectors/chapters'
import { getState, update, useData, useUi } from '@/state/store'
import { openMenu } from './Menu'
import { IconButton } from './primitives'
import { toast } from './overlay'

type ScopeKey = 'proof' | 'pickups'

/** Pages whose arrow keys (left and right, no modifier) step the chapter; elsewhere it is Alt with up and down. */
export const ARROW_CHAPTER_PAGES: string[] = ['proof']

/** Pages with a chapter picker: the current chapter is shared by all of them. */
export function stepChapter(d: number): void {
  const s = getState()
  const key: ScopeKey | null = s.ui.page === 'proof' ? 'proof' : s.ui.page === 'pickups' ? 'pickups' : null
  if (key && s.ui[key].scope === 'all') {
    update((x) => { x.ui[key].scope = 'chapter' })
    return
  }
  const base = s.ui.page === 'master' ? s.ui.master.row ?? s.ui.chapter : s.ui.chapter
  const cs = s.data.chapters
  const i = Math.max(0, cs.findIndex((c) => c.id === base))
  if ((d < 0 && i <= 0) || (d > 0 && i >= cs.length - 1)) return
  chooseChapter(cs[Math.max(0, Math.min(cs.length - 1, i + d))].id)
}

export function chooseChapter(v: string): void {
  const s = getState()
  const page = s.ui.page
  if (page === 'booth' && s.ui.booth.rec) {
    toast('Stop recording first.')
    return
  }
  const key: ScopeKey | null = page === 'proof' ? 'proof' : page === 'pickups' ? 'pickups' : null
  update((d) => {
    if (v === '*') {
      if (key) d.ui[key].scope = 'all'
      return
    }
    d.ui.chapter = v
    if (key) d.ui[key].scope = 'chapter'
    if (page === 'master') d.ui.master.row = v
    d.ui.booth.cur = 0
    d.ui.booth.wcur = 0
  })
}

/** The chapter bar: previous, a fixed-width picker that lists every chapter, next. `allowAll` adds "All chapters". */
export function ChapterBar({ scopeKey }: { scopeKey: ScopeKey | null }) {
  const data = useData()
  const ui = useUi()
  const isAll = !!scopeKey && ui[scopeKey].scope === 'all'
  const curId = ui.page === 'master' ? ui.master.row ?? ui.chapter : ui.chapter
  const c = data.chapters.find((x) => x.id === curId) ?? data.chapters.find((x) => x.id === '8') ?? data.chapters[0]
  const label = isAll ? 'All chapters' : chName(data, c)
  const ci = data.chapters.indexOf(c)
  const arrows = ARROW_CHAPTER_PAGES.includes(ui.page)
  return (
    <div className="chapbar" role="group" aria-label="Chapter">
      <IconButton icon="stepPrev" tip={'Previous chapter (' + (arrows ? '←' : 'Alt+↑') + ')'} onClick={() => stepChapter(-1)} disabled={!isAll && ci <= 0} />
      <button
        type="button" className="btn chapsel" id="chapsel" data-keeppop aria-haspopup="menu" aria-label={'Chapter: ' + label + '. Change chapter'}
        onClick={(e) =>
          openMenu(
            e.currentTarget,
            [...(scopeKey ? [{ v: '*', l: 'All chapters' }] : []), ...data.chapters.map((x) => ({ v: x.id, l: chName(data, x) }))],
            isAll ? '*' : curId,
            chooseChapter,
          )
        }
      >
        <span className="cl">{label}</span>
        <span aria-hidden="true">▾</span>
      </button>
      <IconButton icon="stepNext" tip={'Next chapter (' + (arrows ? '→' : 'Alt+↓') + ')'} onClick={() => stepChapter(1)} disabled={!isAll && ci >= data.chapters.length - 1} />
    </div>
  )
}
