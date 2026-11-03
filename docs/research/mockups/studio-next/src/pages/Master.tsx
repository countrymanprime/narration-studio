/** Master & QC: measured values checked against the delivery profile's limits. Everything shown is a measurement or a rule result. */
import { useLayoutEffect, type KeyboardEvent } from 'react'
import type { BookData, LimitKey, Limits, MasterRow } from '@/domain/schemas'
import { registerContext } from '@/app/registry'
import { tailItems } from '@/app/context'
import { chTag } from '@/selectors/chapters'
import { gateOf } from '@/selectors/daw'
import { LIMIT_KEYS, chapterStates, consistency, limText, masterFails, masterLabel, masterRowFor, rule, waitingText } from '@/selectors/master'
import { activeLimits } from '@/selectors/progress'
import { daw } from '@/state/daw'
import { getState, update, useData, useMock, useUi } from '@/state/store'
import { go } from '@/state/commands/nav'
import { selectMasterRow } from '@/state/commands/master'
import { ChapterBar } from '@/ui/ChapterBar'
import { NeedManuscript } from '@/ui/NeedManuscript'
import { I, L, toast } from '@/ui/overlay'
import { IconButton } from '@/ui/primitives'

const minus = (n: number): string => String(n).replace('-', '−')

/** RMS by file against the profile's range; the spread across files. */
function Consistency({ data, limits }: { data: BookData; limits: Limits }) {
  const { rows, spread } = consistency(data)
  const W = 520, H = 70, Lm = 12, R = 12
  const min = limits.rms.lo ?? -23, max = limits.rms.hi ?? -18
  const X = (v: number): number => Lm + ((v - min) / (max - min)) * (W - Lm - R)
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="RMS by chapter against the ACX range">
        <rect x={X(min)} y={22} width={X(max) - X(min)} height={26} rx={4} fill="var(--ok-soft)" stroke="var(--ok)" />
        {rows.map(({ row, rms }) => (
          <line key={row.id} x1={X(rms)} x2={X(rms)} y1={16} y2={54} stroke={rule(limits, 'rms', rms) ? 'var(--ink)' : 'var(--bad)'} strokeWidth={3} strokeLinecap="round">
            <title>{masterLabel(data, row)}: {rms} dB</title>
          </line>
        ))}
        <text x={X(min)} y={H - 6} fontSize={11} fill="var(--muted)" fontFamily="IBM Plex Mono,monospace">{minus(min)}</text>
        <text x={X(max)} y={H - 6} fontSize={11} textAnchor="end" fill="var(--muted)" fontFamily="IBM Plex Mono,monospace">{minus(max)}</text>
      </svg>
      <div className="sub">Spread {spread.toFixed(1)} dB across {rows.length} files.</div>
    </>
  )
}

/** Package checks drawn from the profile's file format: nothing here is typed in by hand. */
function packageItems(data: BookData, profileKey: string): Array<['ok' | 'bad' | 'wait', string]> {
  const prof = data.profiles.find((p) => p.key === profileKey) ?? data.profiles[0]
  const f = prof.format
  const secs = (len?: string): number => { const m = /^(\d+):(\d+)$/.exec(len ?? ''); return m ? +m[1] * 60 + +m[2] : 0 }
  const measured = data.masterRows.filter((r) => !r.waiting && r.id !== 'sample')
  const longest = Math.max(0, ...measured.map((r) => secs(r.len)))
  const sample = data.masterRows.find((r) => r.id === 'sample')
  const range = /(\d+)\s*to\s*(\d+)/.exec(f.sample)
  const sampleOk = !sample || !range || (secs(sample.len) >= +range[1] * 60 && secs(sample.len) <= +range[2] * 60)
  return [
    ['ok', 'Chapters are one file each'],
    [longest <= +f.max * 60 ? 'ok' : 'bad', 'Every file under ' + f.max + ' min'],
    ...(sample ? [[sampleOk ? 'ok' : 'bad', 'Retail sample ' + sample.len + ' (' + f.sample + ')']] as Array<['ok' | 'bad', string]> : []),
    ['ok', f.channels + ' · ' + f.rate + ' · ' + f.format + ' ' + f.bitrate],
  ]
}

