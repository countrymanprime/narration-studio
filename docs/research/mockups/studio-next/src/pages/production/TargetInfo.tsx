import { WPH } from '@/config/estimates'
import { hm, mmss, num } from '@/format/time'
import { chTag } from '@/selectors/chapters'
import { basisOf, ownRate, targetHours } from '@/selectors/pace'
import { setRateBasis } from '@/state/commands/production'
import { useData } from '@/state/store'
import { closePop, popAt } from '@/ui/overlay'
import { IconButton, Seg } from '@/ui/primitives'

/** What the finished-hour target is made of: the standard rate, the narrator's own measured rate, the target both ways and which one the schedule uses. */
export function TargetPopover() {
  const b = useData()
  const own = ownRate(b)
  const hours = targetHours(b)
  const basis = basisOf(b)
  const chapters = own.ok ? own.value.chapters.map((id) => b.chapters.find((c) => c.id === id)).flatMap((c) => (c ? [chTag(b, c)] : [])) : []
  return (
    <div className="stack target-info" role="dialog" aria-label="Finished-hour target" style={{ gap: 10, width: 320 }}>
      <div className="label">Finished-hour target</div>
      <div className="ti-grid">
        <div className={'ti-cell' + (basis === 'standard' ? ' on' : '')} data-basis="standard">
          <span className="label">Standard</span>
          <span className="mono"><b data-ti-rate="standard">{num(WPH)}</b> <small>w/h</small></span>
          <span className="sub">Target <b className="mono" data-ti-target="standard">{hm(hours.standard)}</b></span>
        </div>
        <div className={'ti-cell' + (basis === 'own' ? ' on' : '')} data-basis="own">
          <span className="label">Yours</span>
          <span className="mono"><b data-ti-rate="own">{own.ok ? num(own.value.wph) : '—'}</b> <small>w/h</small></span>
          <span className="sub">Target <b className="mono" data-ti-target="own">{hours.own != null ? hm(hours.own) : '—'}</b></span>
        </div>
      </div>
      <div className="sub" data-ti-breakdown>
        {own.ok
          ? (chapters.length > 1 ? chapters.slice(0, -1).join(', ') + ' and ' + chapters[chapters.length - 1] : chapters.join('')) + (chapters.length === 1 ? ' has' : ' have') + ' a measured length: ' + num(own.value.words) + ' words in ' + mmss(Math.round(own.value.seconds)) + '.'
          : 'Your rate is not measured yet. ' + own.reason}
      </div>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <span className="label">Schedule basis</span>
        <Seg<'standard' | 'own'> label="Schedule basis" value={basis} onChange={setRateBasis}
          options={[['standard', 'Standard'], ...(own.ok ? ([['own', 'Your pace']] as Array<['own', string]>) : [])]} />
      </div>
    </div>
  )
}

/** Hover and keyboard focus open it, a click keeps it open; one opened by hover closes again when the pointer leaves both the icon and the popover. */
let byHover = false
export function TargetInfoButton() {
  const open = (el: HTMLElement, hover: boolean): void => {
    byHover = hover
    popAt(el, () => <TargetPopover />, 'target')
  }
  const leave = (): void => {
    if (!byHover) return
    setTimeout(() => { if (byHover && !document.querySelector('.pop.target:hover, #target-info:hover')) closePop() }, 250)
  }
  return (
    <span onMouseLeave={leave} className="kpi-info-wrap">
      <IconButton icon="info" tip="Finished-hour target" id="target-info" className="quiet kpi-info" aria-haspopup="dialog"
        onMouseEnter={(e) => { if (!document.querySelector('.pop.target')) open(e.currentTarget, true) }}
        onFocus={(e) => { if (e.currentTarget.matches(':focus-visible') && !document.querySelector('.pop.target')) open(e.currentTarget, false) }}
        onClick={(e) => { open(e.currentTarget, false) }} />
    </span>
  )
}
