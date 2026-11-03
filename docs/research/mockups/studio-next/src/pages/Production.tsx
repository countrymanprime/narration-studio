import { modals } from '@/app/modals'
import { fmtD, hm, num } from '@/format/time'
import { chTag } from '@/selectors/chapters'
import { checkSummary } from '@/selectors/checks'
import { capsOf, gateOf } from '@/selectors/daw'
import { projectBasis } from '@/state/commands/pickups'
import { NOT_MEASURED, sessionMinutes, weekFigures } from '@/selectors/measured'
import { deadlineTone, calc, dueDate, RATIO } from '@/selectors/progress'
import { saveNote } from '@/selectors/daw'
import { pickupList, isDone } from '@/selectors/pickups'
import { numberedChapters } from '@/selectors/chapters'
import { go } from '@/state/commands/nav'
import { exportReport, prodAct, retryDaw, startSession } from '@/state/commands/production'
import { daw } from '@/state/daw'
import { useData, useMock } from '@/state/store'
import { Icon } from '@/ui/Icon'
import { Btn, IconButton } from '@/ui/primitives'
import { NextUp } from './production/NextUp'
import { PipelineTable } from './production/PipelineTable'
import { TargetInfoButton } from './production/TargetInfo'
import { ProgressChart } from './production/ProgressChart'
import { VerdictPill } from './production/VerdictPill'
import './production/context'
import './production/dialogs'

