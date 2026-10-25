import { useState } from 'react';
import { Button } from '../../primitives/Button';
import { Disclosure } from '../../primitives/Disclosure';
import { Panel } from '../../primitives/Panel';
import { PAGE_SETTINGS, type PageSetting } from '../registry/pageSettings';
import { PAGE_LABEL, PAGE_PATH } from '../registry/types';
import { useSettingsNav } from '../row/SettingsNav';
import { PageSettingPanel } from './PageSettingPanel';
import { PaneTitle } from './PaneTitle';

/**
 * Settings that only change what one page does. Each belongs on that page, next to what it changes, but Settings always keeps its
 * panel behind the entry: a page's own control is a shortcut to the same keys, never a replacement.
 */
export function PageSettingList({ items }: { items: readonly PageSetting[] }) {
  const { go } = useSettingsNav();
  const [open, setOpen] = useState<Record<string, boolean>>({});
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
            onOpenChange={(next) => setOpen((current) => ({ ...current, [item.id]: next }))}
            className="mt-2"
            aside={
              <Button
                variant="secondary"
                size="sm"
                className="min-w-[9.5rem] flex-none"
                aria-label={`Open ${PAGE_LABEL[item.page]}, where ${item.label} belongs`}
                onClick={() => go(PAGE_PATH[item.page])}
              >
                Open {PAGE_LABEL[item.page]}
              </Button>
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
