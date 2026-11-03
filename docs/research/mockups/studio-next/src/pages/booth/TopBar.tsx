import { useEffect, useRef } from 'react'
import { go } from '@/state/commands/nav'
import { setPrefs } from '@/state/commands/prefs'
import { TEXT_SIZE_MAX, TEXT_SIZE_MIN, TEXT_SIZE_STEP } from '@/state/commands/booth'
import { MICS } from '@/selectors/booth'
import { roomTone, roomToneLabel } from '@/selectors/measured'
import { getState, update, useMock, useStudio } from '@/state/store'
import { daw } from '@/state/daw'
import { dawLabel, dawShort } from '@/selectors/daw'
import { ChapterBar } from '@/ui/ChapterBar'
import { popAbove, popAt, toast } from '@/ui/overlay'
import { Icon } from '@/ui/Icon'
import { IconButton, Select, Slider } from '@/ui/primitives'
import { FONT_OPTIONS } from '@/ui/TextSettings'

function TextPop() {
  const font = useStudio((s) => s.ui.prefs.readerFont)
  const size = useStudio((s) => s.ui.booth.textSize)
  return (
    <div className="stack" style={{ gap: 12, minWidth: 280 }}>
      <label className="stack" style={{ gap: 4 }}>
        <span className="label">Font</span>
        <Select id="bt-f" aria-label="Font" value={font} onValueChange={(v) => setPrefs({ readerFont: v })} options={FONT_OPTIONS} />
      </label>
      <label className="stack" style={{ gap: 4 }}>
        <span className="optrow"><span className="label">Size</span><b className="mono" id="bt-sv">{size} px</b></span>
        <Slider id="bt-s" aria-label="Size" min={TEXT_SIZE_MIN} max={TEXT_SIZE_MAX} step={TEXT_SIZE_STEP} value={size} onValueChange={(v) => update((d) => { d.ui.booth.textSize = v })} />
      </label>
    </div>
  )
}

/** The microphone is chosen here only for the built-in recorder; with a DAW it is chosen in the DAW. */
function MicPop() {
  useMock()
  const b = useStudio((s) => s.ui.booth)
  const c = daw().capabilities()
  const builtin = c.daw === 'builtin'
  const off = !c.reachable
  const name = dawLabel(c.daw)
  return (
    <div className="stack" style={{ gap: 12, minWidth: 300 }}>
      <span className="label">Microphone</span>
      {builtin ? (
        <Select id="amic" aria-label="Microphone" value={b.mic} options={MICS.map((x) => ({ value: x, label: x }))}
          onValueChange={(v) => { update((d) => { d.ui.booth.mic = v }); toast('Microphone: ' + v) }} />
      ) : (
        <div><b>{b.mic}</b><div className="sub">{off ? name + ' is not running' : 'Chosen in ' + name}</div></div>
      )}
      <label className="stack" style={{ gap: 4 }}>
        <span className="optrow"><span>Input level</span><b className="mono" id="ainv">{b.inLevel}</b></span>
        <Slider id="ain" aria-label="Input level" min={0} max={100} value={b.inLevel} disabled={off} onValueChange={(v) => update((d) => { d.ui.booth.inLevel = v })} />
      </label>
      <label className="stack" style={{ gap: 4 }}>
        <span className="optrow"><span>Monitor level (output)</span><b className="mono" id="aoutv">{b.outLevel}</b></span>
        <Slider id="aout" aria-label="Monitor level (output)" min={0} max={100} value={b.outLevel} disabled={off} onValueChange={(v) => update((d) => { d.ui.booth.outLevel = v })} />
      </label>
    </div>
  )
}

/** Recording levels and the microphone, together, in one menu at the foot of the Booth next to Record (an icon button; the room tone is in the footer). */
export function LevelsMenu() {
  useMock()
  const off = !daw().capabilities().reachable
  return (
    <IconButton icon="levels" tip="Levels" id="blevels" data-keeppop aria-haspopup="dialog"
      onClick={(e) => popAbove(e.currentTarget, () => <LevelsPop off={off} />, '')} />
  )
}

