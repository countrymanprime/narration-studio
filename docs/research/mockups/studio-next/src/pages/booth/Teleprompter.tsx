import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as RMouseEvent, type WheelEvent as RWheelEvent } from 'react'
import type { BookData, Paragraph, Pickup } from '@/domain/schemas'
import { paragraphNotes, unitWords, type BoothUnit, type UnitWords } from '@/selectors/booth'
import { isDone } from '@/selectors/pickups'
import { speakerVars } from '@/selectors/speakers'
import { browseView, openSpeakerMenu, setBoothRef, setReadingPosition } from '@/state/commands/booth'
import { wordsIn } from '@/format/text'
import { unitAtPosition } from '@/selectors/booth'
import { getState } from '@/state/store'
import { BookmarkRibbon } from '@/ui/BookmarkEditor'

/** Moves the view by a fraction of the viewport height (Page Up and Down); set by the mounted Teleprompter. */
let viewScroller: ((screens: number) => void) | null = null
export function scrollView(screens: number): void { viewScroller?.(screens) }

const UnitView = memo(function UnitView({ u, idx, mode, wcur, words, vars, from }: { u: BoothUnit; idx: number; mode: 'done' | 'cur' | 'next'; wcur: number; words: UnitWords; vars?: CSSProperties; from: boolean }) {
  return (
    <>
      {u.q && !u.cont ? (
        <button type="button" className={'bchip' + (u.conf ? '' : ' sug')} data-spk={u.spk} style={vars} data-pk2={u.key} aria-label={'Speaker ' + u.spk + '. Change speaker'}
          onClick={(e) => { e.stopPropagation(); openSpeakerMenu(e.currentTarget, u.key, u.spk, u.conf) }}>
          {u.spk}
        </button>
      ) : null}
      <span className={'bu' + (mode === 'cur' ? ' cur' : mode === 'done' ? ' done' : '') + (from ? ' pa' : '')} data-u={idx}
        onClick={(e) => {
          const w = (e.target as HTMLElement).closest<HTMLElement>('.w')
          setReadingPosition(idx, w ? +(w.dataset.w ?? 0) : 0)
          /* A Story Bible name or a marked word also shows its reference; any other word clears it. */
          const entryId = w?.dataset.ent || null
          const annId = w?.dataset.ann || null
          if (entryId || annId) setBoothRef({ entryId, annId })
          else if (getState().ui.booth.ref) setBoothRef(null)
        }}>
        {words.lead}
        {words.words.map((w) => {
          const st: Record<string, string> = {}
          if (w.mark) st['--mcb'] = 'var(--' + w.mark.colour + ')'
          if (w.entity) st['--ek'] = 'var(--' + w.entity + ')'
          const state = mode === 'cur' ? (w.i < wcur ? ' said' : w.i === wcur ? ' now' : '') : ''
          return (
            <Fragment key={w.i}>
              <span className={'w' + (w.mark ? ' bm' : '') + (w.entity ? ' bent' : '') + state} data-w={w.i} data-ent={w.entryId} data-ann={w.annId} style={Object.keys(st).length ? (st as CSSProperties) : undefined} title={w.mark?.name}>{w.text}</span>
              {w.gap}
            </Fragment>
          )
        })}
      </span>{' '}
    </>
  )
})

