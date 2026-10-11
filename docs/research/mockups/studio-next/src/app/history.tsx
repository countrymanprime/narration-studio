import { IconButton } from '@/ui/primitives'
import { openModal, toast, closePop } from '@/ui/overlay'
import { getState, undoLast, useStudio } from '@/state/store'
import { modals } from './modals'
import { capsOf, dawShort } from '@/selectors/daw'

function History({ close }: { close: () => void }) {
  const hist = useStudio((s) => s.history)
  const mock = useStudio((s) => s.mock)
  const rows = hist.slice().reverse()
  const bad = mock.setup === 'reaper' && mock.reaperTop === 'other'
  const name = dawShort(capsOf(mock).daw)
  return (
    <>
      <div className="dh">
        <div><div className="label">Ctrl Z undoes the last one</div><h2 style={{ fontSize: 24 }}>Undo history</h2></div>
        <span className="spacer" /><IconButton icon="x" tip="Close" onClick={close} />
      </div>
      <div className="db stack">
        {rows.length ? rows.map((e, i) => (
          <div key={e.id}>
            <div className="optrow" style={{ gap: 8 }}>
              <span style={{ flex: 1, minWidth: 0 }}>{e.label}</span>
              {e.daw && mock.setup === 'reaper' ? <span className={'pill ' + (bad && i === 0 ? 'warn' : 'ok')}>{name}</span> : <span className="pill neutral">App</span>}
              {i === 0 ? <IconButton icon="undo" tip="Undo (Ctrl+Z)" onClick={() => { close(); toast(undoLast().message) }} /> : null}
            </div>
            {i === 0 && e.daw && bad ? <div className="sub">{name}’s own last action is something else, so this one will not be undone from here.</div> : null}
          </div>
        )) : <div className="sub">Nothing to undo yet.</div>}
      </div>
    </>
  )
}

modals.history = () => { closePop(); openModal({ label: 'Undo history', render: ({ close }) => <History close={close} /> }) }
void getState
