import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { getState } from '@/state/store'
import {
  closeModal, closePop, dismissToast, getOverlay, useOverlay, openPopoverAt,
  type CtxItem, type CtxSpec, type ModalSpec, type PopoverSpec,
} from './overlay'

const zoomNow = (): number => getState().ui.prefs.zoom || 1

/** Keep a fixed-position box inside the window. Positions are in the zoomed page, like the rest of the app. */
function useClamp(ref: React.RefObject<HTMLElement | null>, x: number, y: number, flipFrom?: { left: number; right: number }, above = false): void {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const z = zoomNow()
    const vw = document.documentElement.clientWidth
    const vh = document.documentElement.clientHeight
    const r = el.getBoundingClientRect()
    let lx = x
    if (flipFrom && lx + r.width / z > vw - 8) lx = flipFrom.left - r.width / z + 4
    el.style.left = Math.max(8, Math.min(lx, vw - r.width / z - 8)) + 'px'
    const top = above ? y - r.height / z : y
    el.style.top = Math.max(8, Math.min(top, vh - r.height / z - 8)) + 'px'
  })
}

function Modal({ spec, top }: { spec: ModalSpec; top: boolean }): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => closeModal(spec.id), [spec.id])
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>('[data-autofocus], input, textarea, select, .btn.primary, button')
    first?.focus()
  }, [])
  useEffect(() => {
    if (!top) return
    const kd = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !spec.full) {
        e.preventDefault()
        e.stopPropagation()
        close()
        return
      }
      if (e.key === 'Tab' && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>('input,button,select,textarea,[tabindex="0"]')].filter((x) => !(x as HTMLButtonElement).disabled && x.offsetParent !== null)
        if (!f.length) return
        const a = f[0]
        const z = f[f.length - 1]
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault()
          z.focus()
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault()
          a.focus()
        }
      }
    }
    document.addEventListener('keydown', kd, true)
    return () => document.removeEventListener('keydown', kd, true)
  }, [top, spec.full, close])
  return (
    <div className={'scrim' + (spec.full ? ' full' : '') + (spec.side ? ' side' : '')} onMouseDown={(e) => { if (!spec.full && e.target === e.currentTarget) close() }}>
      <div ref={ref} className={'dlg' + (spec.wide ? ' wide' : '') + (spec.side ? ' side' : '')} role="dialog" aria-modal="true" aria-label={spec.label}>
        {spec.render({ close })}
      </div>
    </div>
  )
}

function Popover({ spec }: { spec: PopoverSpec }): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  useClamp(ref, spec.x, spec.y, undefined, spec.above)
  const close = useCallback(() => closePop(), [])
  return (
    <div ref={ref} className={'pop ' + spec.className} style={{ left: spec.x, top: spec.y, ...spec.style }}>
      {spec.render({ close })}
    </div>
  )
}

