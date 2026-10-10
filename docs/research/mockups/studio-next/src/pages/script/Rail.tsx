import { useRef, type KeyboardEvent } from 'react'
import { setDrawer } from '@/state/commands/script'
import type { ScriptUi } from '@/state/slices/ui'
import { update, useUi } from '@/state/store'
import { Icon } from '@/ui/Icon'
import { IconButton } from '@/ui/primitives'
import { BibleTab } from './BibleTab'
import { ThreadsTab } from './ThreadsTab'
import { WordsTab } from './WordsTab'
import { BookmarksTab } from './BookmarksTab'

const TABS: Array<[ScriptUi['tab'], string]> = [['pron', 'Words'], ['bible', 'Story Bible'], ['marks', 'Notes'], ['queries', 'Queries'], ['bookmarks', 'Bookmarks']]

/** The side panel: words to say, Story Bible, notes, queries. It follows the chapter in view. */
export function RailPanel() {
  const ui = useUi()
  const tab = ui.script.tab
  const chId = ui.script.spyAt ?? ui.chapter
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const onKey = (e: KeyboardEvent): void => {
    const i = refs.current.indexOf(document.activeElement as HTMLButtonElement)
    if (i < 0 || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return
    e.preventDefault()
    const n = (i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length
    update((d) => { d.ui.script.tab = TABS[n][0] })
    refs.current[n]?.focus()
  }
  return (
    <section className="panel railpanel" aria-label="Words, Story Bible and marks">
      <div className="ph railhead">
        <span className="label">Lookups and marks</span><span className="spacer" />
        <IconButton icon="x" tip="Close" tipSide="l" onClick={() => setDrawer('close')} />
      </div>
      <div className="tabs" role="tablist" onKeyDown={onKey}>
        {TABS.map(([k, l], i) => (
          <button
            key={k} type="button" role="tab" data-tab={k} aria-selected={tab === k} tabIndex={tab === k ? 0 : -1}
            ref={(el) => { refs.current[i] = el }}
            onClick={() => update((d) => { d.ui.script.tab = k })}
            {...(k === 'bookmarks' ? { 'aria-label': l, 'data-tip': l, style: { flex: '0 0 auto', padding: '11px 12px' } } : {})}
          >{k === 'bookmarks' ? <Icon name="bookmark" /> : l}</button>
        ))}
      </div>
      <div className="pb stack" id="railbody">
        {tab === 'pron' ? <WordsTab chId={chId} /> : tab === 'bible' ? <BibleTab chId={chId} /> : tab === 'bookmarks' ? <BookmarksTab /> : <ThreadsTab chId={chId} asks={tab === 'queries'} />}
      </div>
    </section>
  )
}
