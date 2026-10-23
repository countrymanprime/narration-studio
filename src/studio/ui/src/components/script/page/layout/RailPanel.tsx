// The Script page's side panel (the mock's `pages/script/Rail.tsx`): the tabs Words, Story Bible, Notes, Queries and Bookmarks (an icon
// tab), and the selected tab's body. Left and Right move along the tabs and select as they go, wrapping at the ends. The tab is the page's
// view state, so a lookup elsewhere on the page can switch it. Where the panel is a drawer its header shows, with a close button.

import type { ReactNode } from 'react';
import { Icon } from '../../../primitives/Icon';
import { PANEL_FRAME_CLASS } from '../../../primitives/panelStyles';
import { IconButton } from '../../../primitives/IconButton';
import { Tab, TabList, TabPanel, Tabs } from '../../../primitives/Tabs';
import type { ScriptViewState } from '../data/scriptView';
import { useScriptView } from '../data/useScriptData';

export type RailTab = ScriptViewState['tab'];

const RAIL_TABS: ReadonlyArray<readonly [RailTab, string]> = [
  ['pron', 'Words'],
  ['bible', 'Story Bible'],
  ['marks', 'Notes'],
  ['queries', 'Queries'],
  ['bookmarks', 'Bookmarks'],
];

export const RAIL_LABEL = 'Words, Story Bible and marks';

export function RailPanel({ body, onClose }: { body: (tab: RailTab) => ReactNode; onClose: () => void }) {
  const [tab, update] = useScriptView((state) => state.tab);
  return (
    <section aria-label={RAIL_LABEL} className={`flex min-h-0 flex-1 flex-col overflow-hidden ${PANEL_FRAME_CLASS}`}>
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2 min-[1281px]:hidden">
        <span className="text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">Lookups and marks</span>
        <span className="flex-1" />
        <IconButton action="close" label="Close" size="sm" onClick={onClose} />
      </div>
      <Tabs value={tab} onChange={(next) => update({ tab: next as RailTab })} className="flex min-h-0 flex-1 flex-col">
        <TabList label={RAIL_LABEL} activation="automatic" className="flex-none px-1">
          {RAIL_TABS.map(([key, label]) => (
            <Tab key={key} value={key}>
              {key === 'bookmarks' ? (
                <span data-tab={key} className="inline-flex items-center">
                  <Icon name="bookmarks" />
                  <span className="sr-only">{label}</span>
                </span>
              ) : (
                <span data-tab={key}>{label}</span>
              )}
            </Tab>
          ))}
        </TabList>
        <TabPanel value={tab} className="min-h-0 flex-1 overflow-y-auto p-3">
          <div id="railbody">{body(tab)}</div>
        </TabPanel>
      </Tabs>
    </section>
  );
}
