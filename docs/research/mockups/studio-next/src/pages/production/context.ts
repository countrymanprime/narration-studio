import { registerContext } from '@/app/registry'
import { tailItems } from '@/app/context'
import { chName } from '@/selectors/chapters'
import { openInBooth, openInMaster, openInProof, openInScript } from '@/state/commands/nav'
import { gotoInDaw } from '@/state/commands/production'
import { gateOf } from '@/selectors/daw'
import { getState } from '@/state/store'
import { I, L, SEP } from '@/ui/overlay'

/** Right-click on a Production pipeline row. */
registerContext((t) => {
  const row = t.closest('tr[data-chrow]')
  const s = getState()
  if (!row || s.ui.page !== 'production') return null
  const id = (row as HTMLElement).dataset.chrow as string
  const c = s.data.chapters.find((x) => x.id === id)
  if (!c) return null
  return [
    L(chName(s.data, c)),
    I('Open prep in Script', () => openInScript(id)),
    I('Open in Booth', () => openInBooth(id), { disabled: !gateOf(s.mock, 'record').ok }),
    I('Open Proof', () => openInProof(id)),
    I('Open Master & QC', () => openInMaster(id)),
    SEP,
    I('Go to this chapter in ' + gateOf(s.mock, 'goto').label, () => gotoInDaw(id), { disabled: !gateOf(s.mock, 'goto').ok }),
    ...tailItems(),
  ]
})
