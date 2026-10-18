import { useState } from 'react';
import { Button } from '../../primitives/Button';
import { Disclosure } from '../../primitives/Disclosure';
import { Panel } from '../../primitives/Panel';
import { PAGE_SETTINGS, type PageSetting } from '../registry/pageSettings';
import { PAGE_LABEL, PAGE_PATH } from '../registry/types';
import { useSettingsNav } from '../row/SettingsNav';
import { PageSettingPanel } from './PageSettingPanel';

/**
 * Settings that only change what one page does. Each belongs on that page, next to what it changes; until it has its own control there, the
 * panel that always edited it stays behind its entry, so nothing became unreachable.
 */
export function PageSettingList({ items }: { items: readonly PageSetting[] }) {
  const { go } = useSettingsNav();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <Panel flush>
      {items.map((item) => (
        <div key={item.id} className="border-t border-[var(--border)] px-5 py-4 first:border-t-0" data-page-setting={item.id}>
          <div className="grid gap-x-8 gap-y-1.5 @min-[761px]:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-[3px]">
              <b className="text-[0.9375rem] font-semibold">{item.label}</b>
              <span className="max-w-[60ch] text-[0.8125rem] text-[var(--text-muted)]">{item.why}</span>
              <span className="mt-1.5 text-[0.78rem] text-[var(--text-muted)]">
                {item.panel ? 'Belongs on' : 'Set on'} {PAGE_LABEL[item.page]} › {item.where}
              </span>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <Button
                variant="secondary"
                size="sm"
                aria-label={`Open ${PAGE_LABEL[item.page]}, where ${item.label} ${item.panel ? 'will be' : 'is'} set`}
                onClick={() => go(PAGE_PATH[item.page])}
              >
                Open {PAGE_LABEL[item.page]}
              </Button>
            </div>
          </div>
          {item.panel ? (
            <Disclosure
              title="Change it here for now"
              open={Boolean(open[item.id])}
              onOpenChange={(next) => setOpen((current) => ({ ...current, [item.id]: next }))}
              className="mt-2"
            >
              <div className="pt-2">
                <PageSettingPanel panel={item.panel} />
              </div>
            </Disclosure>
          ) : null}
        </div>
      ))}
    </Panel>
  );
}

export function PagesPane({ lit: _lit }: { lit?: string | null }) {
  return (
    <>
      <div>
        <h2 id="settings-heading" tabIndex={-1} className="font-['Barlow_Condensed',sans-serif] text-[1.875rem] leading-[1.1] font-semibold outline-none">
          Set on a page
        </h2>
        <p className="m-0 max-w-[62ch] text-[0.8125rem] text-[var(--text-muted)]">
          Each of these only changes what one page does, so it belongs on that page, next to what it changes. Until it is there, you can still change it here.
          Search finds them too.
        </p>
      </div>
      <PageSettingList items={PAGE_SETTINGS} />
    </>
  );
}
