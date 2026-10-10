export const esc = (s: string): string =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

export const reEsc = (x: string): string => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const wordsIn = (t: string): number => (t.match(/\S+/g) || []).length

/** Plain text from a fragment that may carry markup. Repeats until stable so nested tags cannot rebuild one, then drops any stray angle bracket. */
export const stripTags = (s: string): string => {
  let out = String(s)
  for (let prev = ''; prev !== out; ) {
    prev = out
    out = out.replace(/<[^>]*>/g, '')
  }
  return out.replace(/[<>]/g, '')
}
