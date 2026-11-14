const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

/** The indexes at which a grapheme (a letter with its accents, an emoji sequence) starts or the text ends. */
function boundaries(text: string): Set<number> {
  const at = new Set<number>([text.length]);
  if (!segmenter) return new Set(Array.from({ length: text.length + 1 }, (_, index) => index));
  for (const part of segmenter.segment(text)) at.add(part.index);
  return at;
}

/**
 * What is left in a box once the text it sent is taken out of it, given what the box held when it was sent (`sent`) and what it holds now. Text typed while the save was in
 * flight stays; what was sent does not stay to be sent twice. The sent text is removed only where it is provably the sent text: the box now is the box then with text added
 * before it or after it (a common prefix or suffix, cut on letter boundaries so an accent or an emoji joiner typed next to it is never left alone). A box edited inside the
 * sent text, or with text added on both sides of it, keeps everything: a reply posted twice is recoverable, a narrator's typing cut out of the box is not (#3400, qa-breaker
 * on #3458).
 */
export function withoutSent(now: string, sent: string): string {
  if (now === sent) return '';
  const nowAt = boundaries(now);
  const sentAt = boundaries(sent);
  const limit = Math.min(now.length, sent.length);
  let head = 0;
  while (head < limit && now[head] === sent[head]) head++;
  // Added after the sent text: the box begins with all of it, and what follows starts a new letter.
  if (head === sent.length && nowAt.has(head)) return now.slice(sent.length);
  let tail = 0;
  while (tail < limit && now[now.length - 1 - tail] === sent[sent.length - 1 - tail]) tail++;
  // Added before the sent text: the box ends with all of it, and it starts a new letter.
  return tail === sent.length && nowAt.has(now.length - tail) && sentAt.has(0) ? now.slice(0, now.length - tail) : now;
}
