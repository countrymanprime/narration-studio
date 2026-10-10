import { useEffect } from 'react'
import { PAGES, Companion } from '@/pages'
import { useStudio } from '@/state/store'
import { OverlayHost } from '@/ui/OverlayHost'
import { TooltipHost } from '@/ui/Tooltip'
import { Icon } from '@/ui/Icon'
import { useGlobalKeys } from './keys'
import { useLayout, useTheme } from './layout'
import { modals } from './modals'
import { Rail, TopBar } from './Shell'
import './palette'
import './help'
import './mock-states'
import './history'
import './context'

export function App() {
  const page = useStudio((s) => s.ui.page)
  const companion = useStudio((s) => s.mock.companion)
  const layout = useLayout()
  useTheme(companion)
  const highlight = useStudio((s) => s.mock.highlight)
  useEffect(() => { document.documentElement.dataset.hl = highlight }, [highlight])
  useGlobalKeys()
  useEffect(() => {
    document.body.classList.toggle('booth-on', page === 'booth' && !companion)
    document.body.classList.toggle('cmp-on', companion)
    document.body.classList.toggle('nr', layout.narrow)
    document.body.classList.toggle('md', layout.medium)
  }, [page, companion, layout.narrow, layout.medium])
  const Page = companion ? Companion : PAGES[page]
  return (
    <>
      <div className={'app' + (layout.railCollapsed && layout.width >= 860 ? ' rail-c' : '') + (layout.narrow ? ' nr' : '') + (layout.medium ? ' md' : '') + (layout.tiny ? ' tt' : '')} id="app">
        <Rail layout={layout} />
        <TopBar />
        <main id="main" tabIndex={-1}><Page /></main>
      </div>
      <OverlayHost />
      <TooltipHost />
      <button type="button" className="mockbtn" id="mockbtn" aria-haspopup="dialog" aria-label="Mock states" data-tip="Mock states" data-keeppop onClick={() => modals.mockStates()}><Icon name="sliders" /></button>
    </>
  )
}
