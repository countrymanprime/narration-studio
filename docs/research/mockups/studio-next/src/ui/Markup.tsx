import { Fragment, type ReactNode } from 'react'

const TAG = /<(\/?)(i|b|del|ins)>/g
type El = 'i' | 'b' | 'del' | 'ins'

/**
 * Fixture text carries four inline tags (<i> <b> <del> <ins>). Only those become elements; anything else,
 * including any other angle brackets, stays plain text, so no HTML is ever injected.
 */
export function Markup({ text }: { text: string }): ReactNode {
  type Node = { tag: El | null; kids: Array<string | Node> }
  const root: Node = { tag: null, kids: [] }
  const stack: Node[] = [root]
  let last = 0
  for (const m of text.matchAll(TAG)) {
    const top = stack[stack.length - 1]
    if (m.index > last) top.kids.push(text.slice(last, m.index))
    last = m.index + m[0].length
    const tag = m[2] as El
    if (!m[1]) {
      const n: Node = { tag, kids: [] }
      top.kids.push(n)
      stack.push(n)
    } else if (stack.length > 1 && top.tag === tag) stack.pop()
    else top.kids.push(m[0])
  }
  if (last < text.length) stack[stack.length - 1].kids.push(text.slice(last))
  const render = (n: Node, key: number): ReactNode => {
    const kids = n.kids.map((k, i) => (typeof k === 'string' ? <Fragment key={i}>{k}</Fragment> : render(k, i)))
    if (!n.tag) return <Fragment key={key}>{kids}</Fragment>
    const T = n.tag
    return <T key={key}>{kids}</T>
  }
  return render(root, 0)
}
