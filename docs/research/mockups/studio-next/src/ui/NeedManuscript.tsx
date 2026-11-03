import { modals } from '@/app/modals'

/** Shown by every page that needs the manuscript, until one is imported. */
export function NeedManuscript({ title }: { title: string }) {
  return (
    <div className="page">
      <div className="panel">
        <div className="empty">
          <h3>{title}</h3>
          <span>This project has no manuscript yet. Import one to begin.</span>
          <button type="button" className="btn primary" id="imp0" onClick={() => modals.importFlow('import')}>Import manuscript</button>
        </div>
      </div>
    </div>
  )
}
