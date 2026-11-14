/**
 * What is left in a box after the text it sent is taken out of it: text typed while a save was in flight stays, wherever it went (at the end, the start or the middle), and
 * what was sent is not left in the box to be sent twice. When the sent text is no longer there as typed, nothing is removed (#3400, qa-breaker on #3458).
 */
export function withoutSent(now: string, sent: string): string {
  if (now === sent) return '';
  const at = now.indexOf(sent);
  return at < 0 ? now : now.slice(0, at) + now.slice(at + sent.length);
}
