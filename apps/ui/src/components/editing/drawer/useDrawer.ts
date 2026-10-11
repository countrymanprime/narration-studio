import { useCallback, useEffect, useState, type RefObject } from 'react';
import { usePort } from '../../../ports/usePort';
import type { DawCapabilities } from '../../../api/contracts/daw';
import { backupsOffered, resolveTab, STRIP_MIN_WIDTH, tabsFor, type DrawerTab } from './drawerTabs';

/** Whether the strip fits: the width of `root` (the page root) against `STRIP_MIN_WIDTH`. Without a ResizeObserver it reads the width once. */
export function useStripFits(root: RefObject<HTMLElement | null>): boolean {
  const [fits, setFits] = useState(false);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = (width: number): void => setFits(width >= STRIP_MIN_WIDTH);
    measure(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => measure(entries[0]?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, [root]);
  return fits;
}

/** Whether the DAW offers backups, from `DawClient.capabilities`; false while it is being asked or if it cannot answer. */
export function useBackupsOffered(): boolean {
  const daw = usePort('daw');
  const [caps, setCaps] = useState<DawCapabilities | null>(null);
  useEffect(() => {
    let live = true;
    daw.capabilities().then(
      (c) => live && setCaps(c),
      () => live && setCaps(null),
    );
    return () => {
      live = false;
    };
  }, [daw]);
  return backupsOffered(caps);
}

/**
 * The drawer's page state: whether it is open and the tab last asked for. The tab shown is that one if it is still on offer, else Clean up; the
 * asked-for tab is kept, so a window that narrows again gives the timeline back.
 */
export function useDrawerState(stripFits: boolean, backups: boolean) {
  const [open, setOpen] = useState(false);
  const [want, setWant] = useState<DrawerTab>('cleanup');
  const offered = tabsFor(backups, stripFits);
  const tab = resolveTab(want, offered);
  const openTab = useCallback((t: DrawerTab) => {
    setWant(t);
    setOpen(true);
  }, []);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  const close = useCallback(() => setOpen(false), []);
  return { open, tab, offered, setTab: setWant, openTab, toggle, close };
}
