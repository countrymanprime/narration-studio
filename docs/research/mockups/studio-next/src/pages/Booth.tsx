import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import { bookmarkInBooth, bookmarkMenu, boothSpotAt, stepInBooth } from '@/app/bookmarks'
import { registerCommands, registerContext, registerKeys } from '@/app/registry'
import { mmss } from '@/format/time'
import { boothUnits, resumeOffer } from '@/selectors/booth'
import { isDone, pickupList } from '@/selectors/pickups'
import { WPH } from '@/selectors/progress'
import { fontStack } from '@/selectors/reader'
import {
  backPhrase, changeTextSize, exitBooth, nextPhrase, nextPick, punchAndRoll, recordRefusal, resumePointFor, sessionLines, setReadingPosition, startFromHere, stepWord,
  stopRecordingQuietly, toggleFullscreen, toggleRec,
} from '@/state/commands/booth'
import { reconcilePickupMarkers } from '@/state/commands/pickups'
import { getState, update, useData, useMock, useUi } from '@/state/store'
import { Icon } from '@/ui/Icon'
import { KeyHints } from '@/ui/KeyHints'
import { NeedManuscript } from '@/ui/NeedManuscript'
import { I, SEP, type CtxItem } from '@/ui/overlay'
import { SidePanel } from './booth/SidePanel'
import { Teleprompter, scrollView } from './booth/Teleprompter'
import { BoothTop, LevelsMenu, LevelsInline } from './booth/TopBar'

/** 1280 and below the app puts `md` on the body, and the side panel becomes a drawer over the text. */
const mediumNow = (): boolean => document.body.classList.contains('md')

/** In the drawer layout, a click outside the side panel closes it. Clicks on a Story Bible word or a note are what fill it, so they stay. */
function useCloseDrawerOnOutsideClick(): void {
  useEffect(() => {
    const md = (e: MouseEvent): void => {
      if (!mediumNow() || !getState().ui.booth.rail) return
      const t = e.target
      if (!(t instanceof Element)) return
      if (t.closest('.brail,#brailbtn,.pop,.scrim,.bent,.bm,.bnote,.tooltip')) return
      update((d) => { d.ui.booth.rail = false })
    }
    document.addEventListener('mousedown', md)
    return () => document.removeEventListener('mousedown', md)
  }, [])
}

/** Close the drawer when the window shrinks into the medium layout, so it never covers the text uninvited. */
function useDrawerDefault(): void {
  useEffect(() => {
    let was = mediumNow()
    if (was) update((d) => { d.ui.booth.rail = false })
    const mo = new MutationObserver(() => {
      const now = mediumNow()
      if (now && !was) update((d) => { d.ui.booth.rail = false })
      was = now
    })
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    return () => mo.disconnect()
  }, [])
}

/** The narrator's reading view. The text follows the voice word by word; the unit of speaker attribution is a phrase. */
export default function BoothPage() {
  const data = useData()
  const ui = useUi()
  const mock = useMock()
  const chapterId = ui.chapter
  const { paras, units } = useMemo(
    () => boothUnits(data, chapterId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.paragraphs, data.bible, data.bibleTypes, data.confirmedSpeakers, chapterId],
  )
  const lines = useMemo(() => sessionLines(pickupList(data), ui.pickups.lines), [data, ui.pickups.lines])
  /* The page going away stops a take as a last resort; leaving by the app is asked about first (the change guard in commands/booth). */
  useEffect(() => stopRecordingQuietly, [])
  /* The DAW's markers are the truth for which pickups are done: take them when the Booth opens. */
  useEffect(() => { reconcilePickupMarkers() }, [])
  useDrawerDefault()
  useCloseDrawerOnOutsideClick()
  /* Phrase numbers belong to a chapter: a new chapter starts without a chosen start, a browsed phrase or a reference. */
  const lastChapter = useRef(chapterId)
  useEffect(() => {
    if (lastChapter.current === chapterId) return
    lastChapter.current = chapterId
    update((d) => { d.ui.booth.punchAt = null; d.ui.booth.browse = false; d.ui.booth.ref = null })
  }, [chapterId])
  if (!mock.hasManuscript) return <NeedManuscript title="Booth" />

  const b = ui.booth
  const cur = Math.max(0, Math.min(units.length - 1, b.cur))
  /* Why Record cannot start here; the control shows the DAW's own reason. */
  const why = b.rec ? null : recordRefusal(chapterId)
  const offer = b.rec ? null : resumeOffer(paras, units, resumePointFor(data, chapterId, paras))
  const resume = offer && (offer.cur !== cur || offer.wcur !== b.wcur) ? { para: offer.para, go: () => setReadingPosition(offer.cur, offer.wcur) } : null
  const nopen = lines.filter((x) => !isDone(data, x.id)).length
  const wordsLeft = units.slice(cur + 1).reduce((a, u) => a + u.nw, 0) + (units[cur].nw - Math.min(b.wcur, units[cur].nw - 1) - 1)
  const progress = `¶ ${units[cur].pi + 1} of ${paras.length} · ${Math.round(((cur + 1) / units.length) * 100)}% · ~${mmss(Math.round((wordsLeft / WPH) * 3600))} finished left`
  const wcur = Math.max(0, Math.min(units[cur].nw - 1, b.wcur))
  return (
    <div className="booth" style={{ ['--tsize' as string]: b.textSize + 'px', ['--bf' as string]: fontStack(ui.prefs.readerFont) } as CSSProperties}>
      <BoothTop nopen={nopen} progress={progress} resume={resume} />
      <div className={'bmain' + (b.rail ? '' : ' norail')}>
        <Teleprompter data={data} paras={paras} units={units} cur={cur} wcur={wcur} browse={b.browse} punchAt={b.punchAt} size={b.textSize} font={ui.prefs.readerFont} rail={b.rail}
          lines={lines} chapterId={chapterId} pickMode={ui.pickups.mode} />
        <aside className="brail" id="brail" aria-label="Side panel">
          <SidePanel data={data} chapterId={chapterId} units={units} cur={cur} lines={lines} pickMode={ui.pickups.mode} at={ui.pickups.at} />
        </aside>
      </div>
      <div className="bfoot">
        <div className="bfoot-main">
          <button type="button" className="btn primary" id="brec" disabled={!!why} aria-describedby={why ? 'brec-why' : undefined} onClick={() => toggleRec()}>{b.rec ? <><Icon name="stop" />Stop</> : <><Icon name="record" />Record</>}</button>
          <span className="mono" style={{ color: 'var(--bfg)', fontSize: 18 }} id="btimer">{mmss(b.recSec)}</span>
          <LevelsMenu />
          {why ? <span className="bdim" id="brec-why">{why}</span> : null}
          <LevelsInline />
        </div>
        <KeyHints id="bkeys" hints={[
          { keys: ['Space'], label: 'Record / stop' },
          { keys: ['R'], label: 'Punch and roll from here' },
          { keys: ['Right-click'], label: 'Start from here' },
          { keys: ['↑', '↓'], label: 'Phrase' },
          { keys: ['←', '→'], label: 'Word' },
          { keys: ['B'], label: 'Bookmark' },
          { keys: ['[', ']'], label: 'Bookmarks' },
          ...(ui.pickups.mode ? [{ keys: ['N'], label: 'Next pickup' }] : []),
          { keys: ['F11'], label: 'Full screen' },
          { keys: ['Esc'], label: 'Exit' },
        ]} />
      </div>
    </div>
  )
}

