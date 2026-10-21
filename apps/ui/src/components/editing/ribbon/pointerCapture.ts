/** Keeps a drag on `el` when the pointer leaves it. A window that cannot capture a pointer (a test environment) simply does not. */
export function capturePointer(el: Element, pointerId: number): void {
  if (typeof el.setPointerCapture === 'function') el.setPointerCapture(pointerId);
}

/** Lets the pointer go again, when `el` holds it. */
export function releasePointer(el: Element, pointerId: number): void {
  if (typeof el.hasPointerCapture === 'function' && el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
}
