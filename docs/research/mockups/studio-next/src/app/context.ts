import { go } from '@/state/commands/nav'
import { setZoom, toggleTheme } from '@/state/commands/prefs'
import { openFind } from '@/state/commands/script'
import { getState } from '@/state/store'
import { I, SUB, SEP, openCtx, type CtxItem } from '@/ui/overlay'
import { contextItemsFor } from './registry'
import { modals } from './modals'

const PAGES: Array<[Parameters<typeof go>[0], string]> = [
  ['production', 'Production'], ['schedule', 'Schedule'], ['script', 'Script'], ['booth', 'Booth'], ['editing', 'Editing'], ['proof', 'Proof'],
  ['pickups', 'Pickups'], ['master', 'Master & QC'], ['delivery', 'Delivery'], ['bible', 'Story Bible'], ['settings', 'Settings'],
]

/** The menu on empty space: where to go, search, view. Every other menu ends with the same two search items. */
export function pageItems(): CtxItem[] {
  const { ui } = getState()
  const z = ui.prefs.zoom
  return [
    SUB('Go to', PAGES.map(([p, l]) => I(l, () => go(p), { checked: ui.page === p }))),
    I('Jump menu…', () => modals.palette(), { k: 'Ctrl K' }),
    I('Find in the manuscript', () => openFind(), { k: 'Ctrl F' }),
    SUB('View', [
      I('Zoom in', () => setZoom(Math.min(1.5, +(z + 0.1).toFixed(2)))),
      I('Zoom out', () => setZoom(Math.max(0.8, +(z - 0.1).toFixed(2)))),
      I('Reset zoom', () => setZoom(1), { disabled: z === 1 }),
      I('Toggle dark theme', () => toggleTheme(ui.prefs.theme)),
    ]),
  ]
}

/** Items every page menu ends with. */
export const tailItems = (): CtxItem[] => [SEP, I('Jump menu…', () => modals.palette(), { k: 'Ctrl K' }), I('Find in the manuscript', () => openFind(), { k: 'Ctrl F' })]

/** Right-click on anything gives that thing's common actions. Pages supply their own with registerContext. */
document.addEventListener('contextmenu', (e) => {
  if (document.querySelector('.scrim')) return
  const t = e.target
  if (!(t instanceof Element)) return
  if (t.closest('input,textarea,select,[contenteditable="true"]')) return
  const items = contextItemsFor(t, e) ?? pageItems()
  if (!items.length) return
  e.preventDefault()
  document.querySelector('.seltool')?.dispatchEvent(new Event('dismiss'))
  const z = getState().ui.prefs.zoom
  openCtx(items, e.clientX / z, e.clientY / z)
})
