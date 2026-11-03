import { act as rtlAct, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { stopBoothTimers } from '@/state/commands/booth'
import { createInitialState, getState, resetState } from '@/state/store'
import { initialPrefs } from '@/state/slices/ui'
import { OverlayHost } from '@/ui/OverlayHost'
import { closePop, closeTopModal, dismissToast, getOverlay } from '@/ui/overlay'
import BoothPage from '@/pages/Booth'
import '@/pages'

beforeEach(() => {
  const s = createInitialState({ prefs: initialPrefs })
  s.ui.page = 'booth'
  resetState(s)
})
afterEach(() => {
  cleanup()
  stopBoothTimers()
  while (getOverlay().modals.length) closeTopModal()
  closePop()
  getOverlay().toasts.forEach((t) => dismissToast(t.id))
})

describe('Booth footer', () => {
  it('Levels is an icon button with a tooltip, not a word, and is not the plain microphone or the speaker glyph', () => {
    render(<><OverlayHost /><BoothPage /></>)
    const b = document.getElementById('blevels')!
    expect(b.classList.contains('ibtn')).toBe(true)
    expect(b.getAttribute('data-tip')).toBe('Levels')
    expect(b.getAttribute('aria-label')).toBe('Levels')
    expect(b.textContent).toBe('')
    expect(b.querySelector('svg')!.getAttribute('data-icon')).toBe('microphone-lines')
    expect(document.getElementById('brec')!.textContent).not.toContain('microphone')
  })

  it('the Levels popover no longer repeats the room tone; the footer still shows it', () => {
    render(<><OverlayHost /><BoothPage /></>)
    expect(document.querySelectorAll('.lvl-inline .bchip2')).toHaveLength(1)
    rtlAct(() => { fireEvent.click(document.getElementById('blevels')!) })
    expect(document.querySelector('.pop')).not.toBeNull()
    expect(document.getElementById('broom')).toBeNull()
    expect(document.querySelector('.pop .bchip2')).toBeNull()
    expect(document.querySelector('.pop')!.textContent).not.toMatch(/Room/)
    expect(document.querySelector('.pop .inmeter')).not.toBeNull()
    expect(document.querySelector('.lvl-inline .bchip2')!.textContent).toMatch(/^Room /)
  })

  it('the key hints are the shared footer (own tone and top line), inside the Booth footer, with the mouse for right-click', () => {
    render(<BoothPage />)
    const keys = document.getElementById('bkeys')!
    expect(keys.classList.contains('keyfoot')).toBe(true)
    expect(keys.closest('.bfoot')).not.toBeNull()
    expect(keys.querySelector('kbd[data-key="RightClick"] svg')).not.toBeNull()
    expect(keys.querySelector('kbd[data-key="Space"] svg')).not.toBeNull()
    expect(keys.querySelector('kbd[data-key="Escape"] .sr')!.textContent).toBe('Esc')
    expect(getState().ui.page).toBe('booth')
  })
})
