import { useEffect, useState } from 'react'
import { useStudio } from '@/state/store'
import { themeNow } from '@/state/commands/prefs'

export const RAIL_COLLAPSE_BELOW = 1360
/** Editing: the timeline strip fits under the script from this width; below it the timeline is a part of the drawer. */
export const STRIP_MIN_WIDTH = 1360

export interface Layout { width: number; /** 1280 and below: busy side columns become drawers or stack */ medium: boolean; narrow: boolean; tiny: boolean; railCollapsed: boolean }

/** Narrow layouts follow the app's own zoom: the class comes from the zoomed viewport width, not a media query. */
export function useLayout(): Layout {
  const prefs = useStudio((s) => s.ui.prefs)
  const [w, setW] = useState(() => document.documentElement.clientWidth)
  useEffect(() => {
    document.documentElement.style.zoom = String(prefs.zoom)
    const on = (): void => setW(document.documentElement.clientWidth)
    on()
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [prefs.zoom])
  /** The menu collapses by itself when the window is narrow; it opens over the page on hover, so nothing moves. */
  const railCollapsed = w < RAIL_COLLAPSE_BELOW
  return { width: w, medium: w <= 1280, narrow: w < 1180, tiny: w < 860, railCollapsed }
}

/** Apply the theme. The Companion window is always dark and puts the narrator's choice back when it closes. */
export function useTheme(companion: boolean): void {
  const choice = useStudio((s) => s.ui.prefs.theme)
  useEffect(() => {
    const el = document.documentElement
    const eff = companion ? 'dark' : choice
    if (eff === 'system') delete el.dataset.theme
    else el.dataset.theme = eff
  }, [choice, companion])
}
export { themeNow }