/** The room tone the chosen microphone reports; "not measured yet" while nothing has measured it. */
function RoomTone() {
  const mic = useStudio((s) => s.ui.booth.mic)
  useMock()
  return <span className={'bchip2' + (roomTone(mic).ok ? ' ok' : '')}>{roomToneLabel(mic)}</span>
}

/** The meter and room tone sit open beside Record at every width; the microphone and level sliders stay in the Levels menu. */
export function LevelsInline() {
  return (
    <div className="lvl-inline" role="group" aria-label="Input">
      <InputMeter inline />
      <RoomTone />
    </div>
  )
}

function LevelsPop({ off }: { off: boolean }) {
  return (
    <div className="stack" style={{ gap: 14, minWidth: 320 }}>
      <div className="stack" style={{ gap: 6 }}>
        <span className="label">Input</span>
        <div className="row" style={{ flexWrap: 'nowrap' }}><InputMeter /></div>
      </div>
      <MicPop />
    </div>
  )
}

/** The input meter moves while a take runs; the real level comes from the recorder. */
function InputMeter({ inline }: { inline?: boolean } = {}) {
  const rec = useStudio((s) => s.ui.booth.rec)
  const bar = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!rec) return
    const t = setInterval(() => {
      if (bar.current) bar.current.style.width = Math.min(100, ((35 + Math.random() * 50) * getState().ui.booth.inLevel) / 70) + '%'
    }, 150)
    return () => clearInterval(t)
  }, [rec])
  return <div className="inmeter" aria-label="Input level"><i id={inline ? undefined : 'inl'} ref={bar} /></div>
}

export function BoothTop({ nopen, progress, resume }: { nopen: number; progress: string; resume: { para: number; go: () => void } | null }) {
  useMock()
  const c = daw().capabilities()
  const unsaved = daw().projectState().unsavedChanges
  const rec = useStudio((s) => s.ui.booth.rec)
  const take = useStudio((s) => s.ui.booth.take)
  const paused = useStudio((s) => s.ui.booth.paused)
  const open = useStudio((s) => s.ui.booth.rail)
  const pickMode = useStudio((s) => s.ui.pickups.mode)
  return (
    <div className="btop">
      <ChapterBar scopeKey={null} />
      {pickMode ? <span className="bchip2">Pickups · {nopen} open</span> : null}
      <span className="bdim mono" id="bprog">{progress}</span>
      {resume ? <button type="button" className="bchip2" id="bresume" onClick={resume.go}>Resume at ¶ {resume.para + 1}</button> : null}
      <span style={{ flex: 1 }} />
      {rec ? <span className="bchip2 rec" id="bstate">{paused ? <><Icon name="pause" /> REC paused</> : <><Icon name="record" /> REC</>}</span> : null}
      <button type="button" className={'bchip2 ' + (!c.reachable ? 'warn' : c.daw === 'builtin' ? '' : 'ok')} id="bsetup"
        title={'Recording settings · ' + (!c.reachable ? c.caps.record?.reason ?? dawLabel(c.daw) + ' is not running' : (c.daw === 'builtin' ? 'Recording happens in the app' : dawLabel(c.daw) + ' linked') + ' · take ' + take + (unsaved ? ' · unsaved changes in the project' : ''))}
        onClick={() => go('settings')}>
        {dawShort(c.daw)}
      </button>
      <IconButton icon="font" tip="Text settings" id="btext" data-keeppop onClick={(e) => popAt(e.currentTarget, () => <TextPop />, '')} />
      <IconButton icon="sidebar" tip="Side panel" id="brailbtn" tipSide="l" data-keeppop aria-pressed={open} onClick={() => update((d) => { d.ui.booth.rail = !d.ui.booth.rail })} />
    </div>
  )
}
