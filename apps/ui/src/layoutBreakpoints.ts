// The widths the Studio Next mock lays out at, as data (`docs/research/mockups/studio-next/src/app/layout.ts`; ADR 0761
// decision 1). Tailwind cannot read a constant inside a class name, so a page writes the width variants out
// (`min-[1360px]`, `max-[1359px]`, ...) and `layoutQueries.test.ts` scans the source to hold those to this vocabulary. The
// scan, not an import, is the link. `layoutClassFor` and `LAYOUT_QUERIES` are for the places CSS cannot decide.
// Widths are CSS pixels, read from the reported width; the mock's `style.zoom` mechanism is not adopted (ADR 0201: host
// zoom moves a window across a threshold, nothing else does).

/** The rail collapses to icons below this width. */
export const RAIL_COLLAPSE_BELOW = 1360;
/** Editing: the timeline strip fits under the script from this width; below it the timeline is part of the drawer. */
export const STRIP_MIN_WIDTH = 1360;
/** Busy side columns become drawers or stack at this width and below (the one inclusive bound). */
export const MEDIUM_MAX = 1280;
/** Narrow layouts start below this width. */
export const NARROW_BELOW = 1180;
/** Tiny layouts start below this width. */
export const TINY_BELOW = 860;

export interface LayoutClass {
  railCollapsed: boolean;
  medium: boolean;
  narrow: boolean;
  tiny: boolean;
}

/** The layout class of a window `width` CSS pixels wide, as the mock's `useLayout()` computes it. */
export function layoutClassFor(width: number): LayoutClass {
  return { railCollapsed: width < RAIL_COLLAPSE_BELOW, medium: width <= MEDIUM_MAX, narrow: width < NARROW_BELOW, tiny: width < TINY_BELOW };
}

/** The full layout: no class is set. It is the answer where there is no `matchMedia`. */
export const FULL_LAYOUT: LayoutClass = { railCollapsed: false, medium: false, narrow: false, tiny: false };

/** One media query per class, each the complement of the full layout's side of its threshold. */
export const LAYOUT_QUERIES: Readonly<Record<keyof LayoutClass, string>> = {
  railCollapsed: `(max-width: ${RAIL_COLLAPSE_BELOW - 1}px)`,
  medium: `(max-width: ${MEDIUM_MAX}px)`,
  narrow: `(max-width: ${NARROW_BELOW - 1}px)`,
  tiny: `(max-width: ${TINY_BELOW - 1}px)`,
};
