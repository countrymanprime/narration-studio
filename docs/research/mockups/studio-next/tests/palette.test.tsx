import { act as rtlAct, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { App } from '@/app/App'
import { modals } from '@/app/modals'
import { createInitialState, getState, resetState } from '@/state/store'
import { closeTopModal, getOverlay } from '@/ui/overlay'

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {}
  resetState(createInitialState())
})
afterEach(() => {
  cleanup()
  while (getOverlay().modals.length) closeTopModal()
})

describe('Jump menu', () => {
  it('opens on a short list: one row per group, not every command', () => {
    render(<App />)
    rtlAct(() => modals.palette())
    const rows = screen.getAllByRole('option')
    expect(rows.length).toBeLessThanOrEqual(10)
    expect(screen.queryByText('Go to Production')).toBeNull()
    expect(screen.getByRole('option', { name: /^Go to/ })).toBeTruthy()
  })

  it('a group opens to its own commands and Back returns', async () => {
    render(<App />)
    rtlAct(() => modals.palette())
    const u = userEvent.setup()
    await u.click(screen.getByRole('option', { name: /^Go to/ }))
    expect(screen.getByText('Go to Production')).toBeTruthy()
    await u.click(screen.getByRole('option', { name: /All commands/ }))
    expect(screen.queryByText('Go to Production')).toBeNull()
  })

  it('typing searches everything and running a command closes the menu', async () => {
    render(<App />)
    rtlAct(() => modals.palette())
    const u = userEvent.setup()
    await u.type(document.getElementById('pq')!, 'proof')
    await u.click(screen.getAllByRole('option', { name: /Go to Proof/i })[0])
    expect(getState().ui.page).toBe('proof')
    expect(getOverlay().modals).toHaveLength(0)
  })
})
