import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { modals } from '@/app/modals'
import { num } from '@/format/time'
import { chLabel, chName, chTag, paragraphsOf } from '@/selectors/chapters'
import { WPH } from '@/selectors/progress'
import { readerVars, widthName } from '@/selectors/reader'
import type { Match } from '@/selectors/search'
import { chapterFacts } from '@/selectors/annotations'
import { unattributed } from '@/selectors/phrases'
import { openInBooth } from '@/state/commands/nav'
import {
  openFind, PREP_LABELS, PREP_ORDER, reviewFlag, setDrawer, setPrep, showAnnotation, showBookmarks, showEntry, stepPrep,
} from '@/state/commands/script'
import { getState, update, useData, useUi } from '@/state/store'
import { IconButton } from '@/ui/primitives'
import { TextSettings } from '@/ui/TextSettings'
import { openCtx, popAt } from '@/ui/overlay'
import { FindBar } from './FindBar'
import { ParaView } from './Para'
import { getSel, lineTop, type Sel } from './selection'
import type { Bookmark } from '@/domain/schemas'
import { bookmarkById } from '@/selectors/bookmarks'
import { SelectionTool } from './SelectionTool'
import { openSpeakerPicker } from '@/ui/SpeakerPicker'
import { Legend } from './Legend'

const NO_MARKS: Bookmark[] = []
const POS_KEY = 'ns2-pos'
const readPos = (): { ch: string; off: number } | null => {
  try {
    const v = localStorage.getItem(POS_KEY)
    return v ? JSON.parse(v) : null
  } catch {
    return null
  }
}
const savePos = (ch: string | null, off: number): void => {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify({ ch, off }))
  } catch {
    /* storage can be unavailable */
  }
}

