import { fmtD } from '@/format/time'
import { deadlineTone, dueDate, isFinished, type Calc, type Tone } from '@/selectors/progress'
import type { BookData } from '@/domain/schemas'
import { go } from '@/state/commands/nav'
import { getState } from '@/state/store'

const KINDS = { ok: ['ok', 'On track'], tight: ['warn', 'Tight'], behind: ['bad', 'Behind'] } as const
const TONE_KIND: Record<Tone, 'ok' | 'warn' | 'bad'> = { neutral: 'ok', success: 'ok', warn: 'warn', danger: 'bad' }
const RANK = { ok: 0, warn: 1, bad: 2 } as const

/** The one-line answer to "will I make the due date": a pill that opens the Schedule. */
export function VerdictPill({ data, k }: { data: BookData; k: Calc }) {
  const [vkind, vlabel] = KINDS[k.verdict]
  // The days left set the colour; the projection can only make it worse.
  const tk = TONE_KIND[deadlineTone(data, k)]
  const finished = isFinished(k)
  const kind = finished ? 'ok' : RANK[tk] > RANK[vkind] ? tk : vkind
  const label = finished ? 'Finished' : vlabel
  const due = fmtD(dueDate(data))
  const extra =
    finished
      ? 'every chapter delivered'
      : k.verdict === 'ok'
      ? 'at current pace done ' + fmtD(k.finish)
      : k.verdict === 'tight'
        ? 'done ' + fmtD(k.finish) + ', due ' + due
        : 'done ' + fmtD(k.finish) + ', due ' + due + ' · needs ' + k.reqPace.toFixed(1) + ' h/day'
  return (
    <button type="button" className={'pill ' + kind} data-vp title="Open the schedule" onClick={() => { if (getState().ui.page !== 'schedule') go('schedule') }}>
      <span className="dot" />{label} · {extra}
    </button>
  )
}
