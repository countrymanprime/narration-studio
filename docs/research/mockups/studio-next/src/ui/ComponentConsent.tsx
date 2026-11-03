import '@/styles/components.css'
import type { ComponentSpec } from '@/domain/components'
import { minutesText, sizeText } from '@/format/size'
import { componentProvider } from '@/providers/components'
import { installComponents } from '@/state/commands/components'
import { toast } from '@/ui/overlay'
import { openModal } from './overlay'
import { Btn } from './primitives'

/** What a component is, where it comes from and what it needs: the same facts in Settings and in the consent. */
export const memoryText = (gb: number): string => 'about ' + gb + ' GB of memory'

function Facts({ s }: { s: ComponentSpec }) {
  return (
    <section className="cfact" data-consent={s.id}>
      <h3>{s.name}<span className="sub">{sizeText(s.sizeMB)}</span></h3>
      <p>{s.does}</p>
      <dl>
        <dt>Downloads from</dt><dd>{s.host}</dd>
        <dt>Needs</dt><dd>{memoryText(s.ramGB)}</dd>
        {s.minutesPerBook ? <><dt>Takes</dt><dd>{minutesText(s.minutesPerBook)} per book</dd></> : null}
        <dt>Licence</dt><dd>{s.licence}</dd>
      </dl>
    </section>
  )
}

/** Ask before anything is downloaded: what it is, how big, where from, the licence. Download starts it; Cancel changes nothing. */
export function openConsent(ids: string[], then?: () => void): void {
  const specs = ids.flatMap((id) => componentProvider().specs().filter((s) => s.id === id && !s.unavailable))
  if (!specs.length) return
  const total = specs.reduce((n, s) => n + s.sizeMB, 0)
  const title = specs.length === 1 ? 'Download ' + specs[0].name : 'Download better analysis'
  openModal({
    label: title,
    render: ({ close }) => (
      <>
        <div className="dh"><h2 style={{ fontSize: 24 }}>{title}</h2></div>
        <div className="db stack" id="consent">
          {specs.map((s) => <Facts key={s.id} s={s} />)}
          {specs.length > 1 ? <span className="label" data-consent-total>Total download · {sizeText(total)}</span> : null}
        </div>
        <div className="df">
          <Btn onClick={close}>Cancel</Btn>
          <Btn className="primary" id="consent-go" data-autofocus onClick={() => {
            close()
            toast('Downloading ' + specs.map((s) => s.name).join(' and ') + '.')
            void installComponents(specs.map((s) => s.id)).then(then)
          }}>Download</Btn>
        </div>
      </>
    ),
  })
}
