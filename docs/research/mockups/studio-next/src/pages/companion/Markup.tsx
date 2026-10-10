import { createElement, type ReactNode } from 'react'

const TAG = /(<\/?(?:b|i|del|ins)>)/

/** Render the few inline tags a proof note's script uses (b, i, del, ins) without injecting HTML. */
export function Markup({ text }: { text: string }) {
  const root: ReactNode[] = []
  const stack: Array<{ tag: string; kids: ReactNode[] }> = []
  const kids = (): ReactNode[] => (stack.length ? stack[stack.length - 1].kids : root)
  text.split(TAG).forEach((part, i) => {
    const m = /^<(\/?)(b|i|del|ins)>$/.exec(part)
    if (!m) { if (part) kids().push(part); return }
    if (!m[1]) stack.push({ tag: m[2], kids: [] })
    else if (stack.length && stack[stack.length - 1].tag === m[2]) {
      const top = stack.pop()!
      kids().push(createElement(top.tag, { key: i }, ...top.kids))
    }
  })
  while (stack.length) { const top = stack.pop()!; kids().push(createElement(top.tag, { key: 'u' + stack.length }, ...top.kids)) }
  return <>{root}</>
}
