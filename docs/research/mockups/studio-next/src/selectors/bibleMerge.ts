import type { BibleEntry, Relationship } from '@/domain/schemas'

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

const sameName = (x: string, y: string): boolean => x.toLowerCase() === y.toLowerCase()

/** The entry with another entry's names, notes and review flags added to it. Its own values win; empty fields are filled from the other. */
export function mergedEntry(into: BibleEntry, from: BibleEntry): BibleEntry {
  const out: BibleEntry = clone(into)
  from.aka.forEach((a) => {
    if (out.aka.some((x) => sameName(x, a))) return
    out.aka.push(a)
    const say = from.sayA?.[a] ?? (a === from.aka[0] ? from.say : '')
    if (say) {
      out.sayA = { ...(out.sayA ?? {}), [a]: say }
      const src = from.saySrc?.[a]
      if (src) out.saySrc = { ...(out.saySrc ?? {}), [a]: src }
    }
  })
  ;(['sum', 'voice', 'acts', 'knows'] as const).forEach((f) => { if (!out[f] && from[f]) out[f] = from[f] })
  if (!out.say && from.say) out.say = from.say
  if (!out.colour && from.colour) out.colour = from.colour
  if (from.review) {
    const aliases = [...new Set([...(out.review?.aliases ?? []), ...from.review.aliases])].filter((a) => out.aka.includes(a))
    out.review = { entry: !!(out.review?.entry || from.review.entry), aliases }
  }
  return out
}
/** Relationships of the merged entry: those of both, pointing at `into`; none that would relate it to itself; no duplicates. */
export function repointed(rels: Relationship[], from: string, into: string): Relationship[] {
  const seen = new Set<string>()
  return rels
    .map((r) => ({ ...r, a: r.a === from ? into : r.a, b: r.b === from ? into : r.b }))
    .filter((r) => {
      if (r.a === r.b) return false
      const k = r.a + '|' + r.rel.toLowerCase() + '|' + r.b
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
}

