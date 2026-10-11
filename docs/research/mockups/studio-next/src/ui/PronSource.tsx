import { pronunciation } from '@/providers/pronunciation'
import { Icon, iconNamed } from './Icon'
import { openMenu } from './Menu'

/** The source a pronunciation came from: its icon and its name. With `onPick` it is a button that offers the other sources, the narrator's own entry among them. */
export function PronSourceTag({ src, onPick, label, iconOnly }: { src: string; onPick?: (id: string) => void; label?: string; iconOnly?: boolean }) {
  const sources = pronunciation().sources()
  const cur = sources.find((s) => s.id === src)
  const name = cur?.label ?? 'Source'
  const inner = (
    <>
      {cur ? <Icon name={iconNamed(cur.icon)} /> : null}
      {iconOnly ? null : <span>{name}</span>}
      {onPick ? <Icon name="caret" /> : null}
    </>
  )
  if (!onPick) {
    return <span className="pill neutral sm" data-pronsrc={src} data-tip={iconOnly ? name : undefined} aria-label={'Source: ' + name}>{inner}</span>
  }
  return (
    <button
      type="button" className="btn sm" data-pronsrc={src} data-keeppop aria-label={(label ?? 'Pronunciation source') + ': ' + name}
      onClick={(e) => openMenu(e.currentTarget, sources.map((s) => ({ v: s.id, l: s.label, icon: iconNamed(s.icon) })), src, onPick)}
    >{inner}</button>
  )
}