function CtxPanel({ items, x, y, level, parent, closeAll, closeSelf }: {
  items: CtxItem[]; x: number; y: number; level: number
  parent?: { el: HTMLElement; left: number }
  closeAll: () => void; closeSelf: () => void
}): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const [focusSub, setFocusSub] = useState(false)
  const btns = useRef<Array<HTMLButtonElement | null>>([])
  useClamp(ref, x, y, parent ? { left: parent.left, right: 0 } : undefined)
  useEffect(() => {
    if (level === 0 || focusSub) ref.current?.querySelector<HTMLButtonElement>('button.item:not([disabled])')?.focus()
  }, [level, focusSub])

  const enabled = (): HTMLButtonElement[] => [...(ref.current?.querySelectorAll<HTMLButtonElement>('button.item:not([disabled])') ?? [])]
  const onKey = (e: ReactKeyboardEvent): void => {
    const bs = enabled()
    const i = bs.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); bs[Math.min(bs.length - 1, i + 1)]?.focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); bs[Math.max(0, i - 1)]?.focus() }
    else if (e.key === 'ArrowRight' && i >= 0) {
      const idx = Number(bs[i].dataset.ci)
      const it = items[idx]
      if ('sub' in it && it.sub) { e.preventDefault(); e.stopPropagation(); setOpenIdx(idx); setFocusSub(true) }
    } else if ((e.key === 'ArrowLeft' || e.key === 'Escape') && level > 0) {
      e.preventDefault(); e.stopPropagation(); closeSelf(); parent?.el.focus()
    } else if (e.key === 'Escape') { e.stopPropagation(); closeAll() }
  }
  return (
    <>
      <div ref={ref} className="pop menu ctx" style={{ left: x, top: y, minWidth: 240, maxHeight: 'calc(100% - 16px)', overflow: 'auto' }} onKeyDown={onKey}>
        <div role="menu">
          {items.map((it, i) => {
            if ('sep' in it) return <hr key={i} style={{ border: 0, borderTop: '1px solid var(--line)', margin: '4px 0' }} />
            if ('label' in it) return <div key={i} className="label" style={{ padding: '6px 10px 2px' }}>{it.label}</div>
            const hasSub = !!it.sub
            return (
              <button
                key={i} className="item" role="menuitem" data-ci={i} disabled={it.disabled} title={it.title} aria-haspopup={hasSub ? 'menu' : undefined}
                ref={(el) => { btns.current[i] = el }}
                onClick={() => { if (hasSub) { setOpenIdx(i); setFocusSub(true) } else { closeAll(); it.fn?.() } }}
                onMouseEnter={() => { if (it.disabled) return; setFocusSub(false); setOpenIdx(hasSub ? i : null) }}
              >
                {it.sw ? <span className="swatch" style={{ ['--mc' as string]: 'var(--' + it.sw + ')' } as CSSProperties} /> : <span style={{ width: 14, flex: 'none', textAlign: 'center' }}>{it.checked ? '✓' : ''}</span>}
                <span style={{ flex: 1 }}>{it.l}</span>
                {it.k ? <kbd>{it.k}</kbd> : null}
                {hasSub ? <span aria-hidden="true">▸</span> : null}
              </button>
            )
          })}
        </div>
      </div>
      {openIdx != null && btns.current[openIdx] && (() => {
        const it = items[openIdx]
        if (!('sub' in it) || !it.sub) return null
        const r = btns.current[openIdx]!.getBoundingClientRect()
        const pr = ref.current!.getBoundingClientRect()
        const z = zoomNow()
        return (
          <CtxPanel
            key={openIdx} items={it.sub} x={r.right / z - 4} y={r.top / z - 4} level={level + 1}
            parent={{ el: btns.current[openIdx]!, left: pr.left / z }}
            closeAll={closeAll} closeSelf={() => { setOpenIdx(null); setFocusSub(false) }}
          />
        )
      })()}
    </>
  )
}

function ContextMenu({ spec }: { spec: CtxSpec }): ReactNode {
  return <CtxPanel items={spec.items} x={spec.x} y={spec.y} level={0} closeAll={closePop} closeSelf={closePop} />
}

/** Renders every overlay. Mounted once, at the root. */
export function OverlayHost(): ReactNode {
  const o = useOverlay()
  useEffect(() => {
    const md = (e: MouseEvent): void => {
      const t = e.target as Element | null
      if (!t || !(t instanceof Element)) return
      const s = getOverlay()
      if ((s.popover || s.ctx) && !t.closest('.pop') && !t.closest('[data-keeppop]')) closePop()
    }
    document.addEventListener('mousedown', md)
    return () => document.removeEventListener('mousedown', md)
  }, [])
  const opener = o.popover?.opener ?? o.ctx?.opener ?? null
  const prev = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (opener) prev.current = opener
  }, [opener])
  return (
    <>
      <div id="layer">
        {o.modals.map((m, i) => <Modal key={m.id} spec={m} top={i === o.modals.length - 1} />)}
        {o.popover ? <Popover key={o.popover.id} spec={o.popover} /> : null}
        {o.ctx ? <ContextMenu key={o.ctx.id} spec={o.ctx} /> : null}
      </div>
      <div className="toasts" id="toasts" role="status" aria-live="polite">
        {o.toasts.map((t) => (
          <div className="toast" key={t.id}>
            <span>{t.msg}</span>
            {t.undo ? <button onClick={() => { t.undo?.(); dismissToast(t.id) }}>Undo</button> : null}
          </div>
        ))}
      </div>
      <div id="live" className="sr" role="status" aria-live="polite">{o.announcement}</div>
    </>
  )
}

export { openPopoverAt }
