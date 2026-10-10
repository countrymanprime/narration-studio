import type { BookData } from '@/domain/schemas'
import { chName } from '@/selectors/chapters'
import { chapterNoteCounts, stripIsDense, stripLabel } from '@/selectors/proof'
import { chooseChapter } from '@/ui/ChapterBar'

/** Notes still to review, chapter by chapter. A click opens the chapter. */
export function ChapterStrip({ data, current }: { data: BookData; current: string }) {
  const dense = stripIsDense(data)
  const counts = chapterNoteCounts(data)
  return (
    <div className={'cstrip' + (dense ? ' dense' : '')} role="group" aria-label="Open notes by chapter">
      {data.chapters.map((c) => {
        const k = counts.find((x) => x.id === c.id)!
        const tip = chName(data, c) + ': ' + (k.total ? k.open + ' open of ' + k.total : 'no notes')
        const lab = stripLabel(data, c, dense)
        return (
          <button key={c.id} type="button" className={'cs ' + (k.total ? (k.open ? 'open' : 'clear') : 'none') + (c.id === current ? ' cur' : '')}
            data-cs={c.id} title={tip} aria-label={tip} onClick={() => chooseChapter(c.id)}>
            <span className="n">{lab}</span>
            <b>{k.total ? (dense ? '●' : k.open) : dense ? '' : '—'}</b>
          </button>
        )
      })}
    </div>
  )
}
