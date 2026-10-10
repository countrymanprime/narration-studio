import { useState } from 'react'
import '@/styles/components.css'
import { componentProvider } from '@/providers/components'
import { recommended, shouldOffer } from '@/selectors/components'
import { setAnalysisPrompt } from '@/state/commands/components'
import { scanManuscript } from '@/state/commands/extraction'
import { getState } from '@/state/store'
import { openConsent } from '@/ui/ComponentConsent'
import { openModal } from '@/ui/overlay'
import { Btn, Checkbox } from '@/ui/primitives'
import { openImportDialog } from './ImportDialog'

/** The first scan with nothing downloaded: three ways forward, none of them required. Closing it changes nothing. */
function AnalysisPrompt({ close }: { close: () => void }) {
  const [never, setNever] = useState(false)
  const choose = (go: () => void) => (): void => {
    if (never) setAnalysisPrompt('basic')
    close()
    go()
  }
  const pair = recommended(componentProvider().specs()).map((s) => s.id)
  return (
    <>
      <div className="dh"><h2 style={{ fontSize: 24 }}>Scan the manuscript</h2></div>
      <div className="db stack" id="analysis-prompt">
        <div className="promptopts">
          <Btn className="primary" id="ap-basic" data-autofocus onClick={choose(() => { void scanManuscript() })}>Use basic scan now</Btn>
          <Btn id="ap-download" aria-haspopup="dialog" onClick={choose(() => openConsent(pair))}>Download better analysis…</Btn>
          <Btn id="ap-import" aria-haspopup="dialog" onClick={choose(openImportDialog)}>Import from a file instead</Btn>
        </div>
        <Checkbox label="Don’t ask again" labelClassName="row" checked={never} onCheckedChange={setNever} />
      </div>
      <div className="df"><Btn onClick={close}>Close</Btn></div>
    </>
  )
}

/** The Story Bible's scan button: offer better analysis the first time, otherwise just scan. */
export function startScan(): void {
  if (shouldOffer(getState().ui, componentProvider().specs())) openModal({ label: 'Scan the manuscript', render: ({ close }) => <AnalysisPrompt close={close} /> })
  else void scanManuscript()
}
