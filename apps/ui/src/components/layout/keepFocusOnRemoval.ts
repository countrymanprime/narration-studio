/**
 * A `ref` for a control that can be removed while it has focus: a Retry whose error line goes away as the read starts or succeeds. React
 * runs the returned cleanup as the control unmounts, while it is still in the page, so a control that still has focus hands it to the
 * dialog or page it sits in (`<main>` is the shell's focusable landmark) instead of letting it fall to the document body. A control
 * that stays (a Retry whose read failed again) keeps focus, which is why this is not done at click time.
 */
export function keepFocusOnRemoval(node: HTMLElement | null): (() => void) | undefined {
  if (!node) return undefined;
  return () => {
    if (document.activeElement !== node) return;
    node.closest<HTMLElement>('[role="dialog"], main')?.focus({ preventScroll: true });
  };
}
