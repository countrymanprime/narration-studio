import { Btn } from '@/ui/primitives'
import type { ReactNode } from 'react'
import type { BookData } from '@/domain/schemas'
import { hm } from '@/format/time'
import { chName, chTag, chapterById, paragraphChapter } from '@/selectors/chapters'
import { masterFails, limText, masterLabel } from '@/selectors/master'
import { nextUp, type NextKind } from '@/selectors/nextup'
import { activeLimits, WPH, type Calc } from '@/selectors/progress'
import { isDone, pickupList } from '@/selectors/pickups'
import { recordingChapter, prodAct } from '@/state/commands/production'

function Next({ ico, bg, fg, title, sub, action, label, extra, disabled }: {
  ico: string; bg: string; fg: string; title: ReactNode; sub: ReactNode; action: string; label: string; extra?: ReactNode; disabled?: boolean; primary?: boolean
}) {
  return (
    <div className="next">
      <span className="ico" style={{ background: bg, color: fg }}>{ico}</span>
      <div className="stack" style={{ gap: 6 }}>
        <div><b>{title}</b><span className="sub">{sub}</span></div>
        <div>
          <Btn className={action.startsWith('booth') ? 'primary' : ''} data-act={action} disabled={disabled} onClick={() => prodAct(action)}>{label}</Btn>
          {extra}
        </div>
      </div>
    </div>
  )
}

const tags = (b: BookData, ids: string[]): string[] => [...new Set(ids)].map((i) => { const c = chapterById(b, i); return c ? chTag(b, c) : i })

/** What to do next, ranked by risk to the due date (see selectors/nextup.ts). */
export function NextUp({ data, k, record }: { data: BookData; k: Calc; record: { ok: boolean; reason: string } }) {
  const rec = recordingChapter(data)
  const flagged = data.chapters.filter((c) => c.flag)
  const failing = data.masterRows.filter((r) => masterFails(r, activeLimits(data)).length)[0]
  const make: Record<NextKind, () => ReactNode> = {
    rec: () => rec && (
      <Next key="rec" ico="●" bg="var(--copper-soft)" fg="var(--copper-text)" title={'Finish recording ' + chName(data, rec)}
        sub={rec.rec + '% recorded · about ' + hm((rec.words * (1 - rec.rec / 100)) / WPH) + ' of finished audio left'}
        action={'booth:' + rec.id} label="Open Booth" disabled={!record.ok} extra={record.ok ? undefined : <> <span className="sub">{record.reason}</span></>} />
    ),
    pick: () => {
      const open = pickupList(data).filter((x) => !isDone(data, x.id))
      return (
        <Next key="pick" ico="↺" bg="var(--bad-soft)" fg="var(--bad)" title={'Pickup session · ' + k.pick + ' lines'}
          sub={tags(data, open.map((x) => x.chapterId)).join(' and ') + ' · match mic, gain and position first'} action="pickups" label="Review pickups" />
      )
    },
    fail: () => {
      if (!failing) return null
      const limits = activeLimits(data)
      const fails = masterFails(failing, limits)
      const why = fails.map((x) => limits[x].l.toLowerCase() + ' ' + failing[x] + ' ' + limits[x].u + ' (limit ' + limText(limits, x) + ')').join(' · ')
      const c = chapterById(data, failing.id)
      return (
        <Next key="fail" ico="◠" bg="var(--bad-soft)" fg="var(--bad)"
          title={(c ? chTag(data, c) : masterLabel(data, failing)) + ' fails ' + fails.length + ' ACX ' + (fails.length > 1 ? 'checks' : 'check')}
          sub={why} action="master" label="Inspect failed check" />
      )
    },
    flags: () => (
      <Next key="flag" ico="!" bg="var(--warn-soft)" fg="var(--warn)" title={flagged.length + ' ' + (flagged.length > 1 ? 'chapters' : 'chapter') + ' changed by the new manuscript'}
        sub={flagged.map((c) => chName(data, c)).join(' · ')} action="flags" label="Review changes" />
    ),
  }
  const items = nextUp(data, k).map((x) => make[x.kind]()).filter(Boolean)
  return items.length ? <>{items}</> : <div className="empty" style={{ padding: 20 }}><span>Nothing needs you right now.</span></div>
}
