import type { KeyboardEvent } from 'react'
import { isAsk } from '@/selectors/annotations'
import { annsInChapter } from '@/selectors/annotations'
import { chLabel } from '@/selectors/chapters'
import { jumpToChapter, PREP_LABELS, setDrawer } from '@/state/commands/script'
import { useData, useUi } from '@/state/store'
import { IconButton } from '@/ui/primitives'

export function ChapterList() {
  const data = useData()
  const ui = useUi()
  const cur = ui.script.spyAt ?? ui.chapter
  const onKey = (e: KeyboardEvent<HTMLUListElement>): void => {
    const bs = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[data-jump]')]
    const i = bs.indexOf(document.activeElement as HTMLButtonElement)
    if (i < 0) return
    let n: number | null = null
    if (e.key === 'ArrowDown') n = Math.min(bs.length - 1, i + 1)
    else if (e.key === 'ArrowUp') n = Math.max(0, i - 1)
    else if (e.key === 'Home') n = 0
    else if (e.key === 'End') n = bs.length - 1
    if (n != null) {
      e.preventDefault()
      bs.forEach((b) => { b.tabIndex = -1 })
      bs[n].tabIndex = 0
      bs[n].focus()
    }
  }
  return (
    <section className="panel chpanel" aria-label="Chapters">
      <div className="ph railhead">
        <span className="label">Chapters</span><span className="spacer" />
        <IconButton icon="x" tip="Close" tipSide="l" onClick={() => setDrawer('close')} />
      </div>
      <ul className="chlist" id="chlist" aria-label="Chapters" onKeyDown={onKey}>
        {data.chapters.map((c) => {
          const label = chLabel(data, c)
          const open = annsInChapter(data, c.id).some((a) => isAsk(data, a) && a.status !== 'resolved')
          return (
            <li key={c.id}>
              <button
                type="button" data-jump={c.id} tabIndex={c.id === cur ? 0 : -1} aria-current={c.id === cur}
                onClick={() => { jumpToChapter(c.id); if (ui.script.drawer) setDrawer('close') }}
              >
                <span className={'pdot ' + c.prep} title={PREP_LABELS[c.prep]} />
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  {label ? <span className="chl">{label}</span> : null}
                  <span>{c.title}</span>
                </span>
                {open ? <span className="pill warn" title="Open queries">?</span> : null}
              </button>
            </li>
          )
        })}
      </ul>
      <div className="legend" style={{ flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
        <span><span className="pdot none" /> Not started</span>
        <span><span className="pdot progress" /> In progress</span>
        <span><span className="pdot prepped" /> Prepped</span>
      </div>
    </section>
  )
}
