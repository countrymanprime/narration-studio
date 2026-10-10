import type { CSSProperties } from 'react'
import { mmss } from '@/format/time'
import { recordingCheck } from '@/providers/recordingcheck'
import { CARD_KIND, CARD_LABEL, checkCard, checkSentence, type CardFinding } from '@/selectors/checkcard'
import { RES_CLASS, RES_LABEL, TYPE_CHIP_CH } from '@/selectors/proof'
import { acceptFinding, cancelRecordingCheck, ignoreFinding, runRecordingCheck, setFindingsFilter, toggleFindings } from '@/state/commands/checkcard'
import { projectBasis } from '@/state/commands/pickups'
import { clock } from '@/format/time'
import { useData, useUi } from '@/state/store'
import { Icon } from '@/ui/Icon'
import { Btn, IconButton, Pill } from '@/ui/primitives'
import { hasText } from '@/selectors/chapters'
import { capsOf } from '@/selectors/daw'
import { useMock } from '@/state/store'

const WHY = {
  text: 'The text changed since this check: check again',
  recording: 'Recording changed since this check: check again',
  save: 'The project was saved again since this check: check again',
} as const

function Finding({ f }: { f: CardFinding }) {
  const done = f.status !== 'todo'
  return (
    <div className={'cf-row' + (done ? ' done' : '')} data-finding={f.id} data-status={f.status}>
      <span className={'type fixedchip t-' + f.category.ty} style={{ ['--ch' as string]: TYPE_CHIP_CH } as CSSProperties}>{f.category.ty}</span>
      <span className="mono">{clock(f.sec)}</span>
      <span className="cf-text">{f.text}</span>
      <span className="sub">Suggested</span>
      <span className={'pill ' + RES_CLASS[f.category.suggest]}>{RES_LABEL[f.category.suggest]}</span>
      {done
        ? <Pill kind={f.status === 'accepted' ? 'ok' : 'neutral'} size="sm">{f.status === 'accepted' ? 'Accepted' : 'Ignored'}</Pill>
        : <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            <Btn data-accept={f.id} onClick={() => acceptFinding(f.id)}>Accept</Btn>
            <Btn data-ignore={f.id} onClick={() => ignoreFinding(f.id)}>Ignore</Btn>
          </span>}
    </div>
  )
}

/** The recording check for the chapter in view: recorded length against the script, what the check found by category, and its findings as suggestions. */
export function CheckCard({ chapterId }: { chapterId: string }) {
  const data = useData()
  const ui = useUi()
  const mock = useMock()
  const card = checkCard(data, chapterId, projectBasis(), ui.proof.checkRun)
  const off = !capsOf(mock).reachable
  const groups = recordingCheck().groups()
  const cats = recordingCheck().categories()
  const dim = card.state === 'stale'
  const filter = ui.proof.findingsFilter
  const shown = card.findings.filter((f) => f.status === filter)
  const run = ui.proof.checkRun
  return (
    <div className="ccard" data-check-state={card.state} aria-label="Recording check">
      <div className="row" style={{ flexWrap: 'nowrap', gap: 10 }}>
        <span className="label">Recording check</span>
        <Pill kind={CARD_KIND[card.state]} size="sm"><span data-card-state>{CARD_LABEL[card.state]}</span></Pill>
        <span className="spacer" />
        {card.state === 'current' && card.findings.length ? (
          <IconButton icon={ui.proof.findingsOpen ? 'up' : 'down'} tip={ui.proof.findingsOpen ? 'Hide the findings' : 'Show the findings'} id="cc-findings" aria-expanded={ui.proof.findingsOpen} onClick={toggleFindings} />
        ) : null}
        {card.state === 'checking'
          ? <Btn id="cc-cancel" onClick={cancelRecordingCheck}>Cancel</Btn>
          : <Btn id="cc-check" className={card.state === 'current' ? '' : 'primary'} disabled={off || card.recorded == null || !hasText(data, chapterId)} onClick={() => runRecordingCheck(chapterId)}>Check recordings</Btn>}
      </div>
      <div className="cc-stats" style={{ opacity: dim ? 0.6 : 1 }}>
        <div className="stack" style={{ gap: 2 }}><span className="label">Recorded</span><b className="mono cc-big" data-cc-recorded>{card.recorded != null ? mmss(card.recorded) : '—'}</b></div>
        <div className="stack" style={{ gap: 2 }}><span className="label">Script estimate</span><b className="mono cc-big" data-cc-estimate>{mmss(card.estimate)}</b></div>
        <div className="stack cc-msg" style={{ gap: 2 }}>
          {card.state === 'none' ? <span>Not checked yet</span> : null}
          {card.state === 'checking' && run ? (
            <>
              <span>Checking the recording against the script…</span>
              <div className="row" style={{ flexWrap: 'nowrap', gap: 10 }}>
                <div className="cc-bar" role="progressbar" aria-label="Checking" aria-valuemin={0} aria-valuemax={100} aria-valuenow={run.pct}><i style={{ width: run.pct + '%' }} /></div>
                <span className="mono sub">{run.pct}%</span>
              </div>
            </>
          ) : null}
          {card.differences != null ? <span data-cc-sentence>{checkSentence(card.differences)}</span> : null}
          {card.asOf ? <span className="sub" data-cc-asof>As of last save · {card.asOf}</span> : null}
          {dim && card.staleWhy ? <div className="banner cc-warn" role="alert" data-stale><Icon name="alert" /> {WHY[card.staleWhy]}</div> : null}
        </div>
      </div>
      {(['speech', 'audio'] as const).map((g) => (
        <div key={g} className="stack" style={{ gap: 6, opacity: dim ? 0.6 : 1 }}>
          <span className="label">{groups[g]}</span>
          <div className="row" style={{ gap: 8 }}>
            {cats.filter((x) => x.source === g).map((x) => (
              <span key={x.id} className="ccchip" data-cat={x.id}><i className="dot" style={{ background: x.colour }} />{x.label}<b className="mono">{card.counts ? card.counts[x.id] ?? 0 : '—'}</b></span>
            ))}
          </div>
        </div>
      ))}
      {ui.proof.findingsOpen && card.state === 'current' && card.findings.length ? (
        <div className="stack cf" data-findings style={{ gap: 8 }}>
          <div className="row" style={{ gap: 8 }}>
            <b>Check findings · {card.findings.length}</b>
            <div className="filters" role="group" aria-label="Filter findings">
              {([['todo', 'To decide'], ['accepted', 'Accepted'], ['ignored', 'Ignored']] as const).map(([k, l]) => (
                <button key={k} type="button" className="chip" data-ff={k} aria-pressed={filter === k} onClick={() => setFindingsFilter(k)}>{l} <span className="cn">{card.tally[k]}</span></button>
              ))}
            </div>
          </div>
          {shown.length ? shown.map((f) => <Finding key={f.id} f={f} />) : <span className="sub">Nothing here.</span>}
        </div>
      ) : null}
    </div>
  )
}
