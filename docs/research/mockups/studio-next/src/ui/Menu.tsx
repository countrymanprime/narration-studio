import { useEffect, useRef, type CSSProperties, type KeyboardEvent } from 'react'
import { Icon, type IconName } from './Icon'
import { closePop, popAt } from './overlay'

export interface MenuOption<T extends string = string> { v: T; l: string; css?: CSSProperties; icon?: IconName }

function MenuList<T extends string>({ items, cur, pick, anchor, label }: {
  items: Array<MenuOption<T>>; cur: T | string; pick: (v: T) => void; anchor: HTMLElement; label: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const bs = ref.current?.querySelectorAll<HTMLButtonElement>('button.item')
    if (!bs?.length) return
    ;(ref.current!.querySelector<HTMLButtonElement>('[aria-checked="true"]') ?? bs[0]).focus()
  }, [])
  const onKey = (e: KeyboardEvent): void => {
    const bs = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button.item') ?? [])]
    const i = bs.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); bs[Math.min(bs.length - 1, i + 1)]?.focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); bs[Math.max(0, i - 1)]?.focus() }
    else if (e.key === 'Escape') { e.stopPropagation(); closePop(); anchor.focus() }
  }
  return (
    <div ref={ref} role="menu" aria-label={label} onKeyDown={onKey}>
      {items.map((it) => {
        const on = String(it.v) === String(cur)
        return (
          <button key={it.v} type="button" className="item" role="menuitemradio" aria-checked={on} style={it.css}
            onClick={() => { closePop(); pick(it.v); anchor.focus() }}>
            <span style={{ width: 16, flex: 'none' }}>{on ? '✓' : ''}</span>
            {it.icon ? <Icon name={it.icon} /> : null}
            {it.l}
          </button>
        )
      })}
    </div>
  )
}

/** A Word-style menu: a list of choices under a button, arrow keys to move, Enter to choose, Escape to close. */
export function openMenu<T extends string>(btn: HTMLElement, items: Array<MenuOption<T>>, cur: T | string, pick: (v: T) => void): void {
  popAt(btn, () => <MenuList items={items} cur={cur} pick={pick} anchor={btn} label={btn.getAttribute('aria-label') ?? ''} />, 'menu')
}
