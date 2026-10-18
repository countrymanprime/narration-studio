/**
 * Whether motion should stop: Windows asked for reduced motion, or `<html data-motion="reduce">` is set. The same two
 * conditions turn off every `motion-ok:` utility (styles.css), so code that moves things itself must ask this.
 */
export function reducedMotion(): boolean {
  if (document.documentElement.dataset.motion === 'reduce') return true;
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
