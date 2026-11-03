import { Fragment, memo, type CSSProperties, type ReactNode } from 'react'
import { useLayoutEffect, useRef, useState } from 'react'
import type { BookData, Bookmark, Paragraph } from '@/domain/schemas'
import { BookmarkRibbon } from '@/ui/BookmarkEditor'
import { lineTop } from './selection'
import { markOf } from '@/selectors/annotations'
import { typeColour } from '@/selectors/bible'
import { speakerVars } from '@/selectors/speakers'
import type { Match } from '@/selectors/search'
import { segmentsOf, type Cover } from '@/selectors/segments'

function wrap(data: BookData, c: Cover, sel: string | null, inner: ReactNode): ReactNode {
  if (c.kind === 'entity') {
    return <span className="a-ent" data-ent={c.entryId} data-k={c.entryKind} style={{ ['--ek' as string]: 'var(--' + typeColour(data, c.entryKind) + ')' } as CSSProperties}>{inner}</span>
  }
  if (c.kind === 'find') return <span className={'a-find' + (c.current ? ' a-find-cur' : '')}>{inner}</span>
  if (c.kind === 'phrase') {
    const ph = c.phrase
    return <span className={'phr' + (c.first ? ' phr-first' : '') + (ph.confirmed ? '' : ' phr-sug')} data-ph={ph.key} data-spk={ph.spk} style={speakerVars(data, ph.spk) as CSSProperties | undefined}>{inner}</span>
  }
  const an = c.ann
  const act = sel === an.id ? ' a-active' : ''
  if (an.type === 'mark') {
    const mt = markOf(data, an)
    const end = c.end ? (mt.ask ? ' e-query' : an.text ? ' e-note' : '') : ''
    return <span className={'a-mark' + end + act} data-a={an.id} data-st={mt.st} title={mt.name} style={{ ['--mc' as string]: 'var(--' + mt.c + ')' } as CSSProperties}>{inner}</span>
  }
  return <span className={'a-pron' + act} data-a={an.id}>{inner}</span>
}

interface Props { data: BookData; p: Paragraph; matches: Match[] | null; cur: number; sel: string | null; marks: Bookmark[]; lk: string; flash: boolean; zoom: number }

/** The ribbons of a paragraph's bookmarks, in the reader's gutter, each level with the line its mark is on. */
function Gutter({ marks, lk, zoom, flash }: { marks: Bookmark[]; lk: string; zoom: number; flash: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [tops, setTops] = useState<number[]>([])
  const measure = (): void => {
    const p = ref.current?.parentElement?.querySelector<HTMLElement>('p[data-pid]')
    if (!p) return
    const next = marks.map((x) => Math.round(lineTop(p, x.offset, zoom)))
    setTops((cur) => (cur.length === next.length && cur.every((v, i) => v === next[i]) ? cur : next))
  }
  useLayoutEffect(measure, [marks, lk, zoom])
  useLayoutEffect(() => {
    const p = ref.current?.parentElement?.querySelector<HTMLElement>('p[data-pid]')
    if (!p || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(p)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marks, lk, zoom])
  return (
    <div className="bmk-gutter" ref={ref}>
      {marks.map((x, i) => <BookmarkRibbon key={x.id} x={x} top={tops[i] ?? 0} flash={flash} />)}
    </div>
  )
}

/** One paragraph: its text split at every annotation, Story Bible name, quoted phrase and find match. */
export const ParaView = memo(function ParaView({ data, p, matches, cur, sel, marks, lk, flash, zoom }: Props) {
  const segs = segmentsOf(data, p, matches ? { matches, current: cur } : null)
  return (
    <div className={'para' + (flash ? ' bm-flash' : '')} data-pid={p.id} data-ch={p.chapterId}>
      <p data-pid={p.id}>
        {segs.map((s) => {
          let node: ReactNode = s.text
          s.covers.forEach((c) => { node = wrap(data, c, sel, node) })
          return <Fragment key={s.start}>{node}</Fragment>
        })}
      </p>
      {marks.length ? <Gutter marks={marks} lk={lk} zoom={zoom} flash={flash} /> : null}
    </div>
  )
})
