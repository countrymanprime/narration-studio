import { Btn, IconButton } from '@/ui/primitives'
import { chName } from '@/selectors/chapters'
import { openInScript } from '@/state/commands/nav'
import { markReviewed, restoreArchived } from '@/state/commands/manuscript'
import { useData } from '@/state/store'

/** Chapters changed by a replaced manuscript, with what to do about each. Stays open after "Mark reviewed" until none are left. */
export function FlagsDialog({ close }: { close: () => void }) {
  const data = useData()
  const flagged = data.chapters.filter((c) => c.flag)
  return (
    <>
      <div className="dh">
        <div><div className="label">Changed by the new manuscript</div><h2 style={{ fontSize: 26 }}>Chapters to review</h2></div>
        <span className="spacer" />
        <IconButton icon="x" tip="Close" data-x onClick={close} />
      </div>
      <div className="db stack">
        {flagged.length ? flagged.map((c) => (
          <div className="banner" key={c.id}>
            <div style={{ flex: 1 }}><b>{chName(data, c)}</b><div className="sub">{c.flag?.text}</div></div>
            {c.flag?.type === 'archived' ? <Btn data-restore={c.id} onClick={() => { close(); restoreArchived(c.id) }}>Restore</Btn> : null}
            <IconButton icon="script" tip="Open in Script" data-view={c.id} onClick={() => { close(); openInScript(c.id) }} />
            <Btn className="primary" data-ok={c.id} onClick={() => markReviewed(c.id)}>Mark reviewed</Btn>
          </div>
        )) : <div className="empty"><span>No chapters need review.</span></div>}
      </div>
    </>
  )
}
