/** Word by word comparison of what was said against a script. */
export interface WordPart { w: string; k: 'same' | 'del' | 'ins' }
export const key = (t: string): string => t.toLowerCase().replace(/[^\p{L}\p{N}’']/gu, '').replace(/'/g, '’')
/** Words, each with the dash that follows it. A lone quotation mark or dash belongs to the word before it. */
export const tokens = (s: string): string[] => {
  const out: string[] = []
  ;(s.match(/[^\s—]+—?|—/gu) ?? []).forEach((t) => {
    if (key(t) === '' && out.length) out[out.length - 1] += t
    else out.push(t)
  })
  return out
}

/**
 * Word by word, what the take said against the script. `same` words were read as written, `del` words are in the script but were
 * not said, `ins` words were said but are not in the script.
 */
export function diffWords(script: string, heard: string): WordPart[] {
  const a = tokens(script)
  const c = tokens(heard)
  const ka = a.map(key)
  const kc = c.map(key)
  const L: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(c.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) for (let j = c.length - 1; j >= 0; j--) L[i][j] = ka[i] === kc[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  const out: WordPart[] = []
  let i = 0
  let j = 0
  while (i < a.length || j < c.length) {
    if (i < a.length && j < c.length && ka[i] === kc[j]) { out.push({ w: c[j], k: 'same' }); i++; j++ }
    else if (j < c.length && (i >= a.length || L[i][j + 1] >= L[i + 1][j])) { out.push({ w: c[j], k: 'ins' }); j++ }
    else { out.push({ w: a[i], k: 'del' }); i++ }
  }
  return out
}

