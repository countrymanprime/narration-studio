import { useRef } from 'react'
import { fmtD, parseIso } from '@/format/time'
import { chLabel, chName } from '@/selectors/chapters'
import {
  VERDICT_ICON, VERDICT_KIND, VERDICT_LABEL, decisionText, stageLabel, stageReadiness, type EvidenceItem, type Readiness,
} from '@/selectors/readiness'
import { confirmStage, dismissStage, revertStage } from '@/state/commands/readiness'
import { useData } from '@/state/store'
import { Icon } from '@/ui/Icon'
import { openModal } from '@/ui/overlay'
import { Btn, IconButton, Pill } from '@/ui/primitives'

const day = (iso: string): string => fmtD(parseIso(iso))
const ITEM_ICON = { met: 'check', unmet: 'notReady', partial: 'circleHalf', none: 'minus' } as const

/** The small verdict chip on the corner of the cell for the stage a chapter is in. It opens the slide-over; the cell keeps opening its page. */
export function ReadinessChip({ r }: { r: Readiness }) {
  const c = stageLabel(r.stage)
  const label = VERDICT_LABEL[r.verdict]
  return (
    <button type="button" className={'rchip ' + VERDICT_KIND[r.verdict]} data-rchip={r.chapterId} data-verdict={r.verdict} data-tip={label + ' · ' + c}
      aria-label={'Stage readiness: ' + label + ', ' + c} aria-haspopup="dialog" onClick={() => openReadiness(r.chapterId)}>
      <Icon name={VERDICT_ICON[r.verdict]} />
    </button>
  )
}

export function openReadiness(chapterId: string): void {
  openModal({ label: 'Stage readiness', side: true, render: ({ close }) => <ReadinessPanel chapterId={chapterId} close={close} /> })
}

function Item({ i }: { i: EvidenceItem }) {
  return (
    <li className={'rd-item ' + i.state} data-item={i.id}>
      <span className="rd-ic" aria-hidden="true"><Icon name={ITEM_ICON[i.state]} /></span>
      <span className="rd-t"><b>{i.label}</b>{i.note ? <span className="sub">{i.note}</span> : null}</span>
      <span className="mono rd-v">{i.value}</span>
    </li>
  )
}

/** The slide-over: the stage, the evidence the app measured, its suggestion, and Confirm or Dismiss (Revert once confirmed). */
export function ReadinessPanel({ chapterId, close }: { chapterId: string; close: () => void }) {
  const data = useData()
  const c = data.chapters.find((x) => x.id === chapterId)
  const seen = useRef<string | null>(null)
  if (!c) return null
  const r = stageReadiness(data, c)
  if (seen.current == null) seen.current = r.key
  const next = r.next ? stageLabel(r.next) : ''
  const sug = r.suggestion
  const last = r.decisions.filter((d) => d.kind === 'confirmed').pop()
  const headline =
    r.verdict === 'confirmed' ? 'Moved to ' + stageLabel(r.stage)
      : r.verdict === 'ready' || r.verdict === 'changed' ? 'Ready to move to ' + next
        : r.verdict === 'notready' ? 'Not ready to move to ' + next
          : r.verdict === 'progress' ? 'Still in progress' : 'Nothing to check yet'
  const sub =
    r.verdict === 'confirmed' ? 'Confirmed ' + (last ? day(last.at) : '')
      : r.verdict === 'ready' ? (sug && sug.at !== data.today ? 'Made ' : 'Checked ') + day(sug?.at ?? data.today)
        : r.verdict === 'changed' && sug ? 'Made ' + day(sug.at) + ', before the change below'
          : r.verdict === 'notready' ? r.items.filter((i) => i.blocking && i.state === 'unmet').map((i) => i.label).join(' · ') + ' not met'
            : ''
  const list = r.decisions.slice().reverse()
  return (
    <>
      <div className="dh">
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <div className="label">Stage readiness</div>
          <div className="label mono" style={{ color: 'var(--faint)' }}>{chLabel(data, c) || chName(data, c)}</div>
          <h2 style={{ fontSize: 24 }}>{c.title}</h2>
        </div>
        <span className="spacer" />
        <IconButton icon="x" tip="Close" data-x onClick={close} />
      </div>
      <div className="db stack rd" style={{ gap: 14 }}>
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
          <span className="row" style={{ gap: 8 }}><span className="label">Stage</span><Pill kind="info" title="The stage this chapter is in">{stageLabel(r.stage)}</Pill></span>
          <Pill kind={VERDICT_KIND[r.verdict]}><span data-verdict-pill={r.verdict}><Icon name={VERDICT_ICON[r.verdict]} /> {VERDICT_LABEL[r.verdict]}</span></Pill>
        </div>
        <div className="rd-box">
          <span className="label">{r.verdict === 'confirmed' ? 'Decision' : 'Suggestion'}</span>
          <h3>{headline}</h3>
          {sub ? <span className="sub">{sub}</span> : null}
        </div>
        {r.verdict === 'changed' && sug ? (
          <div className="banner" role="alert" data-changed style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
            <b>Changed since {day(sug.at)}</b>
            <ul className="rd-changes">
              {r.changes.map((x) => <li key={x.id}>{x.label}: was {x.was}, now {x.now}</li>)}
            </ul>
            {r.changes.map((x) => r.items.find((i) => i.id === x.id)?.detail).filter(Boolean).map((t, k) => <span key={k} className="sub">{t}</span>)}
          </div>
        ) : null}
        {r.items.length ? (
          <>
            <span className="label">Evidence</span>
            <ul className="rd-list">
              {r.items.map((i) => {
                const was = r.verdict === 'changed' ? r.changes.find((x) => x.id === i.id) : undefined
                return was ? <Item key={i.id} i={{ ...i, state: 'partial', note: 'was ' + was.was + ' at the suggestion', value: was.was + ' → ' + was.now }} /> : <Item key={i.id} i={i} />
              })}
            </ul>
          </>
        ) : null}
        <span className="label">Decisions</span>
        {list.length ? (
          <ul className="rd-hist" data-history>
            {list.map((d) => { const t = decisionText(d); return <li key={d.id}><span className="rd-k">{t.kind}</span><span>{t.text}</span><span className="sub mono">{day(d.at)}</span></li> })}
          </ul>
        ) : <span className="sub">No decisions yet.</span>}
      </div>
      <div className="df">
        {r.verdict === 'confirmed'
          ? <Btn id="rd-revert" disabled={!r.canRevert} onClick={() => { revertStage(chapterId) }}><Icon name="undo" /> Revert</Btn>
          : (
            <>
              {r.canRevert ? <Btn id="rd-revert" className="quiet" onClick={() => { revertStage(chapterId) }}><Icon name="undo" /> Revert</Btn> : null}
              <span className="spacer" />
              <Btn id="rd-dismiss" disabled={r.verdict !== 'ready' && r.verdict !== 'changed'} onClick={() => { dismissStage(chapterId, seen.current ?? r.key) }}>Dismiss</Btn>
              <Btn id="rd-confirm" className="primary" disabled={r.verdict !== 'ready'} onClick={() => { confirmStage(chapterId, seen.current ?? r.key) }}>Confirm</Btn>
            </>
          )}
      </div>
    </>
  )
}
