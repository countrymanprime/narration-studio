import { paragraphChapter, pidLabel } from '@/selectors/chapters'
import { annById, markOf } from '@/selectors/annotations'
import { searchManuscript, snippet } from '@/selectors/search'
import { getState, update } from '@/state/store'
import { registerSearch } from './registry'

/** What the jump menu finds in the book: text in the manuscript, Story Bible entries, and the narrator's marks. */
registerSearch((term) => {
  const { data } = getState()
  const out = [] as ReturnType<Parameters<typeof registerSearch>[0]>
  const ms = searchManuscript(data, term)
  const open = (i: number): void => update((d) => {
    d.ui.script.find = { open: true, q: term, i: Math.max(0, i), list: true }
    d.ui.chapter = ms[i] ? paragraphChapter(d.data, ms[i].pid) : d.ui.chapter
    d.ui.page = 'script'
  })
  ms.slice(0, 6).forEach((m, i) => {
    const sn = snippet(data, m.pid, m.s, m.e)
    out.push({ g: 'In the manuscript', h: <>{sn.pre}<mark>{sn.hit}</mark>{sn.post}</>, sub: pidLabel(data, m.pid), fn: () => open(i) })
  })
  if (ms.length > 6) out.push({ g: 'In the manuscript', h: 'Show all ' + ms.length + ' matches', fn: () => open(0) })
  data.bible
    .filter((e) => e.name.toLowerCase().includes(term) || e.aka.some((a) => a.toLowerCase().includes(term)))
    .forEach((e) => out.push({ g: 'Story Bible', h: e.name, sub: e.kind, fn: () => update((d) => { d.ui.script.tab = 'bible'; d.ui.script.entryId = e.id; d.ui.script.miss = null; d.ui.page = 'script' }) }))
  data.annotations
    .filter((a) => a.type === 'mark' && ((a.q || '').toLowerCase().includes(term) || (a.text || '').toLowerCase().includes(term)))
    .slice(0, 5)
    .forEach((a) =>
      out.push({
        g: 'My marks', h: a.q + (a.text ? ' · ' + a.text.slice(0, 48) : ''), sub: markOf(data, a).name,
        fn: () => update((d) => {
          const an = annById(d.data, a.id)!
          d.ui.script.sel = a.id
          d.ui.script.tab = markOf(d.data, an).ask ? 'queries' : 'marks'
          d.ui.chapter = paragraphChapter(d.data, a.p)
          d.ui.script.pendingPid = a.p
          d.ui.page = 'script'
        }),
      }),
    )
  return out
})
