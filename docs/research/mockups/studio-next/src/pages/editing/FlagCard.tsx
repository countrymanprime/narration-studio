import type { BookData } from '@/domain/schemas'
import { clock } from '@/format/time'
import { editGateOf } from '@/selectors/daw'
import { duplicateRead } from '@/selectors/editing'
import { joinWords, type DocPara } from '@/selectors/scriptedit'
import { acceptWords, docNow, markForPickup, playFrom, requestDelete } from '@/state/commands/scriptedit'
import { splitDuplicate } from '@/state/commands/editing'
import { getState } from '@/state/store'
import { Icon } from '@/ui/Icon'
import { Btn, Pill } from '@/ui/primitives'
import { update } from '@/state/store'

const bare = (t: string): string => t.replace(/[,.;:!?”“]+$/g, '').replace(/^[“‘]+/g, '')
const closeCard = (): void => update((d) => { d.ui.editing.flag = null })

/**
 * What the app noticed about a word, in a card under its line: a misread (what was heard, how sure), a word not read, a word the recogniser was
 * unsure of, words that were said and are not in the script, a line read twice. It suggests; the narrator decides, and looking changes nothing.
 */
export function FlagCard({ dp, flag, data }: { dp: DocPara; flag: string; data: BookData }) {
  const mock = getState().mock
  const cut = editGateOf(mock, 'cutRange')
  if (flag.startsWith('dup:')) {
    const x = dp.items.filter((i) => i.dup)
    const passage = dp.passage
    const dup = passage ? duplicateRead(data, passage) : null
    const at = x[0]?.t0 ?? dup?.at ?? 0
    return (
      <div className="flagcard" role="note" data-flagcard="dup">
        <div className="row" style={{ flexWrap: 'nowrap' }}><Pill kind="violet" size="sm">Read twice</Pill><b>The line is read twice</b></div>
        <p className="sub">{dp.take?.id} reads the line twice. The second read starts at {clock(at)}.</p>
        <div className="row">
          <Btn className="sm primary" id="fcstack" disabled={!passage || !editGateOf(mock, 'takes').ok} onClick={() => { if (passage) splitDuplicate(passage.id); closeCard() }}>Stack as 2 takes</Btn>
          <Btn className="sm" id="fcleave" onClick={closeCard}>Leave in place</Btn>
          <Btn className="sm quiet" id="fcdelete" title={cut.ok ? undefined : cut.reason} disabled={!cut.ok} onClick={() => requestDelete(x.map((i) => i.key))}>Delete second read…</Btn>
        </div>
      </div>
    )
  }
  const it = dp.items.find((i) => i.key === flag)
  if (!it) return null
  const hear = (): void => { if (it.t0 != null) playFrom(Math.max(0, it.t0 - 0.3), (it.t1 ?? it.t0) + 0.3, 'the word') }
  const keys = it.st === 'extra' ? docNow().items.filter((i) => i.pid === it.pid && i.st === 'extra' && i.run === it.run && !i.cut).map((i) => i.key) : [it.key]
  if (it.st === 'extra') {
    const run = dp.items.filter((i) => keys.includes(i.key))
    return (
      <div className="flagcard" role="note" data-flagcard="extra">
        <div className="row" style={{ flexWrap: 'nowrap' }}><Pill kind="bad" size="sm">Not in the script</Pill><b>Heard “{joinWords(run)}”</b></div>
        <div className="fc-grid">
          <span className="label">Confidence</span><span className="mono">{Math.round(it.conf * 100)}% · heard at {clock(it.t0 ?? 0)}</span>
        </div>
        <div className="row">
          <Btn className="sm" onClick={hear}><Icon name="play" /> Hear it</Btn>
          <Btn className="sm" id="fckeep" onClick={() => acceptWords(keys)}>Keep this addition</Btn>
          <Btn className="sm danger" id="fcdelete" title={cut.ok ? undefined : cut.reason} disabled={!cut.ok} onClick={() => requestDelete(keys)}>Delete words and audio…</Btn>
        </div>
      </div>
    )
  }
  if (it.st === 'miss') {
    return (
      <div className="flagcard" role="note" data-flagcard="miss">
        <div className="row" style={{ flexWrap: 'nowrap' }}><Pill kind="warn" size="sm">Not read</Pill><b>The script has “{bare(it.text)}”, it was not heard</b></div>
        <div className="row">
          <Btn className="sm" id="fcaccept" onClick={() => acceptWords(keys)}>It is right, accept</Btn>
          <Btn className="sm primary" id="fcpickup" onClick={() => { markForPickup(keys); closeCard() }}>Mark for pickup</Btn>
        </div>
      </div>
    )
  }
  const mis = it.st === 'mis'
  return (
    <div className="flagcard" role="note" data-flagcard={mis ? 'mis' : 'low'}>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <Pill kind="warn" size="sm">{mis ? 'Misread' : 'Low confidence'}</Pill>
        <b>{mis ? <>Heard “{bare(it.heard ?? '')}”, the script says “{bare(it.text)}”</> : <>The recogniser was unsure of “{bare(it.text)}”</>}</b>
      </div>
      <div className="fc-grid">
        <span className="label">Confidence</span><span className="mono">{Math.round(it.conf * 100)}% · heard at {clock(it.t0 ?? 0)}</span>
      </div>
      <div className="row">
        <Btn className="sm" onClick={hear}><Icon name="play" /> Hear the word</Btn>
        <Btn className="sm" id="fcaccept" onClick={() => acceptWords(keys)}>It is right, accept</Btn>
        <Btn className="sm primary" id="fcpickup" onClick={() => { markForPickup(keys); closeCard() }}>Mark for pickup</Btn>
      </div>
    </div>
  )
}
