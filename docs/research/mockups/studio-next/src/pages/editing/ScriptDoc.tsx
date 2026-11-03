import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties, type MouseEvent, type ReactNode, type RefObject } from 'react'
import type { BookData, Passage, WordFx } from '@/domain/schemas'
import { clock } from '@/format/time'
import { paragraphNotes } from '@/selectors/booth'
import { speakerVars } from '@/selectors/speakers'
import { isLow, type ChapterDoc, type DocItem, type DocPara } from '@/selectors/scriptedit'
import type { MockState } from '@/state/slices/mock'
import type { EditingUi } from '@/state/slices/ui'
import {
  clickWord, removeWordFx, selectBetween, selectKeys, selectWord, setFollow, toggleTakes,
} from '@/state/commands/scriptedit'
import { I, L, openCtxAt } from '@/ui/overlay'
import { Icon } from '@/ui/Icon'
import { Wave } from './Ribbon'
import { FlagCard } from './FlagCard'
import { TakesChip, TakesInline } from './TakeParts'

const keyAt = (t: EventTarget | null): string | null => (t instanceof Element ? t.closest<HTMLElement>('[data-k]')?.dataset.k ?? null : null)

interface WordProps { it: DocItem; sel: boolean; cur: boolean; now: boolean; said: boolean; flag: boolean; join: boolean; fx: WordFx | undefined; fxEnd: boolean }

/** One word of the script, or one that was said and is not in it. */
function Word({ it, sel, cur, now, said, flag, join, fx, fxEnd }: WordProps) {
  const cls: string[] = []
  if (it.kind === 'x') cls.push('xw')
  else {
    cls.push('w')
    if (it.tok?.entity) cls.push('bent')
    if (it.tok?.mark) cls.push('bm')
  }
  if (it.cut) cls.push('cutw')
  else {
    /* A word the narrator accepted is not flagged any more. */
    if (it.accepted) cls.push('acc')
    else {
      if (it.st === 'mis') cls.push('st-mis')
      if (it.st === 'miss') cls.push('st-miss')
      if (it.kind === 'w' && isLow(it)) cls.push('low')
    }
    if (it.fx.length) cls.push('fx')
  }
  if (sel) cls.push('sel')
  if (cur && !sel) cls.push('cur')
  if (now) cls.push('now')
  else if (said) cls.push('said')
  if (flag) cls.push('flag')
  const st: Record<string, string> = {}
  if (it.tok?.mark) st['--mcb'] = 'var(--' + it.tok.mark.colour + ')'
  if (it.tok?.entity) st['--ek'] = 'var(--' + it.tok.entity + ')'
  const pct = Math.round(it.conf * 100)
  const tip = it.cut ? 'Cut from the audio'
    : it.st === 'extra' ? 'Not in the script · ' + clock(it.t0 ?? 0) + ' · ' + pct + '%'
      : it.st === 'miss' ? 'In the script, not read'
        : it.st === 'mis' ? 'Heard “' + (it.heard ?? '').replace(/[,.;”]+$/, '') + '” · ' + pct + '%'
          : isLow(it) && !it.accepted ? 'Low confidence ' + pct + '%' : undefined
  const body = (
    <span className={cls.join(' ')} data-k={it.key} id={'w-' + it.key} data-ent={it.tok?.entryId} aria-current={cur ? 'true' : undefined}
      style={Object.keys(st).length ? (st as CSSProperties) : undefined} title={tip}>{it.text}</span>
  )
  const gap = it.kind === 'x' ? ' ' : it.gap
  return (
    <Fragment>
      {body}
      {fx && fxEnd ? (
        <button type="button" className="fxmark" data-fxm={fx.id} aria-label={fx.chainName + ' on ' + fx.text + '. Options'} title={fx.chainName}
          onClick={(e) => {
            const el = e.currentTarget
            openCtxAt(el, [
              L(fx.chainName), I('Select the words', () => selectKeys(fx.keys)),
              I('Remove the effect', () => removeWordFx(fx.id)),
            ])
          }}><Icon name="sliders" /></button>
      ) : null}
      {join ? <span className="gapsel">{gap}</span> : gap}
    </Fragment>
  )
}