/** The ribbons of the chapter's bookmarks in the right margin, each level with the word its mark is on (not over the speaker chips, which sit in the text). */
function Ribbons({ data, paras, units, size, font, rail }: { data: BookData; paras: Paragraph[]; units: BoothUnit[]; size: number; font: string; rail: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const here = useMemo(
    () => data.bookmarks.flatMap((x) => {
      const text = paras.find((p) => p.id === x.pid)?.text
      const at = text == null ? null : unitAtPosition(paras, units, x.pid, wordsIn(text.slice(0, x.offset)))
      return at ? [{ x, ...at }] : []
    }),
    [data.bookmarks, paras, units],
  )
  const [tops, setTops] = useState<Record<string, number>>({})
  const measure = useCallback((): void => {
    const root = ref.current?.parentElement
    if (!root) return
    const next: Record<string, number> = {}
    here.forEach(({ x, cur, wcur }) => {
      const w = root.querySelector<HTMLElement>(`[data-u="${cur}"] .w[data-w="${wcur}"]`)
      if (w) next[x.id] = w.offsetTop
    })
    setTops((c) => (Object.keys(next).length === Object.keys(c).length && Object.keys(next).every((k) => next[k] === c[k]) ? c : next))
  }, [here])
  useLayoutEffect(measure, [measure, size, font, rail])
  useEffect(() => {
    const host = ref.current?.parentElement?.parentElement
    if (!host || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(host)
    return () => ro.disconnect()
  }, [measure])
  return <div className="bmk-margin" ref={ref}>{here.map(({ x }) => <BookmarkRibbon key={x.id} x={x} top={tops[x.id] ?? 0} />)}</div>
}

/**
 * Word-level follow: the current phrase is lit, words already read are dimmed, the word being read is marked,
 * and the line it is on stays near the top third of the screen.
 */
export function Teleprompter({ data, paras, units, cur, wcur, browse, punchAt, size, font, rail, lines, chapterId, pickMode }: {
  data: BookData; paras: Paragraph[]; units: BoothUnit[]; cur: number; wcur: number; browse: boolean; punchAt: number | null; size: number; font: string; rail: boolean
  lines: Pickup[]; chapterId: string; pickMode: boolean
}) {
  const sa = useRef<HTMLDivElement>(null)
  const tele = useRef<HTMLDivElement>(null)
  const words = useMemo(
    () => units.map((u) => unitWords(data, paras[u.pi], u.s, u.e)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [units, paras, data.annotations, data.bible, data.bibleTypes, data.marks],
  )
  const chipVars = useMemo(
    () => units.map((u) => speakerVars(data, u.spk) as CSSProperties | undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [units, data.bible, data.bibleTypes],
  )
  /* How far the narrator has scrolled the text away from the reading position, in pixels. */
  const off = useRef(0)
  const clampTy = (ty: number): number => {
    const t = tele.current
    const a = sa.current
    if (!t || !a) return ty
    return Math.max(-(t.offsetHeight - a.clientHeight * 0.6), Math.min(a.clientHeight * 0.4, ty))
  }
  const place = useCallback((): void => {
    const t = tele.current
    const a = sa.current
    if (!t || !a) return
    const cu = t.querySelector<HTMLElement>(`[data-u="${cur}"]`)
    if (!cu) return
    const ws = cu.querySelectorAll<HTMLElement>('.w')
    const el = ws[Math.max(0, Math.min(ws.length - 1, wcur))] ?? cu
    const ty0 = -(el.offsetTop - a.clientHeight * 0.4)
    if (!browse) { off.current = 0; t.style.transition = '' }
    t.style.transform = `translateY(${browse ? clampTy(ty0 + off.current) : ty0}px)`
  }, [cur, wcur, browse])
  useLayoutEffect(place, [place, units, size, font, rail])
  /* The Booth takes over the window after the first paint, and the window can be resized: place the text again whenever the box changes. */
  useEffect(() => {
    window.addEventListener('resize', place)
    const ro = typeof ResizeObserver === 'undefined' || !sa.current ? null : new ResizeObserver(place)
    if (ro && sa.current) ro.observe(sa.current)
    return () => {
      window.removeEventListener('resize', place)
      ro?.disconnect()
    }
  }, [place])

  /** Move the view by `px` from where it is now. The wheel follows the finger with no easing; the page keys ease. */
  const scrollBy = useCallback((px: number, eased: boolean): void => {
    const t = tele.current
    const a = sa.current
    if (!t || !a || !px) return
    const cu = t.querySelector<HTMLElement>(`[data-u="${cur}"]`)
    if (!cu) return
    const ws = cu.querySelectorAll<HTMLElement>('.w')
    const el = ws[Math.max(0, Math.min(ws.length - 1, wcur))] ?? cu
    const ty0 = -(el.offsetTop - a.clientHeight * 0.4)
    const ty = clampTy(ty0 + off.current - px)
    off.current = ty - ty0
    t.style.transition = eased ? '' : 'none'
    t.style.transform = `translateY(${ty}px)`
    browseView(Math.abs(off.current) > 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, wcur])
  useEffect(() => {
    viewScroller = (screens) => scrollBy(screens * (sa.current?.clientHeight ?? 0), true)
    return () => { viewScroller = null }
  }, [scrollBy])

  const onWheel = (e: RWheelEvent): void => {
    if (!e.deltaY) return
    /* Lines and pages (a mouse wheel in some browsers) are converted to pixels. */
    const px = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * (sa.current?.clientHeight ?? 0) : e.deltaY
    scrollBy(px, false)
  }
  /* A click on empty space (not on a phrase, a note or a speaker chip) clears the reference. */
  const onBackdrop = (e: RMouseEvent): void => {
    if (!(e.target as HTMLElement).closest('.bu,.bnote,.bchip') && getState().ui.booth.ref) setBoothRef(null)
  }

  let ui = -1
  return (
    <div className="bscript" id="sa" ref={sa} onWheel={onWheel} onClick={onBackdrop}>
      <div className="btext" id="tele" ref={tele}>
        {paras.map((p, pi) => {
          const pk = pickMode ? lines.find((x) => x.chapterId === chapterId && x.pid === p.id) : undefined
          const cls = pk ? 'pkp' + (isDone(data, pk.id) ? ' ok' : '') : undefined
          return (
            <p key={p.id} className={cls}>
              {units.filter((u) => u.pi === pi).map((u) => {
                ui++
                return <UnitView key={u.key} u={u} idx={ui} mode={ui === cur ? 'cur' : ui < cur ? 'done' : 'next'} wcur={ui === cur ? wcur : -1} words={words[ui]} vars={chipVars[ui]} from={ui === punchAt} />
              })}
              {paragraphNotes(data, p).map((n) => <span className="bnote" key={n.id} data-ann={n.id} onClick={() => setBoothRef({ entryId: null, annId: n.id })}>{n.name}: {n.text}</span>)}
            </p>
          )
        })}
        {data.bookmarks.length ? <Ribbons data={data} paras={paras} units={units} size={size} font={font} rail={rail} /> : null}
      </div>
    </div>
  )
}
