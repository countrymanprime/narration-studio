import { useState } from 'react';
import { IconButton } from '../../primitives/IconButton';
import type { IconName } from '../../../icons.catalog';
import { Disclosure } from '../../primitives/Disclosure';
import { Panel } from '../../primitives/Panel';
import { PAGE_SETTINGS, type PageSetting } from '../registry/pageSettings';
import { PAGE_LABEL, PAGE_PATH, type UsedPage } from '../registry/types';

// The rail's own icon for each page a setting is read on, so the button that opens it wears that page's icon and nothing else's.
const PAGE_ACTION: Record<UsedPage, IconName> = {
  production: 'home',
  schedule: 'calendar',
  script: 'script',
  bible: 'book',
  booth: 'microphone',
  editing: 'scissors',
  proof: 'wave',
  pickups: 'pickups',
  master: 'gauge',
  delivery: 'delivery',
};
import { useSettingsNav } from '../row/SettingsNav';
import { useHasProject } from '../row/SettingsHost';
import { PageSettingPanel } from './PageSettingPanel';
import { PaneTitle } from './PaneTitle';

/**
 * Settings that only change what one page does. Each belongs on that page, next to what it changes, but Settings always keeps its
 * panel behind the entry: a page's own control is a shortcut to the same keys, never a replacement.
 */
export function PageSettingList({ items }: { items: readonly PageSetting[] }) {
  const { go } = useSettingsNav();
  const hasProject = useHasProject();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // A panel that was opened stays in the page when it is closed, so an edit not yet saved is not dropped; one never opened is not read at all.
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  return (
    <Panel flush>
      {items.map((item) => (
        <div key={item.id} className="border-t border-[var(--border)] px-5 py-4 first:border-t-0" data-page-setting={item.id}>
          <div className="flex min-w-0 flex-col gap-[3px]">
            <b className="text-[0.9375rem] font-semibold">{item.label}</b>
            <span className="max-w-[60ch] text-[0.8125rem] text-[var(--text-muted)]">{item.why}</span>
            <span className="mt-1.5 text-[0.78rem] text-[var(--text-muted)]">
              Belongs on {PAGE_LABEL[item.page]} › {item.where}
            </span>
          </div>
          {/* The two things to do with the setting share one line: change it here, or Open the page it belongs on, the button at the right
              and one width for every page (alignment audit XSE2-21). */}
          <Disclosure
            title="Change it here for now"
            open={Boolean(open[item.id])}
            keepMounted={Boolean(opened[item.id])}
            onOpenChange={(next) => {
              setOpen((current) => ({ ...current, [item.id]: next }));
              if (next) setOpened((current) => ({ ...current, [item.id]: true }));
            }}
            className="mt-2"
            aside={
              <IconButton
                action={PAGE_ACTION[item.page]}
                size="sm"
                label={`Open ${PAGE_LABEL[item.page]}, where ${item.label} belongs`}
                disabledReason={hasProject ? undefined : 'Open a project to go to its pages'}
                onClick={() => go(PAGE_PATH[item.page])}
              />
            }
          >
            <div className="pt-2">
              <PageSettingPanel panel={item.panel} />
            </div>
          </Disclosure>
        </div>
      ))}
    </Panel>
  );
}

export function PagesPane({ lit: _lit }: { lit?: string | null }) {
  return (
    <>
      <PaneTitle
        title="Set on a page"
        blurb="Each of these only changes what one page does, so it belongs on that page, next to what it changes. Settings keeps every one of them: you can change it here, and a page may offer a shortcut to the same setting. Search finds them too."
      />
      <PageSettingList items={PAGE_SETTINGS} />
    </>
  );
}
