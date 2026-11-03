import { toast } from '@/ui/overlay'
import { update } from '../store'
import type { Prefs, ThemeChoice } from '../slices/ui'

export function setPrefs(patch: Partial<Prefs>): void {
  update((d) => {
    Object.assign(d.ui.prefs, patch)
  })
}
export function setZoom(z: number): void {
  setPrefs({ zoom: z })
  toast('Zoom ' + Math.round(z * 100) + '%')
}
export function setTheme(t: ThemeChoice): void {
  setPrefs({ theme: t })
}
/** The theme actually showing, resolving "system". */
export function themeNow(choice: ThemeChoice): 'light' | 'dark' {
  if (choice !== 'system') return choice
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'
}
export function toggleTheme(current: ThemeChoice): void {
  setTheme(themeNow(current) === 'dark' ? 'light' : 'dark')
}
