import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, type Ref, type RefObject, type WheelEvent } from 'react';

/** Page Up and Page Down: move the view by a share of its height, eased. The reading position stays. */
export type BrowseView = { up: (screens: number) => void; down: (screens: number) => void };

type Options = {
  /** The box the text scrolls in, and the text that moves inside it. */
  box: RefObject<HTMLElement | null>;
  text: RefObject<HTMLElement | null>;
  /** The sentence and word being read; the view keeps this word 40% down the box. */
  cur: number;
  wcur: number;
  /** The view has been moved away from the reading position. Set false and the view comes back. */
  browse: boolean;
  onBrowse: (on: boolean) => void;
  viewRef?: Ref<BrowseView>;
};

const LINE_PX = 40;
const REST = 0.4;
/** The gap kept between the word being read and the edge of the box when the box is too short for the word to rest 40% down. */
const EDGE_PX = 8;

/** How far down a box `areaHeight` high the word `wordHeight` high being read rests: 40% down, or higher when the box is too short for it to show whole. */
export function restAt(areaHeight: number, wordHeight: number): number {
  return Math.max(0, Math.min(areaHeight * REST, areaHeight - wordHeight - EDGE_PX));
}

// The wheel moves the view by the pixels it is given, with no easing; the Page keys ease. Neither moves the reading position
// (DQ-17): only a click on a word, a step or a new take does, and that puts the view back on it. The distance from the reading
// position is a pixel count held in a ref, not state: a wheel tick must not re-render the text.
export function useBrowseView({ box, text, cur, wcur, browse, onBrowse, viewRef }: Options) {
  const away = useRef(0);

  const restingY = useCallback((): number | null => {
    const area = box.current;
    const content = text.current;
    const unit = content?.querySelector<HTMLElement>(`[data-unit="${cur}"]`);
    if (!area || !content || !unit) return null;
    const words = unit.querySelectorAll<HTMLElement>('[data-word]');
    const word = words[Math.max(0, Math.min(words.length - 1, wcur))] ?? unit;
    // 40% down the box, unless the box is so short (a small window, a notice above the footer, a large Text size) that the word would run past
    // its bottom: then as high as it needs to be to show whole. The word being read is never under what sits below the text.
    return -(word.offsetTop - restAt(area.clientHeight, word.offsetHeight));
  }, [box, text, cur, wcur]);

  const clampY = useCallback(
    (y: number): number => {
      const area = box.current;
      const content = text.current;
      if (!area || !content) return y;
      return Math.max(-(content.offsetHeight - area.clientHeight * 0.6), Math.min(area.clientHeight * REST, y));
    },
    [box, text],
  );

  const place = useCallback((): void => {
    const content = text.current;
    const rest = restingY();
    if (!content || rest === null) return;
    if (!browse) {
      away.current = 0;
      content.style.transition = '';
    }
    content.style.transform = `translateY(${browse ? clampY(rest + away.current) : rest}px)`;
  }, [text, restingY, clampY, browse]);

  // Whenever the word, the mode or the box changes, the text is put where it belongs.
  useLayoutEffect(place);
  useEffect(() => {
    window.addEventListener('resize', place);
    const observer = typeof ResizeObserver === 'undefined' || !box.current ? null : new ResizeObserver(place);
    if (observer && box.current) observer.observe(box.current);
    return () => {
      window.removeEventListener('resize', place);
      observer?.disconnect();
    };
  }, [place, box]);

  const scrollBy = useCallback(
    (px: number, eased: boolean): void => {
      const content = text.current;
      const rest = restingY();
      if (!content || rest === null || !px) return;
      const y = clampY(rest + away.current - px);
      away.current = y - rest;
      content.style.transition = eased ? '' : 'none';
      content.style.transform = `translateY(${y}px)`;
      onBrowse(Math.abs(away.current) > 1);
    },
    [text, restingY, clampY, onBrowse],
  );

  const height = () => box.current?.clientHeight ?? 0;
  useImperativeHandle(viewRef, () => ({ down: (screens) => scrollBy(screens * height(), true), up: (screens) => scrollBy(-screens * height(), true) }));

  const onWheel = (event: WheelEvent): void => {
    if (!event.deltaY) return;
    // A mouse wheel reports lines or pages in some browsers; the view moves in pixels.
    const px = event.deltaMode === 1 ? event.deltaY * LINE_PX : event.deltaMode === 2 ? event.deltaY * height() : event.deltaY;
    scrollBy(px, false);
  };

  return { onWheel };
}
