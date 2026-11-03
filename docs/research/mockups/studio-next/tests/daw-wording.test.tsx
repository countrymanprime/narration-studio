import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { gateOf } from '@/selectors/daw'
import { initialPrefs } from '@/state/slices/ui'
import { createInitialState, resetState } from '@/state/store'
import { OverlayHost } from '@/ui/OverlayHost'
import PickupsPage from '@/pages/Pickups'
import MasterPage from '@/pages/Master'
import '@/pages'

const open = (page: 'pickups' | 'master', setup: 'reaper' | 'audacity' | 'builtin' | 'reaper-off') => {
  const s = createInitialState({ prefs: initialPrefs })
  s.ui.page = page
  s.mock = { ...s.mock, setup }
  resetState(s)
  return render(<><OverlayHost />{page === 'pickups' ? <PickupsPage /> : <MasterPage />}</>)
}
beforeEach(() => resetState(createInitialState({ prefs: initialPrefs })))
afterEach(cleanup)

describe('DAW-neutral wording and gating', () => {
  it('gateOf reads the capability, the DAW\'s name and the reason', () => {
    const s = createInitialState({ prefs: initialPrefs })
    expect(gateOf({ ...s.mock, setup: 'audacity' }, 'markers')).toEqual({ ok: true, label: 'Audacity', reason: '' })
    expect(gateOf({ ...s.mock, setup: 'builtin' }, 'markers')).toMatchObject({ ok: false, label: 'The built-in recorder', reason: 'Not available with the built-in recorder.' })
    expect(gateOf({ ...s.mock, setup: 'reaper-off' }, 'open')).toMatchObject({ ok: false, reason: 'REAPER is not running.' })
  })

  it('Pickups names the DAW that gets the markers, and is available where the DAW has markers', () => {
    open('pickups', 'audacity')
    const b = document.getElementById('expm') as HTMLButtonElement
    expect(b.getAttribute('data-tip')).toMatch(/ as markers in Audacity$/)
    expect(b.disabled).toBe(false)
    cleanup()
    open('pickups', 'builtin')
    expect((document.getElementById('expm') as HTMLButtonElement).disabled).toBe(true)
  })

  it('Master names the DAW it opens in and disables it where the DAW cannot', () => {
    open('master', 'reaper')
    expect((document.getElementById('openr') as HTMLButtonElement).getAttribute('data-tip')).toBe('Open in REAPER')
    cleanup()
    open('master', 'audacity')
    const b = document.getElementById('openr') as HTMLButtonElement
    expect(b.getAttribute('data-tip')).toBe('Open in Audacity')
    expect(b.disabled).toBe(true)
  })
})
