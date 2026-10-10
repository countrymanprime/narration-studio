export const esc = (s: string): string =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

export const reEsc = (x: string): string => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const wordsIn = (t: string): number => (t.match(/\S+/g) || []).length

export const stripTags = (s: string): string => s.replace(/<[^>]+>/g, '')
