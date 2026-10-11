import { useEffect, useRef } from 'react';
import { registerCommandProvider } from '../../../input/commandProviders';
import type { DrawerTab } from './drawerTabs';

/**
 * "Editing: Clean up", "Editing: Effects" and "Editing: Backups" in the jump menu, each opening the drawer on that tab. The timeline is not a
 * command (the S key shows it), and a tab the DAW does not offer is not listed. The provider reads the latest tabs each time the menu opens.
 */
export function useDrawerCommands(offered: ReadonlyArray<readonly [DrawerTab, string]>, openTab: (tab: DrawerTab) => void): void {
  const latest = useRef({ offered, openTab });
  latest.current = { offered, openTab };
  useEffect(
    () =>
      registerCommandProvider(() =>
        latest.current.offered
          .filter(([k]) => k !== 'timeline')
          .map(([k, label]) => ({ id: `editing.drawer.${k}`, group: 'Editing', label: `Editing: ${label}`, run: () => latest.current.openTab(k) })),
      ),
    [],
  );
}
