import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { modals } from '@/app/modals'
import { bookmarkInScript } from '@/app/bookmarks'
import { recordFromHere } from '@/state/commands/booth'
import { flagWord, lookup, sbMark } from '@/state/commands/script'
import { useData, useStudio } from '@/state/store'
import { Icon } from '@/ui/Icon'
import { Btn, IconButton } from '@/ui/primitives'
import { closePop, popAt } from '@/ui/overlay'
import { openMarkComposer } from './dialogs'
import type { Sel } from './selection'

type Single = Extract<NonNullable<Sel>, { pid: string }>

function MarkMenu({ g, done }: { g: Single; done: () => void }) {
  const data = useData()
  return (
    <div className="stack" style={{ gap: 2 }}>
      {data.marks.map((x) => (
        <button key={x.k} type="button" className="item" data-mk={x.k} onClick={() => { closePop(); done(); openMarkComposer(x.k, g) }}>
          <span className="swatch" style={{ ['--mc' as string]: 'var(--' + x.c + ')' } as CSSProperties} />{x.name}
        </button>
      ))}
      <hr style={{ border: 0, borderTop: '1px solid var(--line)', width: '100%' }} />
      <button type="button" className="item" data-mw onClick={() => { closePop(); done(); flagWord(g) }}>Pronunciation (a word)</button>
      <button type="button" className="item" data-mm onClick={() => { closePop(); modals.marks() }}>Define marks…</button>
    </div>
  )
}

function KindMenu({ g, done }: { g: Single; done: () => void }) {
  const kinds = useData().bibleTypes
  return (
    <div className="stack" style={{ gap: 2 }}>
      <div className="label" style={{ padding: '4px 10px' }}>Add to the Story Bible as</div>
      {kinds.map((x) => (
        <button key={x.k} type="button" className="item" data-sb={x.k} onClick={() => { closePop(); done(); sbMark(x.k, g) }}>{x.k}</button>
      ))}
    </div>
  )
}

/** The small toolbar over a selection in the reader: mark, add to the Story Bible, look up. */
export function SelectionTool({ g, onDone }: { g: NonNullable<Sel>; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const zoom = useStudio((s) => s.ui.prefs.zoom) || 1
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.getBoundingClientRect().width / zoom
    el.style.left = Math.max(8, Math.min(g.rect.left / zoom + g.rect.width / zoom / 2 - w / 2, document.documentElement.clientWidth - w - 8)) + 'px'
    el.style.top = Math.max(8, g.rect.top / zoom - 46) + 'px'
  })
  useEffect(() => {
    const el = ref.current
    const kd = (e: KeyboardEvent): void => { if (e.key === 'Escape') onDone() }
    document.addEventListener('keydown', kd)
    el?.addEventListener('dismiss', onDone)
    return () => {
      document.removeEventListener('keydown', kd)
      el?.removeEventListener('dismiss', onDone)
    }
  }, [onDone])
  const keep = (e: { preventDefault: () => void }): void => e.preventDefault()
  const host = document.getElementById('layer') ?? document.body
  return createPortal(
    <div ref={ref} className="seltool" role="toolbar" aria-label="Selection tools">
      {'multi' in g && g.multi ? (
        <button type="button" disabled style={{ opacity: 1 }} onMouseDown={keep}>Select within one paragraph</button>
      ) : (
        <>
          <Btn className="chip-tool" data-keeppop onMouseDown={keep} onClick={(e) => popAt(e.currentTarget, () => <MarkMenu g={g as Single} done={onDone} />)}><Icon name="marker" />Mark</Btn>
          <Btn className="chip-tool" data-keeppop onMouseDown={keep} onClick={(e) => popAt(e.currentTarget, () => <KindMenu g={g as Single} done={onDone} />)}><Icon name="book" />Story Bible</Btn>
 <IconButton icon="bookmark" tip="Bookmark here (B)" id="selbm" onMouseDown={keep} onClick={() => { onDone(); bookmarkInScript({ pid: (g as Single).pid, offset: (g as Single).s }) }} />
          <IconButton icon="record" className="rec" tip="Record from here" id="selrec" onMouseDown={keep} onClick={() => { onDone(); recordFromHere((g as Single).pid, (g as Single).s) }} />
          <Btn className="chip-tool" onMouseDown={keep} onClick={() => { onDone(); lookup((g as Single).q, g as Single) }}>Look up</Btn>
        </>
      )}
    </div>,
    host,
  )
}