interface ParaProps {
  dp: DocPara
  data: BookData
  sel: ReadonlySet<string> | null
  cursor: string | null
  nowKey: string | null
  flag: string | null
  fx: ReadonlyMap<string, WordFx>
  /** The key of the last word of each effect. */
  fxEnds: ReadonlySet<string>
}
const ParaText = memo(function ParaText({ dp, data, sel, cursor, nowKey, flag, fx, fxEnds }: ParaProps) {
  const nowIdx = nowKey ? dp.items.findIndex((i) => i.key === nowKey) : -1
  const at = new Map(dp.items.map((i, k) => [i.key, k]))
  return (
    <p>
      {dp.units.map((us) => {
        const chip = us.u.q && !us.u.cont
        return (
          <Fragment key={us.u.key}>
            {chip ? <span className={'bchip' + (us.u.conf ? '' : ' sug')} data-spk={us.u.spk} style={speakerVars(data, us.u.spk) as CSSProperties | undefined}>{us.u.spk}</span> : null}
            <span className="bu">
              {us.lead}
              {us.items.map((it) => {
                const ix = at.get(it.key) ?? 0
                const nx = dp.items[ix + 1]
                const join = !!sel && sel.has(it.key) && !!nx && sel.has(nx.key) && (it.kind === 'x' || !!it.gap)
                return (
                  <Word key={it.key} it={it} sel={!!sel && sel.has(it.key)} cur={cursor === it.key} now={nowKey === it.key} said={nowIdx >= 0 && ix < nowIdx}
                    flag={flag === it.key} join={join} fx={it.fx.length ? fx.get(it.fx[0]) : undefined} fxEnd={fxEnds.has(it.key)} />
                )
              })}
            </span>{' '}
          </Fragment>
        )
      })}
    </p>
  )
})

