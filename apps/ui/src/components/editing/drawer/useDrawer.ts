import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { usePort } from '../../../ports/usePort';
import type { DawCapabilities } from '../../../api/contracts/daw';
import { backupsOffered, resolveTab, STRIP_MIN_WIDTH, tabsFor, type DrawerTab } from './drawerTabs';

/** The width of the window, as the mock's `layout.width` reads it (`documentElement`), not of the page beside the rail; 0 before the first read. */
export function useWindowWidth(): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const measure = (): void => setWidth(document.documentElement.getBoundingClientRect().width);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  return width;
}

/** Whether the strip fits: the window is `STRIP_MIN_WIDTH` or wider. */
export function useStripFits(): boolean {
  return useWindowWidth() >= STRIP_MIN_WIDTH;
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
