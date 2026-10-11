/** Ids as a DAW writes them: stable for the same thing, never derived from where it sits in time. `rev` changes when the DAW re-creates it. */
export function guidOf(kind: string, id: string, rev = 0): string {
  let h1 = 0x811c9dc5, h2 = 0x1b873593
  const s = kind + '/' + id + '/' + rev
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619) >>> 0
    h2 = Math.imul(h2 + s.charCodeAt(i), 2246822519) >>> 0
  }
  const hex = (n: number, w: number): string => n.toString(16).padStart(w, '0').slice(-w)
  const a = hex(h1, 8), b = hex(h2, 8), c = hex(h1 ^ h2, 8), d = hex(Math.imul(h1, h2) >>> 0, 8)
  return '{' + (a + '-' + b.slice(0, 4) + '-' + b.slice(4) + '-' + c.slice(0, 4) + '-' + c.slice(4) + d).toUpperCase() + '}'
}

