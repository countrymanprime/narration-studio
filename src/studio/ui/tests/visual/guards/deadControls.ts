// The browser-side half of deadControls.spec.ts: finding every pressable control and taking a snapshot of the page to compare.
export type FoundControl = {
  index: number;
  key: string;
  name: string;
  role: string;
  disabled: boolean;
  described: boolean;
  /** Pressing it only re-asserts the choice it already shows: a pressed toggle, the checked radio, the current tab or page. */
  current: boolean;
  /** An address that leaves the app, so the result is the browser's. */
  external: boolean;
  /** A skip link: it moves focus to a place on the page. */
  anchor: boolean;
  inShell: boolean;
};

export const CONTROL_SELECTOR =
  'button, [role=button], [role=menuitem], [role=menuitemcheckbox], [role=menuitemradio], [role=switch], [role=checkbox], [role=tab], [role=radio], [role=option], a[href], summary, input[type=checkbox], input[type=radio]';
export const OVERLAY_SELECTOR = '[role=dialog],[role=alertdialog],[role=menu],[role=listbox],[popover]:popover-open';

// Runs in the page. Tags each visible control with data-dead-control so the spec can click it.
export function enumerateControls({
  scope,
  selector,
  skip,
  overlay,
}: {
  scope: string | null;
  selector: string;
  skip: string | null;
  overlay: string;
}): FoundControl[] {
  const root = scope ? [...document.querySelectorAll(scope)].pop() : document.body;
  document.querySelectorAll('[data-dead-control]').forEach((element) => element.removeAttribute('data-dead-control'));
  if (!root) return [];
  const seen = new Map<string, number>();
  const found: FoundControl[] = [];
  const topOverlay = scope ? undefined : [...document.querySelectorAll(overlay)].pop();
  for (const element of root.querySelectorAll<HTMLElement>(selector)) {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (box.width === 0 || box.height === 0 || style.visibility === 'hidden' || style.display === 'none') continue;
    if (element.closest('[inert],[aria-hidden=true]')) continue;
    if (skip && element.closest(skip)) continue;
    if (topOverlay && !topOverlay.contains(element)) continue;
    const name = (element.getAttribute('aria-label') || element.textContent || element.getAttribute('title') || element.tagName)
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 60);
    const role = element.getAttribute('role') || element.tagName.toLowerCase();
    const base = `${role}|${name}`;
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    const index = found.length;
    element.setAttribute('data-dead-control', String(index));
    const labelled = element.getAttribute('aria-describedby');
    const href = element.getAttribute('href') ?? '';
    found.push({
      index,
      key: `${base}#${occurrence}`,
      name,
      role,
      disabled: (element as HTMLButtonElement).disabled === true || element.getAttribute('aria-disabled') === 'true',
      described: Boolean(
        element.getAttribute('title') || element.getAttribute('aria-description') || (labelled && document.getElementById(labelled)?.textContent?.trim()),
      ),
      current:
        ['aria-pressed', 'aria-checked', 'aria-selected', 'aria-current'].some((attribute) =>
          ['true', 'page', 'step', 'location'].includes(element.getAttribute(attribute) ?? ''),
        ) || (element as HTMLInputElement).checked === true,
      external: /^(https?:|mailto:)/.test(href),
      anchor: href.startsWith('#'),
      inShell: Boolean(element.closest('aside, header, nav, [data-shell]')),
    });
  }
  return found;
}

// Runs in the page: the body without the tags the spec adds and the whitespace that does not show.
export function snapshotBody(): string {
  const copy = document.body.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('[data-dead-control]').forEach((element) => element.removeAttribute('data-dead-control'));
  return copy.innerHTML.replace(/\s+/g, ' ');
}
