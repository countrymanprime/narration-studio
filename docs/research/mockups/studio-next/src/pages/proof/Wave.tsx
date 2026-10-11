import { useMemo } from 'react'
import type { ProofNote } from '@/domain/schemas'
import { mmss } from '@/format/time'
import { FINDING_COLOUR, WAVE_TOTAL } from '@/selectors/proof'
import { dragWindow, nudgeWindow, releaseWindow, resizeWin, selectNote } from '@/state/commands/proof'
import { Waveform, clusterPins, type Band, type Pin } from '@/ui/Waveform'
import type { Spot } from '@/selectors/proofTakes'
import { TakeLanes } from './TakeLanes'

export { clusterPins }

const WINDOW = { move: dragWindow, release: releaseWindow, nudge: nudgeWindow, resize: resizeWin }

/** The chapter overview strip and the zoomed waveform with its pins. `rows` are this chapter's notes. */
export function WaveBlock({ rows, sel, winStart, winLen, play, spot }: { rows: ProofNote[]; sel: number | null; winStart: number; winLen: number; play: number | null; spot?: Spot | null }) {
  const pins = useMemo<Pin[]>(() => rows.map((r) => ({ id: r.id, sec: r.sec, colour: FINDING_COLOUR[r.ty], done: !!r.res, label: r.t })), [rows])
  /* The take that plays at the selected spot is a band on the trace; the others sit below in their own lanes. */
  const bands = useMemo<Band[]>(() => {
    const on = spot?.takes.find((t) => t.active)
    return on ? [{ id: on.id, start: on.start, end: on.start + on.len, label: on.label + (on.kept ? ' · Kept' : ''), tone: 'ok' as const }] : []
  }, [spot])
  return (
    <>
    <Waveform
      total={WAVE_TOTAL} winStart={winStart} winLen={winLen} play={play} pins={pins} sel={sel} pinsName="notes" bands={bands}
      onPin={(id) => selectNote(+id)} window={WINDOW}
      ariaLabel={'Chapter waveform, ' + mmss(Math.round(winStart)) + ' to ' + mmss(Math.round(winStart + winLen)) + ', ' + rows.length + ' notes in this chapter'}
    />
    {spot ? <TakeLanes spot={spot} winStart={winStart} winLen={winLen} /> : null}
    </>
  )
}
