/**
 * Scenario matrix: every page under every combination of heading style, book length and recording setup.
 * Nothing on screen may be typed in by hand, so a change of scenario must change what every page shows.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { App } from '@/app/App'
import { createInitialState, resetState } from '@/state/store'
import type { Page } from '@/state/types'
import type { HeadingStyle } from '@/format/headings'
import { closeTopModal, getOverlay } from '@/ui/overlay'

const PAGES: Page[] = ['production', 'schedule', 'script', 'bible', 'booth', 'editing', 'proof', 'pickups', 'master', 'delivery', 'settings']
const STYLES: HeadingStyle[] = ['gutenberg', 'numbered', 'colon']
const SETUPS = ['reaper', 'reaper-off', 'builtin'] as const

beforeAll(() => {
  Element.prototype.scrollTo = () => {}
  Element.prototype.scrollIntoView = () => {}
  window.matchMedia = window.matchMedia || ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }) as MediaQueryList)
})
afterEach(() => {
  cleanup()
  while (getOverlay().modals.length) closeTopModal()
})

describe.each(STYLES)('heading style %s', (style) => {
  describe.each([12, 40] as const)('%i chapters', (chapters) => {
    it.each(SETUPS)('every page renders with no leakage (%s)', (setup) => {
      for (const page of PAGES) {
        const s = createInitialState({ headingStyle: style, chapters })
        s.ui.page = page
        s.mock = { ...s.mock, setup }
        resetState(s)
        const errors: unknown[] = []
        const { container } = render(<App />)
        const text = container.querySelector('#main')?.textContent ?? ''
        expect(text.length, page).toBeGreaterThan(0)
        // A style's labels must not appear under another style.
        if (style !== 'gutenberg') expect(text, page + ' ' + style).not.toMatch(/CHAPTER [IVXLC]+\b/)
        if (style !== 'colon') expect(text, page + ' ' + style).not.toMatch(/Chapter \d+:/)
        expect(errors).toHaveLength(0)
        cleanup()
      }
    })
  })
})
