import { bookmarkInScript, stepInScript } from '@/app/bookmarks'
import { registerKeys } from '@/app/registry'
import { closeFind, jumpToChapter, setDrawer } from '@/state/commands/script'
import { getState } from '@/state/store'

/** Keys of the Script page. Arrows scroll, and change the prep state, inside the reader itself. */
registerKeys('script', (e, info) => {
  const { ui, data, mock } = getState()
  if (!mock.hasManuscript) return
  const s = ui.script
  if (e.key === 'Escape') {
    if (!info.hadPop && s.find.open && !s.drawer) { closeFind(); return true }
    if (s.drawer) { setDrawer('close'); return true }
    return
  }
  /* B bookmarks the selection, the caret or the top of the page. ] and [ go to the next and the previous bookmark. */
  if (info.plain && !info.typing && !e.repeat && !e.shiftKey && (e.key.toLowerCase() === 'b' || e.key === ']' || e.key === '[')) {
    e.preventDefault()
    if (e.key === ']') stepInScript(1)
    else if (e.key === '[') stepInScript(-1)
    else bookmarkInScript()
    return true
  }
  /* Alt+arrows: the chapter before or after the one in view. */
  if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && !info.typing) {
    const cur = s.spyAt ?? ui.chapter
    const i = Math.max(0, data.chapters.findIndex((c) => c.id === cur))
    const n = data.chapters[Math.max(0, Math.min(data.chapters.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]
    e.preventDefault()
    if (n) jumpToChapter(n.id)
    return true
  }
})