/** The script, one row for each paragraph: the words with what differs marked, the line's notes, the ribbon under the active line, and its takes. */
export function ScriptDoc({ doc, data, ed, setup, passages, nowT, selKeys, className, toolbar }: {
  doc: ChapterDoc
  data: BookData
  ed: EditingUi
  setup: MockState['setup']
  passages: Passage[]
  nowT: number | null
  selKeys: string[]
  className?: string
  /** The floating toolbar under the selection; it measures the words in this scroller. */
  toolbar?: (host: RefObject<HTMLDivElement | null>) => ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<string | null>(null)
  const byPid = useMemo(() => new Map(passages.map((p) => [p.pid, p])), [passages])
  const selSet = useMemo(() => new Set(selKeys), [selKeys])
  const fx = useMemo(() => new Map(data.wordFx.map((f) => [f.id, f])), [data.wordFx])
  const fxEnds = useMemo(() => new Set(data.wordFx.map((f) => f.keys[f.keys.length - 1])), [data.wordFx])
  const nowItem = nowT == null ? null : doc.items.filter((i) => i.t0 != null && !i.cut && i.st !== 'miss' && i.t0 <= nowT + 1e-6).pop() ?? null
  const nowKey = nowItem?.key ?? null
  const activePid = (nowItem ?? doc.items[doc.index.get(ed.sel?.head ?? ed.cursor ?? '') ?? -1])?.pid ?? null

  useEffect(() => {
    const up = (): void => { drag.current = null }
    document.addEventListener('mouseup', up)
    return () => document.removeEventListener('mouseup', up)
  }, [])

  /* The cursor comes into view when the keys move it; the playing word stays in view until the narrator scrolls by hand. */
  const lastCursor = useRef<string | null>(null)
  useLayoutEffect(() => {
    const c = box.current
    const k = ed.sel?.head ?? ed.cursor
    if (!c || !k || lastCursor.current === k) return
    lastCursor.current = k
    const el = c.querySelector<HTMLElement>('[data-k="' + CSS.escape(k) + '"]')
    if (!el) return
    const r = el.getBoundingClientRect()
    const b = c.getBoundingClientRect()
    if (r.top < b.top + 8 || r.bottom > b.bottom - 8) c.scrollTop += r.top - b.top - b.height * 0.35
  }, [ed.cursor, ed.sel])
  useLayoutEffect(() => {
    const c = box.current
    if (!c || !nowKey || !ed.follow) return
    const el = c.querySelector<HTMLElement>('[data-k="' + CSS.escape(nowKey) + '"]')
    if (!el) return
    const r = el.getBoundingClientRect()
    const b = c.getBoundingClientRect()
    if (r.top < b.top + b.height * 0.12 || r.bottom > b.top + b.height * 0.7) c.scrollTop += r.top - b.top - b.height * 0.3
  }, [nowKey, ed.follow])
  /* Opening Editing at a passage brings it into view. */
  const openedFor = useRef<string | null>(null)
  useLayoutEffect(() => {
    const c = box.current
    if (!c || !ed.passage || openedFor.current === ed.passage + '/' + data.passages.length) return
    openedFor.current = ed.passage + '/' + data.passages.length
    const p = data.passages.find((x) => x.id === ed.passage)
    const row = p ? c.querySelector<HTMLElement>('[data-pid="' + CSS.escape(p.pid) + '"]') : null
    if (!row) return
    const r = row.getBoundingClientRect()
    const b = c.getBoundingClientRect()
    /* Only when the line is out of sight: a click or a key inside it must not move the text under the pointer. */
    if (r.bottom < b.top + 20 || r.top > b.bottom - 20) c.scrollTop = Math.max(0, row.offsetTop - c.clientHeight * 0.16)
  }, [ed.passage, data.passages])

  const onDown = (e: MouseEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    const k = keyAt(e.target)
    if (!k) return
    if ((e.target as Element).closest('button,.bnote')) return
    if (e.detail >= 2) { selectWord(k); drag.current = null; return }
    if (e.shiftKey) { clickWord(k, true); return }
    drag.current = k
    clickWord(k)
  }
  const onOver = (e: MouseEvent<HTMLDivElement>): void => {
    if (!drag.current || e.buttons !== 1) return
    const k = keyAt(e.target)
    if (k && k !== (ed.sel?.head ?? ed.cursor)) selectBetween(drag.current, k)
  }
  /* A hand scroll (wheel, touch, the scrollbar) stops the text following the voice until the next play. */
  const byHand = (): void => { if (ed.playT != null) setFollow(false) }

  return (
    <div ref={box} className={'sx-scroll ' + (className ?? '')} tabIndex={0} role="textbox" aria-readonly="true" aria-multiline="true" aria-label="Script with what was heard"
      aria-activedescendant={ed.cursor && doc.index.has(ed.cursor) ? 'w-' + ed.cursor : undefined} data-script
      onMouseDown={onDown} onMouseOver={onOver} onWheel={byHand} onTouchMove={byHand}
      onKeyDown={(e) => { if (e.key === 'PageUp' || e.key === 'PageDown') byHand() }}>
      <div className="btext sdoc">
        {doc.paras.map((dp) => {
          const ps = byPid.get(dp.p.id)
          const on = dp.p.id === activePid
          const open = !!ps && ed.openTakes.includes(ps.id)
          const touchesSel = selKeys.length > 0 && dp.items.some((i) => selSet.has(i.key))
          const hasCursor = !!ed.cursor && dp.items.some((i) => i.key === ed.cursor)
          const flagHere = ed.flag && (ed.flag === 'dup:' + dp.p.id || dp.items.some((i) => i.key === ed.flag)) ? ed.flag : null
          const notes = paragraphNotes(data, dp.p)
          const timed = dp.items.filter((i) => i.t0 != null && !i.cut && i.st !== 'miss')
          const r0 = timed.length ? timed[0].t0! - 0.6 : 0
          const r1 = timed.length ? timed[timed.length - 1].t1! + 0.6 : 0
          return (
            <div key={dp.p.id} className={'sp' + (on ? ' cur' : '') + (dp.recorded ? '' : ' unrec')} data-pid={dp.p.id}>
              <div className="sp-g">
                <span className="mono tcode">{dp.start != null ? clock(dp.start).slice(0, 5) : ''}</span>
                {ps ? <button type="button" className="pbadge on" aria-label={ps.takes.length + ' takes. Show them'} onClick={() => toggleTakes(ps.id)}>{ps.takes.length}</button> : null}
              </div>
              <div className="sp-b">
                <ParaText dp={dp} data={data} sel={touchesSel ? selSet : null} cursor={hasCursor ? ed.cursor : null} nowKey={nowItem?.pid === dp.p.id ? nowKey : null}
                  flag={flagHere} fx={fx} fxEnds={fxEnds} />
                {notes.map((n) => <span className="bnote" key={n.id} data-ann={n.id}>{n.name}: {n.text}</span>)}
                {flagHere ? <FlagCard dp={dp} flag={flagHere} data={data} /> : null}
                {on && timed.length ? (
                  <div className="ribbon" aria-label="Waveform of the active take under this line">
                    <div className="rb-h"><span className="mono">{dp.take?.id ?? '—'}</span><span className="sub">{dp.take ? 'active take' : 'recording'} · {clock(r0)} to {clock(r1)}</span></div>
                    <Wave items={dp.items} t0={r0} t1={r1} now={nowT} sel={touchesSel ? selKeys : undefined} h={52} />
                  </div>
                ) : null}
                {ps ? (
                  <div className="sx-tkw">
                    <TakesChip data={data} p={ps} open={open} onToggle={() => toggleTakes(ps.id)} />
                    {open ? <TakesInline data={data} p={ps} ed={ed} setup={setup} /> : null}
                  </div>
                ) : null}
              </div>
            </div>
          )
        })}
        {toolbar ? toolbar(box) : null}
      </div>
    </div>
  )
}