function NoManuscript({ name }: { name: string }) {
  return (
    <div className="page">
      <div className="phead"><div><h1>Production</h1><div className="sub">{name}</div></div></div>
      <div className="panel">
        <div className="empty" style={{ padding: '64px 16px' }}>
          <h3>Start by importing your manuscript</h3>
          <span style={{ maxWidth: '52ch' }}>The app reads your manuscript, finds the chapters, and works out how much finished audio, recording and editing that means.</span>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn primary" id="imp0" onClick={() => modals.importFlow('import')}>Import manuscript</button>
            <IconButton icon="calendar" tip="Set a due date" id="setdue" onClick={() => go('schedule')} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ProductionPage() {
  const data = useData()
  const mock = useMock()
  if (!mock.hasManuscript) return <NoManuscript name={data.projectName} />
  const k = calc(data)
  const record = gateOf(mock, 'record')
  const dawDown = !capsOf(mock).reachable
  const chapters = numberedChapters(data).length
  const pct = (x: number): string => ((x / k.W) * 100).toFixed(2) + '%'
  const seg: Array<[string, string, number]> = [
    ['Delivered', 'var(--ok)', k.mw],
    ['Proofed', '#5E9E6E', k.pw - k.mw],
    ['Edited', 'var(--info)', k.ew - k.pw],
    ['Recorded', 'var(--copper)', k.rw - k.ew],
    ['Not recorded yet', 'var(--line-strong)', k.W - k.rw],
  ]
  const due = fmtD(dueDate(data))
  const tone = deadlineTone(data, k)
  const minutes = sessionMinutes(pickupList(data).filter((x) => !isDone(data, x.id)).map((x) => x.id))
  const week = weekFigures(data)
  const checks = checkSummary(data, projectBasis())
  const toCheck = [...checks.stale, ...checks.none]
  const saved = saveNote(daw().projectState(), daw().capabilities().daw)
  const names = (ids: string[]): string => ids.map((id) => { const c = data.chapters.find((x) => x.id === id); return c ? chTag(data, c) : id }).join(', ')
  return (
    <div className="page">
      {dawDown ? (
        <div className="banner">
          <b>{record.label} is not running.</b><span>Progress that comes from {record.label} may be out of date until it is running again.</span>
          <span className="spacer" />
          <IconButton icon="refresh" tip="Retry" id="retry" onClick={retryDaw} />
          <Btn className="quiet" data-act="settings" onClick={() => prodAct('settings')}>Use built-in recorder</Btn>
        </div>
      ) : null}
      <div className="phead">
        <div className="stack" style={{ gap: 8, flex: '1 1 380px', minWidth: 0 }}>
          <h1>Production</h1>
          <div className="sub">{chapters} chapters · {num(k.W)} words · delivery due <b className={'tone-' + tone}>{due}</b> (<span className={'tone-' + tone}>{k.daysLeft} days</span>)</div>
          <div><VerdictPill data={data} k={k} /></div>
        </div>
        <div className="row" style={{ flex: 'none' }}>
          <IconButton icon="export" tip="Export status report" id="exp" onClick={exportReport} />
          <button type="button" className="btn primary" id="sess" disabled={!record.ok} onClick={startSession}><Icon name="record" />Start session</button>
        </div>
      </div>
      <div className="kpis">
        <button type="button" className="kpi" data-act="script" onClick={() => prodAct('script')}><span className="label">Finished audio</span><span className="v">{hm(k.rw / k.wph)} <small>/ {hm(k.fh)}</small></span><span className="s" title="Recorded so far, out of the whole book (estimate)">recorded</span></button>
        <div className="kpiw"><button type="button" className="kpi" data-act="booth" onClick={() => prodAct('booth')}><span className="label">Recording</span><span className="v">{hm(k.recLeft)} <small>left</small></span><span className="s" title={`Estimated ${RATIO.rec.toFixed(1)}× the finished hours`}>of {hm(k.recTotal)} est.</span></button><TargetInfoButton /></div>
        <button type="button" className="kpi" data-act="edithelp" onClick={() => prodAct('edithelp')}><span className="label">Editing + proof</span><span className="v">{hm(k.editLeft + k.proofLeft)} <small>left</small></span><span className="s" title={`Estimated ${(RATIO.edit + RATIO.proof).toFixed(2)}× the finished hours`}>of {hm(k.editTotal)} est.</span></button>
        <button type="button" className="kpi" data-act="pickups" onClick={() => prodAct('pickups')}><span className="label">Open pickups</span><span className="v">{k.pick}</span><span className="s" title="Time in the booth">{minutes.ok ? 'about ' + minutes.value + ' min' : NOT_MEASURED}</span></button>
        <button type="button" className="kpi" data-act="master" onClick={() => prodAct('master')}><span className="label">Delivery check</span><span className="v">{k.pass} <small>/ {data.chapters.length}</small></span><span className="s" title="Chapters that pass ACX, fail, or have not been checked">{k.fail} fail · {data.chapters.length - k.measured} unchecked</span></button>
        <button type="button" className="kpi" data-act="schedule" onClick={() => prodAct('schedule')}><span className="label">Due</span><span className={'v tone-' + tone}>{due}</span><span className="s">{k.daysLeft} days · {k.verdict === 'ok' ? 'on track' : k.verdict === 'tight' ? 'tight' : 'behind'}</span></button>
      </div>
      <div className="pstats">
        <section className="panel side-stage">
          <div className="ph"><h2 title={`By finished audio, at each stage. Estimated at ${num(k.wph)} words per finished hour.`}>Where the book stands</h2></div>
          <div className="pb" style={{ overflow: 'visible', padding: '14px 16px' }}>
            <div className="stage-bar" role="img" aria-label="Book progress by stage">
              {seg.map((s) => <i key={s[0]} title={s[0] + ': ' + hm(s[2] / k.wph)} style={{ width: pct(s[2]), background: s[1] }} />)}
            </div>
          </div>
          <div className="legend">{seg.map((s) => <span key={s[0]}><span className="sw" style={{ background: s[1] }} />{s[0]} <b className="mono">{hm(s[2] / k.wph)}</b></span>)}</div>
        </section>
        <section className="panel side-week">
          <div className="ph"><h2>This week</h2></div>
          <div className="pb stack" style={{ overflow: 'visible' }}>
            <div className="optrow"><span>Recorded this week</span><span className="mono" data-week>{week.week.ok ? hm(week.week.value / 3600) + (week.target != null ? ' / ' + hm(week.target / 3600) : '') : NOT_MEASURED}</span></div>
            {week.week.ok && week.target ? (
              <div className="prog" style={{ height: 8, background: 'var(--line)', borderRadius: 4, overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', width: Math.min(100, (week.week.value / week.target) * 100) + '%', background: 'var(--copper)' }} /></div>
            ) : null}
            <div className="optrow"><span>Voice rest (last 24 h)</span><span className="mono" data-rest>{week.last24h.ok ? hm(week.last24h.value / 3600) + ' recorded' : NOT_MEASURED}</span></div>
          </div>
        </section>
        <section className="panel side-check">
          <div className="ph">
            <h2 title="Speech recognition compared with the manuscript">Recording check</h2><span className="spacer" />
            <IconButton icon="listen" tip="Check recordings…" id="chk-prod" aria-haspopup="dialog" disabled={dawDown || !toCheck.length} tipSide="r" onClick={() => modals.checkRecordings(toCheck)} />
          </div>
          <div className="pb stack" style={{ overflow: 'visible' }}>
            <div className="optrow" title={[names(checks.current), saved].filter(Boolean).join(' · ')}><span>Checked, as of last save</span><b className="mono" data-chk="current">{checks.current.length}</b></div>
            <div className="optrow" title={names(checks.stale)}><span>Out of date</span><b className={'mono' + (checks.stale.length ? ' tone-warn' : '')} data-chk="stale">{checks.stale.length}</b></div>
            <div className="optrow" title={names(checks.none)}><span>Not checked yet</span><b className="mono" data-chk="none">{checks.none.length}</b></div>
          </div>
        </section>
      </div>
      <div className="pgrid">
        <div className="stack" style={{ gap: 16 }}>
          <section className="panel"><div className="ph"><h2>Chapter pipeline</h2></div><PipelineTable data={data} /></section>
        </div>
        <div className="stack" style={{ gap: 16 }}>
          <section className="panel side-next">
            <div className="ph"><h2 title="Ranked by risk to the due date">Next up</h2></div>
            <div className="pb" style={{ overflow: 'visible', paddingTop: 4, paddingBottom: 4 }}><NextUp data={data} k={k} record={record} /></div>
          </section>
          <section className="panel side-chart">
            <div className="ph"><h2 title="Plan dashed, actual solid, projection dotted">Recorded vs plan</h2><span className="spacer" /><IconButton icon="calendar" tip="Open schedule" data-act="schedule" tipSide="r" onClick={() => prodAct('schedule')} /></div>
            <div className="pb" style={{ overflow: 'visible' }}><ProgressChart data={data} k={k} height={200} fill /></div>
          </section>
        </div>
      </div>
    </div>
  )
}
