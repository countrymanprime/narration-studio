/** Delivery: pick a delivery profile, check every chapter against it, then build the package. */
import { useMemo } from 'react'
import type { Limit, LimitKey } from '@/domain/schemas'
import { chName } from '@/selectors/chapters'
import { LIMIT_KEYS, chapterStates, limText } from '@/selectors/master'
import { openInMaster, go } from '@/state/commands/nav'
import { buildPackage, openOutput, renameProfile, setFormat, setLimit, setOutput, setProfile } from '@/state/commands/delivery'
import { useData, useMock, useUi } from '@/state/store'
import { CommitInput } from '@/ui/CommitInput'
import { openMenu } from '@/ui/Menu'
import { NeedManuscript } from '@/ui/NeedManuscript'
import { IconButton } from '@/ui/primitives'

const FORMAT_ROWS = [
  ['format', 'File format'], ['rate', 'Sample rate'], ['bitrate', 'Bit rate'], ['channels', 'Channels'], ['max', 'Longest file (min)'], ['sample', 'Retail sample'], ['files', 'Files'],
] as const

export default function DeliveryPage() {
  const data = useData()
  const ui = useUi()
  const mock = useMock()
  const prof = data.profiles.find((p) => p.key === ui.delivery.profile) ?? data.profiles[0]
  const st = useMemo(() => chapterStates(data, prof.limits, mock.deliveryReady), [data, prof, mock.deliveryReady])
  if (!mock.hasManuscript) return <NeedManuscript title="Delivery" />

  const bad = st.filter((x) => x.k === 'bad').length
  const wait = st.filter((x) => x.k === 'wait').length
  const ready = !bad && !wait
  const built = ui.delivery.built && ready
  const bi = prof.builtin
  const num = (k: LimitKey, f: 'lo' | 'hi', l: Limit) => (
    <CommitInput type="number" step="0.1" value={l[f] ?? ''} aria-label={l.l + ' ' + (f === 'lo' ? 'lowest' : 'highest')} style={{ width: 84 }} onCommit={(v) => setLimit(k, f, parseFloat(v))} />
  )
  const limCell = (k: LimitKey) => {
    const r = prof.limits[k]
    if (bi) return <span className="mono">{limText(prof.limits, k)}</span>
    return (
      <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
        {r.lo != null ? num(k, 'lo', r) : <span className="sub">no lowest</span>}<span className="sub">to</span>{r.hi != null ? num(k, 'hi', r) : <span className="sub">no highest</span>}<span className="sub">{r.u}</span>
      </span>
    )
  }

  return (
    <div className="page two">
      <div className="stack" style={{ gap: 16, minWidth: 0 }}>
        <section className="panel">
          <div className="ph">
            <h1>Delivery</h1>
            <span className="spacer" />
            <span className="label">Profile</span>
            <button type="button" className="btn" id="dprof" data-keeppop aria-haspopup="menu" aria-label={'Delivery profile: ' + prof.name}
              onClick={(e) => openMenu(e.currentTarget, data.profiles.map((p) => ({ v: p.key, l: p.builtin ? p.name + ' (built in)' : p.name })), prof.key, setProfile)}>
              <span>{prof.name}</span> <span aria-hidden="true">▾</span>
            </button>
            {bi ? <span className="pill neutral">Built in</span> : <CommitInput id="pname" value={prof.name} aria-label="Profile name" style={{ width: 160 }} onCommit={renameProfile} />}
          </div>
          <div className="pb stack">
            <div className="stack" style={{ gap: 8 }}>
              <span className="label">Checks on every chapter</span>
              {LIMIT_KEYS.map((k) => <div key={k} className="optrow"><span>{prof.limits[k].l}</span>{limCell(k)}</div>)}
            </div>
            <div className="stack" style={{ gap: 8 }}>
              <span className="label">Files</span>
              {FORMAT_ROWS.map(([f, l]) => (
                <div key={f} className="optrow">
                  <span>{l}</span>
                  {bi ? <span className="mono">{prof.format[f]}</span> : <CommitInput value={prof.format[f]} aria-label={l} style={{ width: 200 }} onCommit={(v) => setFormat(f, v)} />}
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="panel">
          <div className="ph"><h2>Output</h2></div>
          <div className="pb stack">
            <label className="stack" style={{ gap: 6 }}><span className="label">Folder</span><CommitInput id="dout" value={ui.delivery.out} aria-label="Output folder" onCommit={setOutput} /></label>
            <div className="row">
              <button type="button" className="btn primary" id="dbuild" disabled={!ready} onClick={() => buildPackage(prof.name)}>Build {prof.name} package</button>
              <span className="sub">{ready ? 'Every chapter passes.' : bad + ' failing, ' + wait + ' not ready'}</span>
            </div>
            {built ? (
              <div className="stack" style={{ gap: 6 }}>
                <div className="row">
                  <span className="pill ok">Built</span><b>{st.length + 1} files</b><span className="sub">in {ui.delivery.out}</span><span className="spacer" />
                  <IconButton icon="folder" tip="Open the folder" id="dopen" tipSide="r" onClick={openOutput} />
                </div>
                {[...st.map((x) => chName(data, x.c)), 'Retail sample'].map((n) => <div key={n} className="optrow"><span>{n}</span><span className="pill ok">Written</span></div>)}
              </div>
            ) : null}
          </div>
        </section>
      </div>
      <aside className="panel">
        <div className="ph"><h2>Before you build</h2><span className="spacer" /><IconButton icon="arrowRight" tip="Master & QC" id="dmaster" onClick={() => go('master')} /></div>
        <div className="pb stack">
          <div className="optrow"><span>Chapters passing</span><b className="mono">{st.filter((x) => x.k === 'ok').length} of {st.length}</b></div>
          {st.map((x) => (
            <div key={x.c.id} className="optrow" data-dch={x.c.id} tabIndex={0} role="button" style={{ cursor: 'pointer', padding: '2px 0' }}
              onClick={() => openInMaster(x.c.id)} onKeyDown={(e) => { if (e.key === 'Enter') openInMaster(x.c.id) }}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chName(data, x.c)}</span>
              <span className={'pill ' + (x.k === 'ok' ? 'ok' : x.k === 'bad' ? 'bad' : 'neutral')}>{x.t}</span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  )
}
