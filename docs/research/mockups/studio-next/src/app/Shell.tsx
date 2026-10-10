import { useMemo } from 'react'
import { chTag } from '@/selectors/chapters'
import { dawShort } from '@/selectors/daw'
import { daw } from '@/state/daw'
import { masterFails } from '@/selectors/master'
import { activeLimits } from '@/selectors/progress'
import { openPickups } from '@/selectors/pickups'
import { openProof } from '@/selectors/proof'
import { go } from '@/state/commands/nav'
import { themeNow, toggleTheme } from '@/state/commands/prefs'
import type { Page } from '@/state/types'
import { useData, useMock, useUi } from '@/state/store'
import { Icon, type IconName } from '@/ui/Icon'
import { Pill } from '@/ui/primitives'
import { modals } from './modals'
import type { Layout } from './layout'

type NavItem = string | { page: Page; label: string; icon: IconName; count?: 'proof' | 'pick' | 'master' }
const NAV: NavItem[] = [
  { page: 'production', label: 'Production', icon: 'home' },
  { page: 'schedule', label: 'Schedule', icon: 'calendar' },
  'PREP',
  { page: 'script', label: 'Script', icon: 'script' },
  { page: 'bible', label: 'Story Bible', icon: 'book' },
  'RECORD',
  { page: 'booth', label: 'Booth', icon: 'mic' },
  'EDIT',
  { page: 'editing', label: 'Editing', icon: 'scissors' },
  'REVIEW',
  { page: 'proof', label: 'Proof', icon: 'wave', count: 'proof' },
  { page: 'pickups', label: 'Pickups', icon: 'listCheck', count: 'pick' },
  'FINISH',
  { page: 'master', label: 'Master & QC', icon: 'gauge', count: 'master' },
  { page: 'delivery', label: 'Delivery', icon: 'upload' },
]

export function Rail({ layout }: { layout: Layout }) {
  const data = useData()
  const ui = useUi()
  const counts = useMemo(() => {
    const limits = activeLimits(data)
    return {
      proof: openProof(data),
      pick: openPickups(data),
      master: data.masterRows.filter((r) => masterFails(r, limits).length).length,
    }
  }, [data])
  const dark = themeNow(ui.prefs.theme) === 'dark'
  return (
    <nav className="rail" aria-label="Main" id="rail">
      <div className="rail-in">
      <div className="brand">
        <div className="logo" aria-hidden="true"><Icon name="mic" /></div>
        <div><b>NARRATION</b><span>STUDIO</span></div>
      </div>
      {NAV.map((n) =>
        typeof n === 'string' ? (
          <div className="grp" key={n}>{n}</div>
        ) : (
          <button
            key={n.page} type="button" className="nav" aria-label={n.label} aria-current={ui.page === n.page ? 'page' : 'false'}
            onClick={() => go(n.page)}
          >
            <span className="ic"><Icon name={n.icon} /></span><span className="nl">{n.label}</span>
            {n.count && counts[n.count] ? <span className="ct">{counts[n.count]}</span> : null}
          </button>
        ),
      )}
      <div className="spacer" />
      <div className="mockdiv" />
      <button type="button" className="nav" id="theme-btn" aria-label="Theme" onClick={() => toggleTheme(ui.prefs.theme)}>
        <span className="ic"><Icon name={dark ? 'sun' : 'moon'} /></span><span className="nl" id="theme-lbl">{dark ? 'Light theme' : 'Dark theme'}</span>
      </button>
      <button type="button" className="nav" aria-label="Settings" aria-current={ui.page === 'settings' ? 'page' : 'false'} onClick={() => go('settings')}>
        <span className="ic"><Icon name="gear" /></span><span className="nl">Settings</span>
      </button>
      </div>
    </nav>
  )
}

export function TopBar() {
  const data = useData()
  const mock = useMock()
  const ui = useUi()
  const caps = daw().capabilities()
  const dawCh = data.chapters.find((c) => c.id === mock.dawChapter)
  /** The chip says which recorder the project is connected to. Whether it is running is in the tooltip. */
  const chip =
    caps.daw === 'builtin'
      ? (['neutral', dawShort(caps.daw), 'Recording happens in the app'] as const)
      : caps.reachable
        ? (['ok', dawShort(caps.daw), 'Linked · following ' + (dawCh ? chTag(data, dawCh) : '')] as const)
        : (['warn', dawShort(caps.daw), 'Not running'] as const)
  return (
    <header className="top" id="top">
      <span className="crumb hide-sm">Project</span>
      <button type="button" className="proj" id="projbtn" title="Switch project" onClick={() => modals.projectPicker()}>{data.projectName}</button>
      <span className="spacer" />
      <button type="button" className="search" id="palette-btn" aria-label="Open jump menu" onClick={() => modals.palette()}>
        <span><Icon name="search" /></span><span className="hide-sm">Jump to or run…</span><kbd>Ctrl K</kbd>
      </button>
      {ui.prefs.zoom !== 1 ? (
        <button type="button" className="chip-hdr" id="zoomchip" title="Zoom (change in the jump menu)" onClick={() => modals.palette('zoom')}>
          {Math.round(ui.prefs.zoom * 100)}%
        </button>
      ) : null}
      <Pill kind={chip[0]} dot size="sm" title={chip[2]}>{chip[1]}</Pill>
    </header>
  )
}
