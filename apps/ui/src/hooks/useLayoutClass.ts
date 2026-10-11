import { FULL_LAYOUT, LAYOUT_QUERIES, type LayoutClass } from '../layoutBreakpoints';
import { useMediaQuery } from './useMediaQuery';

// The layout class of the window, for the places CSS cannot decide (ADR 0761 decision 1). It follows the media queries in
// `LAYOUT_QUERIES`, so it reads the CSS width and re-renders when the window crosses a threshold. Where there is no
// `matchMedia` (jsdom) it is the full layout.
export function useLayoutClass(): LayoutClass {
  const railCollapsed = useMediaQuery(LAYOUT_QUERIES.railCollapsed, FULL_LAYOUT.railCollapsed);
  const medium = useMediaQuery(LAYOUT_QUERIES.medium, FULL_LAYOUT.medium);
  const narrow = useMediaQuery(LAYOUT_QUERIES.narrow, FULL_LAYOUT.narrow);
  const tiny = useMediaQuery(LAYOUT_QUERIES.tiny, FULL_LAYOUT.tiny);
  return { railCollapsed, medium, narrow, tiny };
}
