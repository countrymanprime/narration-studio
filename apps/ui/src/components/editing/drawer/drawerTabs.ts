import type { DawCapabilities } from '../../../api/contracts/daw';

/** The Studio Next mock's `STRIP_MIN_WIDTH`: from this window width the strip fits and the timeline is not a drawer tab. */
export const STRIP_MIN_WIDTH = 1360;

export type DrawerTab = 'cleanup' | 'effects' | 'backups' | 'timeline';

/** The tabs in the mock's order, with their labels. */
const DRAWER_TABS: ReadonlyArray<readonly [DrawerTab, string]> = [
  ['cleanup', 'Clean up'],
  ['effects', 'Effects'],
  ['backups', 'Backups'],
  ['timeline', 'Timeline'],
];

/** Whether the DAW keeps backups at all: the capability is there and the narrator has not turned it off. The page never names a DAW. */
export function backupsOffered(caps: DawCapabilities | null): boolean {
  const support = caps?.capabilities['backups'];
  return !!support && support.level !== 'unsupported' && support.reason !== 'turned_off';
}

/** The tabs on offer: Clean up and Effects always, Backups where the DAW has them, Timeline only where the strip does not fit. */
export function tabsFor(backups: boolean, stripFits: boolean): Array<readonly [DrawerTab, string]> {
  return DRAWER_TABS.filter(([k]) => (k !== 'backups' || backups) && (k !== 'timeline' || !stripFits));
}

/** The tab to show: the one asked for if it is on offer, else Clean up (the window widened, or the DAW changed). */
export function resolveTab(want: DrawerTab, offered: ReadonlyArray<readonly [DrawerTab, string]>): DrawerTab {
  return offered.some(([k]) => k === want) ? want : 'cleanup';
}

/** The label a tab wears: its name and its count, except the timeline, which has none. */
export const tabLabel = (tab: DrawerTab, label: string, count: number): string => (tab === 'timeline' ? label : `${label} · ${count}`);