export default function MasterPage() {
  const data = useData()
  const ui = useUi()
  const mock = useMock()
  const dawOpen = gateOf(mock, 'open')
  const limits = activeLimits(data, ui.delivery.profile)
  const profile = data.profiles.find((p) => p.key === ui.delivery.profile) ?? data.profiles[0]
  const rows = data.masterRows
  const firstId = (rows.find((r) => masterFails(r, limits).length) ?? rows[0])?.id ?? null
  // The first time here, show the first file that fails.
  useLayoutEffect(() => { if (mock.hasManuscript && ui.master.row == null && firstId) update((d) => { d.ui.master.row = firstId }) }, [mock.hasManuscript, ui.master.row, firstId])
  if (!mock.hasManuscript) return <NeedManuscript title="Master & QC" />

  const curId = ui.master.row ?? firstId
  const real = rows.find((r) => r.id === curId)
  const chap = data.chapters.find((c) => c.id === curId)
  const cur: MasterRow | undefined = real ?? (chap ? { id: chap.id, waiting: 'Not mastered yet' } : rows[0])
  const fl = cur ? masterFails(cur, limits) : []
  const label = cur ? masterLabel(data, cur) : ''
  const curWait = cur ? waitingText(data, cur) : undefined
  const meas = rows.filter((r) => !r.waiting)
  const failing = meas.filter((r) => masterFails(r, limits).length)
  const pending = chapterStates(data, limits, mock.deliveryReady).filter((x) => x.k === 'wait').length
  const items: Array<['ok' | 'bad' | 'wait', string]> = [
    ...packageItems(data, profile.key),
    ...failing.map((r) => ['bad', (data.chapters.find((c) => c.id === r.id) ? chTag(data, data.chapters.find((c) => c.id === r.id)!) : masterLabel(data, r)) + ' fails ' + masterFails(r, limits).length + ' ' + (masterFails(r, limits).length > 1 ? 'checks' : 'check')] as ['bad', string]),
    ['wait', pending + (pending === 1 ? ' chapter' : ' chapters') + ' not ready'],
  ]
  const cell = (r: MasterRow, k: LimitKey, v: string) => <td className={'mono ' + (r[k] == null || rule(limits, k, r[k]) ? '' : 'bad-t')}>{v}</td>
  const onKey = (r: MasterRow) => (e: KeyboardEvent): void => {
    const i = rows.findIndex((x) => x.id === r.id)
    if (e.key === 'Enter') selectMasterRow(r.id)
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      selectMasterRow(rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))].id)
    }
  }

  return (
    <div className="page two">
      <div className="stack" style={{ gap: 16, minWidth: 0 }}>
        <section className="panel">
          <div className="ph">
            <h1>Master &amp; QC</h1>
            <ChapterBar scopeKey={null} />
            <button type="button" className="pill neutral" id="mprof" title="Open Delivery" onClick={() => go('delivery')}>{profile.name}</button>
            <span className="spacer" />
            <IconButton icon="refresh" tip="Check the files again" id="recheck" tipSide="r" onClick={() => toast(daw().checkAgain(meas.length).message)} />
          </div>
          <div className="tblwrap">
            <table role="grid" aria-label="Per-file checks">
              <thead><tr><th>File</th><th>Length</th><th>RMS</th><th>Peak</th><th>Noise floor</th><th>Head / tail</th><th>Clicks</th><th>Text</th><th>Result</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const on = r.id === cur?.id
                  const w = waitingText(data, r)
                  if (w) {
                    return (
                      <tr key={r.id} tabIndex={on ? 0 : -1} data-mr={r.id} aria-selected={on} onClick={() => selectMasterRow(r.id)} onKeyDown={onKey(r)}>
                        <td>{masterLabel(data, r)}</td><td className="mono">—</td><td colSpan={6} className="sub">{w} · not mastered</td><td><span className="pill neutral">Waiting</span></td>
                      </tr>
                    )
                  }
                  const f = masterFails(r, limits)
                  return (
                    <tr key={r.id} tabIndex={on ? 0 : -1} data-mr={r.id} aria-selected={on} onClick={() => selectMasterRow(r.id)} onKeyDown={onKey(r)}>
                      <td>{masterLabel(data, r)}</td><td className="mono">{r.len}</td>
                      {cell(r, 'rms', r.rms?.toFixed(1) ?? '—')}{cell(r, 'peak', r.peak?.toFixed(1) ?? '—')}{cell(r, 'nf', r.nf?.toFixed(1) ?? '—')}
                      <td className="mono">
                        <span className={r.head == null || rule(limits, 'head', r.head) ? '' : 'bad-t'}>{r.head?.toFixed(1) ?? '—'}</span> / <span className={r.tail == null || rule(limits, 'tail', r.tail) ? '' : 'bad-t'}>{r.tail?.toFixed(1) ?? '—'}</span>
                      </td>
                      <td className="mono">{r.clicks}</td><td className="mono">{r.text}</td>
                      <td><span className={'pill ' + (f.length ? 'bad' : 'ok')}>{f.length ? 'Fail' : 'Pass'}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
        {cur ? (
          <section className="panel">
            <div className="ph">
              <h2>{label} · {cur.waiting ? 'Not mastered' : fl.length ? 'Why it fails' : 'Checks'}</h2>
              <span className="spacer" />
              {cur.waiting ? null : <IconButton icon="play" tip="Play the quietest 5 s" id="quiet" onClick={() => toast('Playing the quietest 5 s of ' + label)} />}
              <IconButton icon="external" tip={'Open in ' + dawOpen.label} id="openr" tipSide="r" disabled={!dawOpen.ok} onClick={() => toast(daw().openInDaw(label).message)} />
            </div>
            <div className="pb stack">
              {cur.waiting ? <div className="sub">{curWait}.</div> : LIMIT_KEYS.map((k) => {
                const v = cur[k]
                const ok = v == null || rule(limits, k, v)
                return (
                  <div key={k} className="optrow">
                    <span className={'pill ' + (ok ? 'ok' : 'bad')}>{ok ? 'Pass' : 'Fail'}</span>
                    <span style={{ flex: 1, marginLeft: 8 }}>{limits[k].l}</span>
                    <span className="mono">{v?.toFixed(1) ?? '—'} {limits[k].u}</span>
                    <span className="sub" style={{ minWidth: 150, textAlign: 'right' }}>limit: {limText(limits, k)}</span>
                  </div>
                )
              })}
            </div>
          </section>
        ) : null}
        <section className="panel">
          <div className="ph"><h2>Book consistency</h2><span className="sub">RMS by file against the {profile.name} range</span></div>
          <div className="pb"><Consistency data={data} limits={limits} /></div>
        </section>
      </div>
      <aside className="panel">
        <div className="ph"><h2>Delivery package · {profile.name}</h2></div>
        <div className="pb stack">
          {items.map(([k, t], i) => (
            <div key={i} className="row" style={{ flexWrap: 'nowrap' }}>
              <span className={'pill ' + (k === 'ok' ? 'ok' : k === 'bad' ? 'bad' : 'neutral')} style={{ minWidth: 24, justifyContent: 'center' }}>{k === 'ok' ? '✓' : k === 'bad' ? '✕' : '…'}</span>
              <span>{t}</span>
            </div>
          ))}
          <div className="stack" style={{ gap: 6, marginTop: 8 }}>
            <button type="button" className="btn primary" id="todeliv" onClick={() => go('delivery')}>Open Delivery</button>
            <span className="sub">{failing.length} failing and {pending} not ready.</span>
          </div>
        </div>
      </aside>
    </div>
  )
}

/* Right-click on a file row. */
registerContext((t) => {
  const s = getState()
  if (s.ui.page !== 'master') return null
  const tr = t.closest('tr[data-mr]') as HTMLElement | null
  if (!tr) return null
  const row = masterRowFor(s.data, tr.dataset.mr ?? '')
  if (!row) return null
  const label = masterLabel(s.data, row)
  const measured = s.data.masterRows.filter((r) => !r.waiting).length
  return [
    L(label),
    I('Show the checks', () => selectMasterRow(row.id)),
    I('Play the quietest 5 s', () => toast('Playing the quietest 5 s of ' + label), { disabled: !!row.waiting }),
    I('Open in ' + gateOf(s.mock, 'open').label, () => toast(daw().openInDaw(label).message), { disabled: !gateOf(s.mock, 'open').ok }),
    I('Check the files again', () => toast(daw().checkAgain(measured).message)),
    ...tailItems(),
  ]
})
