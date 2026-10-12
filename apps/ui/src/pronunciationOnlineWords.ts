// The Go host's rule for what an online pronunciation lookup may send (pronunciationonline.CheckWord, ADR 0356), for the mock to
// refuse what the host refuses. The host checks again.

/** The word (or short name) a lookup may send, with its spaces tidied; undefined when the host would refuse it. */
export function onlineWord(raw: string): string | undefined {
  const trimmed = raw.replace(/^ +| +$/g, '');
  if (/[^\S ]/u.test(trimmed)) return undefined;
  const parts = trimmed.split(/ +/).filter(Boolean);
  const word = parts.join(' ');
  if (parts.length === 0 || parts.length > 3 || [...word].length > 64) return undefined;
  if (!/^[\p{L}\p{M}\p{Nd} '\u2019.-]+$/u.test(word) || !/\p{L}/u.test(word)) return undefined;
  return word;
}
