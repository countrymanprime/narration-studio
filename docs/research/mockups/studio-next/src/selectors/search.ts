import type { BookData } from '@/domain/schemas'

export interface Match { pid: string; s: number; e: number; ch: string }

/** Every place a term appears in the manuscript text. */
export function searchManuscript(b: BookData, q: string): Match[] {
  const t = q.trim().toLowerCase()
  const out: Match[] = []
  if (t.length < 2) return out
  b.paragraphs.forEach((p) => {
    const lo = p.text.toLowerCase()
    let i = 0
    while ((i = lo.indexOf(t, i)) >= 0) {
      out.push({ pid: p.id, s: i, e: i + t.length, ch: p.chapterId })
      i += t.length
    }
  })
  return out
}

/** Text around a match, split so the match can be marked. */
export function snippet(b: BookData, pid: string, s: number, e: number): { pre: string; hit: string; post: string } {
  const t = b.paragraphs.find((p) => p.id === pid)?.text ?? ''
  const a = Math.max(0, s - 30)
  const z = Math.min(t.length, e + 40)
  return { pre: (a > 0 ? '…' : '') + t.slice(a, s), hit: t.slice(s, e), post: t.slice(e, z) + (z < t.length ? '…' : '') }
}