export function Reader({ matches }: { matches: Match[] }) {
  const data = useData()
  const ui = useUi()
  const s = ui.script
  const rs = useRef<HTMLDivElement>(null)
  const [para, setPara] = useState('')
  const [tool, setTool] = useState<Sel>(null)
  const mounted = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const jump = useCallback((id: string) => {
    const r = rs.current
    const el = document.getElementById('ch-' + id)
    if (r && el) r.scrollTop = el.offsetTop - 8
    update((d) => { d.ui.script.spyAt = id })
  }, [])
  const toPid = useCallback((pid: string) => {
    const r = rs.current
    const el = r?.querySelector<HTMLElement>('p[data-pid="' + pid + '"]')
    const para = el?.closest<HTMLElement>('.para')
    if (r && para) r.scrollTop = para.offsetTop - 100
  }, [])
  const updateSpy = useCallback(() => {
    const r = rs.current
    if (!r || !r.scrollHeight) return
    const bs = [...r.querySelectorAll<HTMLElement>('.bound')]
    if (!bs.length) return
    let cur = bs[0]
    bs.forEach((b) => { if (b.offsetTop - r.scrollTop <= 70) cur = b })
    const id = cur.dataset.ch as string
    const ps = [...r.querySelectorAll<HTMLElement>('.para')].filter((p) => p.dataset.ch === id)
    let n = 0
    ps.forEach((p, i) => { if (p.offsetTop - r.scrollTop <= 80) n = i + 1 })
    setPara(ps.length ? '¶ ' + Math.max(1, n) + ' of ' + ps.length : '')
    if (getState().ui.script.spyAt !== id) update((d) => { d.ui.script.spyAt = id })
  }, [])

  /* First draw: go where the narrator was. Later: honour requests to scroll. */
  useLayoutEffect(() => {
    const st = getState().ui
    const r = rs.current
    if (!r) return
    if (!mounted.current) {
      mounted.current = true
      if (st.script.pendingJump) jump(st.script.pendingJump)
      else if (st.script.spyAt !== st.chapter) jump(st.chapter)
      else {
        const pos = readPos()
        if (pos) r.scrollTop = pos.off
        else jump(st.chapter)
      }
      if (st.script.pendingJump) update((d) => { d.ui.script.pendingJump = null })
    } else if (s.pendingJump) {
      jump(s.pendingJump)
      update((d) => { d.ui.script.pendingJump = null })
    }
    if (s.pendingPid) {
      toPid(s.pendingPid)
      update((d) => { d.ui.script.pendingPid = null })
    }
    updateSpy()
  }, [s.pendingJump, s.pendingPid, jump, toPid, updateSpy])

  /* Go to a bookmark: the line it is on goes a little below the heading. */
  useLayoutEffect(() => {
    if (!s.pendingBm) return
    const st = getState()
    const x = bookmarkById(st.data, s.pendingBm)
    const r = rs.current
    const p = x && r?.querySelector<HTMLElement>('p[data-pid="' + x.pid + '"]')
    const para = p?.closest<HTMLElement>('.para')
    const z = st.ui.prefs.zoom || 1
    if (x && r && p && para) r.scrollTop = Math.max(0, para.offsetTop + lineTop(p, x.offset, z) - 120)
    update((d) => { d.ui.script.pendingBm = null })
    updateSpy()
  }, [s.pendingBm, updateSpy])

  /* Find: bring the current match into view. */
  useEffect(() => {
    if (!s.find.open) return
    const el = document.querySelector<HTMLElement>('.a-find-cur')
    const r = rs.current
    if (!el || !r) return
    const z = getState().ui.prefs.zoom || 1
    r.scrollTop += (el.getBoundingClientRect().top - r.getBoundingClientRect().top) / z - r.clientHeight / 3
  }, [s.find.open, s.find.q, s.find.i])

  useEffect(() => () => clearTimeout(timer.current), [])
  const chId = s.spyAt ?? ui.chapter
  const chap = data.chapters.find((c) => c.id === chId) ?? data.chapters[0]
  const dismiss = useCallback(() => setTool(null), [])
  /* Each paragraph with bookmarks gets its own list, so only those redraw when one changes. */
  const marksBy = useMemo(() => {
    const m = new Map<string, Bookmark[]>()
    data.bookmarks.forEach((x) => m.set(x.pid, [...(m.get(x.pid) ?? []), x]))
    return m
  }, [data.bookmarks])
  const lk = [ui.prefs.readerFont, ui.prefs.readerSize, ui.prefs.readerSpacing, ui.prefs.readerWidth].join('|')
  const zoom = ui.prefs.zoom || 1

  const onClick = (e: MouseEvent<HTMLDivElement>): void => {
    const t = e.target as Element
    /* A click in the text puts the next / previous bookmark keys back to going from where the narrator is. */
    if (!t.closest('[data-bm]') && getState().ui.script.bmAt) update((d) => { d.ui.script.bmAt = null })
    const rec = t.closest<HTMLElement>('[data-rec]')
    if (rec) { openInBooth(rec.dataset.rec as string); return }
    const pr = t.closest<HTMLElement>('[data-prep]')
    if (pr) { const [id, k] = (pr.dataset.prep as string).split(':'); setPrep(id, k as (typeof PREP_ORDER)[number]); return }
    const fl = t.closest<HTMLElement>('[data-flagok]')
    if (fl) { reviewFlag(fl.dataset.flagok as string); return }
    /* The speaker chip is drawn by CSS just left of a phrase's first words; a click there opens the speaker menu. */
    const ph = t.closest<HTMLElement>('.phr-first[data-ph]')
    if (ph) {
      const sel = window.getSelection()
      const walk = (n: Node): Text | null => {
        for (const c of Array.from(n.childNodes)) {
          if (c.nodeType === 3 && (c.textContent ?? '').trim()) return c as Text
          if (c.nodeType === 1) { const r = walk(c); if (r) return r }
        }
        return null
      }
      const tn = walk(ph)
      if (tn && (!sel || sel.isCollapsed)) {
        const rg = document.createRange()
        rg.setStart(tn, 0)
        rg.setEnd(tn, 1)
        const rc = rg.getClientRects()[0]
        if (rc && e.clientX < rc.left - 1 && e.clientX > rc.left - 90 && e.clientY >= rc.top - 2 && e.clientY <= rc.bottom + 2) {
          const z = getState().ui.prefs.zoom || 1
          openSpeakerPicker({ x: e.clientX / z, y: e.clientY / z }, ph.dataset.ph as string, ph.dataset.spk as string, !ph.classList.contains('phr-sug'))
          return
        }
      }
    }
    const a = t.closest<HTMLElement>('[data-a]')
    const en = t.closest<HTMLElement>('[data-ent]')
    if ((!a && !en) || !(window.getSelection()?.isCollapsed ?? true)) return
    if (a) showAnnotation(a.dataset.a as string)
    else showEntry(en!.dataset.ent as string)
  }

  const textTip = 'Text: ' + ui.prefs.readerFont + ', ' + ui.prefs.readerSize + ' px, spacing ' + ui.prefs.readerSpacing.toFixed(1) + ', ' + widthName(ui.prefs.readerWidth) + ' column'
  const findOn = s.find.open && s.find.q.trim().length >= 2

  return (
    <section className="panel" aria-label="Reader">
      <div className="rd-sticky">
        <div style={{ minWidth: 0 }}>
          <b id="stk-t" style={{ font: '600 20px var(--f-display)' }}>{chap ? chName(data, chap) : '—'}</b>
          <div className="sub" id="stk-s">{para}</div>
        </div>
        <span className="spacer" />
        <div className="row" style={{ flexWrap: 'nowrap', gap: 4 }}>
          <IconButton icon="listOl" tip="Chapters" className="wide-only" data-drawer="ch" data-keeppop onClick={(e) => setDrawer('ch', e.currentTarget)} />
          <IconButton icon="sidebar" tip="Words, Story Bible and marks" className="md-only" data-drawer="rail" data-keeppop onClick={(e) => setDrawer('rail', e.currentTarget)} />
          <IconButton icon="bookmark" tip="Bookmarks" id="bmlist" data-keeppop onClick={() => showBookmarks()} />
          <IconButton icon="search" tip="Find in the manuscript (Ctrl+F)" id="findopen" onClick={() => openFind()} />
          <IconButton icon="font" tip={textTip} id="m-text" data-keeppop onClick={(e) => popAt(e.currentTarget, () => <TextSettings />, '')} />
        </div>
      </div>
      <FindBar matches={matches} />
      <div
        ref={rs} className="rd-scroll" id="rdscroll" tabIndex={0} role="region"
        aria-label="Script reader. Up and down arrows scroll. Left and right arrows change the prep state of the chapter in view."
        onScroll={() => {
          updateSpy()
          clearTimeout(timer.current)
          timer.current = setTimeout(() => savePos(getState().ui.script.spyAt, rs.current?.scrollTop ?? 0), 250)
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault()
            stepPrep(chId, e.key === 'ArrowRight' ? 1 : -1)
          }
        }}
      >
        <div className="reader" id="reader" style={readerVars(ui.prefs)} onClick={onClick} onMouseUp={() => setTimeout(() => setTool(getSel()), 0)}>
          {data.chapters.map((c, i) => {
            const prev = i > 0 ? data.chapters[i - 1] : null
            const paras = paragraphsOf(data, c.id)
            const title = chName(data, c)
            return (
              <Fragment key={c.id}>
                <div className="bound" id={'ch-' + c.id} data-ch={c.id}>
                  {prev ? <div className="end">End of {prev.kind === 'credits' ? prev.title.toLowerCase() : chTag(data, prev)} · {num(prev.words)} words</div> : null}
                  <div className="card">
                    <div className="row">
                      <span className="label">{c.kind === 'credits' ? 'Credits' : chLabel(data, c)}</span><span className="spacer" />
                      <IconButton icon="mic" tip="Record in Booth" tipSide="r" data-rec={c.id} />
                    </div>
                    <h2>{c.title}</h2>
                    <div className="sub">
                      {num(c.words)} words · about {Math.round((c.words / WPH) * 60)} min finished audio · <span data-facts={c.id}>{chapterFacts(data, c.id, unattributed(data, c.id))}</span>
                    </div>
                    <div className="row">
                      <span className="label">My prep</span>
                      <div className="seg" role="group" aria-label={'Prep state for ' + title}>
                        {PREP_ORDER.map((k) => <button key={k} type="button" data-prep={c.id + ':' + k} aria-pressed={c.prep === k}>{PREP_LABELS[k]}</button>)}
                      </div>
                    </div>
                    {c.flag ? (
                      <div className="banner">
                        <span>{c.flag.text}</span><span className="spacer" />
                        <IconButton icon="doneOff" tip="Mark reviewed" data-flagok={c.id} />
                      </div>
                    ) : null}
                  </div>
                </div>
                {paras.length
                  ? paras.map((p) => <ParaView key={p.id} data={data} p={p} matches={findOn ? matches : null} cur={s.find.i} sel={s.sel} marks={marksBy.get(p.id) ?? NO_MARKS} lk={lk} zoom={zoom} flash={s.bmFlash === p.id} />)
                  : <div className="excerpt" style={{ paddingLeft: 0 }}>Chapter text appears here.</div>}
              </Fragment>
            )
          })}
        </div>
      </div>
      <Legend />
      {tool ? <SelectionTool g={tool} onDone={dismiss} /> : null}
    </section>
  )
}