/**
 * Booth keys. Space (or a foot pedal set to it: a pedal only starts and stops, it has no other command) starts and stops. F11 is full screen. R rolls again from the phrase chosen with
 * Start from here, otherwise from the current phrase. Backspace steps back a phrase, left and right step a word, Page Up and Down browse,
 * N goes to the next pickup. Escape closes the drawer (1280 and below) before it exits.
 */
registerKeys('booth', (e, info) => {
  if (info.typing || !info.plain || !getState().mock.hasManuscript) return false
  /* A popover that Escape just closed is not also an exit. */
  if (e.key === 'Escape') {
    if (info.hadPop) return true
    if (mediumNow() && getState().ui.booth.rail) { update((d) => { d.ui.booth.rail = false }); return true }
    exitBooth()
    return true
  }
  const k = e.key
  const onButton = (e.target as HTMLElement | null)?.tagName === 'BUTTON'
  if (k === ' ') {
    if (onButton) return false
    e.preventDefault()
    toggleRec()
  } else if (k === 'ArrowDown') { e.preventDefault(); nextPhrase() }
  else if (k === 'ArrowUp' || k === 'Backspace') { e.preventDefault(); backPhrase() }
  else if (k === 'ArrowRight') { e.preventDefault(); stepWord(1) }
  else if (k === 'ArrowLeft') { e.preventDefault(); stepWord(-1) }
  else if (k.toLowerCase() === 'r') punchAndRoll()
  else if (k === 'PageDown') { e.preventDefault(); scrollView(0.8) }
  else if (k === 'PageUp') { e.preventDefault(); scrollView(-0.8) }
  else if (k.toLowerCase() === 'n' && getState().ui.pickups.mode) { e.preventDefault(); nextPick(e.shiftKey ? -1 : 1) }
  else if (k === 'F11') { e.preventDefault(); toggleFullscreen() }
  else if (k.toLowerCase() === 'b' && !e.shiftKey) { e.preventDefault(); bookmarkInBooth() }
  else if (k === ']' || k === '[') { e.preventDefault(); stepInBooth(k === ']' ? 1 : -1) }
  else if (k === '+' || k === '=') changeTextSize(4)
  else if (k === '-') changeTextSize(-4)
  else return false
  return true
})

registerCommands(() => (getState().ui.page === 'booth' ? [{ g: 'Booth', l: 'Toggle full screen', k: 'F11', fn: toggleFullscreen }] : []))

/** Right-click anywhere in the Booth. On a phrase it can start from there. */
registerContext((target): CtxItem[] | null => {
  if (getState().ui.page !== 'booth') return null
  const ribbon = bookmarkMenu(target)
  if (ribbon) return ribbon
  const u = target.closest<HTMLElement>('.bu[data-u]')
  return [
    ...(u ? [I('Start from here', () => startFromHere(+(u.dataset.u ?? 0))), SEP] : []),
    I('Bookmark here', () => bookmarkInBooth(boothSpotAt(target) ?? undefined), { k: 'B' }),
    SEP,
    I('Next phrase', nextPhrase, { k: '↓' }),
    I('Back one phrase', backPhrase, { k: '⌫' }),
    SEP,
    I('Punch and roll', punchAndRoll, { k: 'R' }),
    SEP,
    I('Larger text', () => changeTextSize(4), { k: '+' }),
    I('Smaller text', () => changeTextSize(-4), { k: '−' }),
    SEP,
    I('Exit Booth', exitBooth, { k: 'Esc' }),
  ]
})
