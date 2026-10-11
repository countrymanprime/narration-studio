import { capsOf, dawLabel } from '@/selectors/daw'
import { Btn, IconButton } from '@/ui/primitives'
import { Icon } from '@/ui/Icon'
import { newProject, openProject, togglePin } from '@/state/commands/manuscript'
import { useData, useMock, useUi } from '@/state/store'
import { popAt, toast } from '@/ui/overlay'

function JumpList({ close, open }: { close: () => void; open: (id: string) => void }) {
  const data = useData()
  const pinned = useUi().pinned
  const pin = data.projects.filter((p) => pinned.includes(p.id))
  const rest = data.projects.filter((p) => !pinned.includes(p.id))
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="label" style={{ padding: '4px 10px' }}>Pinned</div>
      {pin.map((p) => <button type="button" className="item" key={p.id} data-jo={p.id} onClick={() => { close(); open(p.id) }}>★ {p.name}</button>)}
      {pin.length ? null : <div className="sub" style={{ padding: '4px 10px' }}>Nothing pinned</div>}
      <div className="label" style={{ padding: '4px 10px' }}>Recent</div>
      {rest.map((p) => <button type="button" className="item" key={p.id} data-jo={p.id} onClick={() => { close(); open(p.id) }}>{p.name}</button>)}
      <div className="label" style={{ padding: '4px 10px' }}>Tasks</div>
      <button type="button" className="item" data-jn onClick={() => { close(); newProject() }}>New project</button>
    </div>
  )
}

/** The first screen when the app is started on its own: open a recent project or start a new one. */
export function ProjectPicker({ close }: { close: () => void }) {
  const data = useData()
  const mock = useMock()
  const pinned = useUi().pinned
  const open = (id: string): void => { if (openProject(id)) close() }
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="row">
        <div className="logo" aria-hidden="true"><Icon name="mic" /></div>
        <div><b style={{ font: '700 16px var(--f-display)', letterSpacing: '.1em' }}>NARRATION</b><div className="label">Studio</div></div>
      </div>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div><h1 style={{ fontSize: 40 }}>Choose your project</h1><div className="sub">Open the book you’re working on, or start a new project.</div></div>
        <span className="spacer" />
        <button type="button" className="btn primary" id="newp" onClick={() => { close(); newProject() }}>New project</button>
      </div>
      {mock.setup !== 'builtin' ? (
        <div className="banner info"><span>{dawLabel(capsOf(mock).daw)} is running with a project linked to <b>{data.projects[0].name}</b>. Launching from {dawLabel(capsOf(mock).daw)} opens it directly.</span><Btn data-open="alice" onClick={() => open('alice')}>Open</Btn></div>
      ) : null}
      <div className="panel">
        <div className="ph"><h2>Pinned and recent</h2><span className="spacer" /><IconButton icon="folder" tip="Browse folders…" id="browse" onClick={() => toast('Opens a folder chooser.')} /></div>
        {data.projects.map((p) => {
          const on = pinned.includes(p.id)
          return (
            <div className="pcard" key={p.id}>
              <div className="pi">▤</div>
              <div style={{ flex: 1, minWidth: 0 }}><b>{p.name}</b><div className="sub mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.path}</div></div>
              <span className="sub">{p.when}</span>
              <IconButton icon="thumbtack" tip={on ? 'Unpin' : 'Pin'} className="ghost" data-pin={p.id} aria-pressed={on} onClick={() => togglePin(p.id)} />
              <Btn data-open={p.id} onClick={() => open(p.id)}>Open</Btn>
            </div>
          )
        })}
      </div>
      <div className="row">
        <span className="sub">Project files stay in the folder you choose.</span>
        <span className="spacer" />
        <IconButton icon="list" tip="Preview taskbar jump list" className="quiet" id="jl" onClick={(e) => popAt(e.currentTarget, ({ close: c }) => <JumpList close={c} open={open} />)} />
      </div>
    </div>
  )
}

