import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import type { ScriptPlayback } from '../bar/useScriptPlayback';
import { useEditingPage } from '../script/EditingPageState';
import { playable, playingKey } from '../script/playing';

/** The script's scrolling box inside the page. */
const scriptOf = (root: HTMLElement | null): HTMLElement | null => root?.querySelector<HTMLElement>('[data-script]') ?? null;

/**
 * Keeps the lit word in sight while the text follows the voice, whichever player lit it, as the Studio Next mock does: when the word leaves the
 * upper part of the script it scrolls to a third of the way down. A hand scroll while something plays (the wheel, a touch, Page Up or Down)
 * turns following off until the next play.
 */
export function useFollowScroll(root: RefObject<HTMLElement | null>, playback: Pick<ScriptPlayback, 'follow' | 'setFollow'>): void {
  const { doc, state } = useEditingPage();
  const words = useMemo(() => playable(doc), [doc]);
  const nowKey = playingKey(words, state.playT);
  const { follow, setFollow } = playback;
  const live = useRef({ playing: false, setFollow });
  useEffect(() => {
    live.current = { playing: state.playT != null, setFollow };
  });

  useLayoutEffect(() => {
    const box = scriptOf(root.current);
    if (!box || !nowKey || !follow) return;
    const el = box.querySelector<HTMLElement>(`[data-k="${CSS.escape(nowKey)}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    if (r.top < b.top + b.height * 0.12 || r.bottom > b.top + b.height * 0.7) box.scrollTop += r.top - b.top - b.height * 0.3;
  }, [root, nowKey, follow]);

  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const inScript = (e: Event): boolean => e.target instanceof Element && !!e.target.closest('[data-script]');
    const byHand = (e: Event): void => {
      if (!inScript(e) || !live.current.playing) return;
      if (e instanceof KeyboardEvent && e.key !== 'PageUp' && e.key !== 'PageDown') return;
      live.current.setFollow(false);
    };
    const kinds = ['wheel', 'touchmove', 'keydown'] as const;
    for (const k of kinds) node.addEventListener(k, byHand, { passive: true });
    return () => {
      for (const k of kinds) node.removeEventListener(k, byHand);
    };
  }, [root]);
}
