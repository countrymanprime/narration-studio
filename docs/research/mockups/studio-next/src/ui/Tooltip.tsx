import { useEffect, useState } from 'react'
import { getState } from '@/state/store'

interface Tip { text: string; x: number; y: number; above: boolean }

/**
 * One tooltip for the whole app. Any element with `data-tip` (or a `title`, which is taken over so the
 * browser's own box never shows) gets it: on hover after a short delay, immediately on keyboard focus.
 */
export function TooltipHost() {
  const [tip, setTip] = useState<Tip | null>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let cur: Element | null = null
    const find = (t: EventTarget | null): Element | null =>
      t instanceof Element ? t.closest('[data-tip],[data-tip-t],[title]:not(iframe)') : null
    const textOf = (el: Element): string | null => {
      const title = el.getAttribute('title')
      if (title) {
        el.setAttribute('data-tip-t', title)
        el.removeAttribute('title')
        if (!el.getAttribute('aria-label') && !el.textContent?.trim()) el.setAttribute('aria-label', title)
      }
      return el.getAttribute('data-tip') ?? el.getAttribute('data-tip-t')
    }
    const show = (el: Element, text: string): void => {
      const z = getState().ui.prefs.zoom || 1
      const r = el.getBoundingClientRect()
      const vh = document.documentElement.clientHeight
      const above = r.bottom / z + 60 > vh
      setTip({ text, x: (r.left + r.width / 2) / z, y: above ? r.top / z - 6 : r.bottom / z + 6, above })
    }
    const hide = (): void => {
      clearTimeout(timer)
      cur = null
      setTip(null)
    }
    const over = (e: MouseEvent): void => {
      const el = find(e.target)
      if (el === cur) return
      hide()
      if (!el) return
      const text = textOf(el)
      if (!text) return
      cur = el
      timer = setTimeout(() => show(el, text), 320)
    }
    const focus = (e: FocusEvent): void => {
      const el = find(e.target)
      if (!el || !(e.target as HTMLElement).matches?.(':focus-visible')) return
      const text = textOf(el)
      if (text) show(el, text)
    }
    document.addEventListener('mouseover', over)
    document.addEventListener('mousedown', hide)
    document.addEventListener('keydown', hide)
    document.addEventListener('scroll', hide, true)
    document.addEventListener('focusin', focus)
    document.addEventListener('focusout', hide)
    return () => {
      hide()
      document.removeEventListener('mouseover', over)
      document.removeEventListener('mousedown', hide)
      document.removeEventListener('keydown', hide)
      document.removeEventListener('scroll', hide, true)
      document.removeEventListener('focusin', focus)
      document.removeEventListener('focusout', hide)
    }
  }, [])
  if (!tip) return null
  const w = document.documentElement.clientWidth
  const left = Math.max(148, Math.min(tip.x, w - 148))
  return (
    <div className="tooltip" role="tooltip" style={{ left, top: tip.y, transform: `translate(-50%, ${tip.above ? '-100%' : '0'})` }}>
      {tip.text}
    </div>
  )
}
