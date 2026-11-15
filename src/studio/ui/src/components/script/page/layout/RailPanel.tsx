// The Script page's side panel (the mock's `pages/script/Rail.tsx`): the tabs Words, Story Bible and Notes, and the selected tab's body.
// Left and Right move the focus along the tabs, wrapping at the ends, and Enter or Space select (a tab can ask to keep a typed reply or pronunciation, and a tab
// that selects as the focus moves would ask again when the question hands the focus back). The tab is the page's
// view state, so a lookup elsewhere on the page can switch it. Where the panel is a drawer its header shows, with a close button.

import type { ReactNode } from 'react';
import { useGuardedAction } from '../../../../studio/drafts/unsavedDrafts';
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
];

export const RAIL_LABEL = 'Words, Story Bible and marks';

export function RailPanel({ body, onClose }: { body: (tab: RailTab) => ReactNode; onClose: () => void }) {
  const [tab, update] = useScriptView((state) => state.tab);
  // Another tab unmounts the panel that holds a typed reply or pronunciation, so it asks first (#3404).
  const guarded = useGuardedAction();
  return (
    <section aria-label={RAIL_LABEL} className={`flex min-h-0 flex-1 flex-col overflow-hidden ${PANEL_FRAME_CLASS}`}>
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2 min-[1281px]:hidden">
        <span className="text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">Lookups and marks</span>
        <span className="flex-1" />
        <IconButton action="close" label="Close" size="sm" onClick={onClose} />
      </div>
      <Tabs value={tab} onChange={(next) => next !== tab && guarded(() => update({ tab: next as RailTab }))} className="flex min-h-0 flex-1 flex-col">
        {/* Beside the reader (above 1280 px) the strip is the reader header's 65 px, so the two rules are one line (XSC-11). */}
        <TabList label={RAIL_LABEL} className="flex-none px-1 min-[1281px]:min-h-[4.0625rem]">
          {RAIL_TABS.map(([key, label]) => (
            <Tab key={key} value={key}>
              <span data-tab={key}>{label}</span>
            </Tab>
          ))}
        </TabList>
        {/* A Panel's 16 px inset, named as `--panel-pad`, so a flush table runs to the edges with its text on the labels' x. */}
        <TabPanel value={tab} className="min-h-0 flex-1 overflow-y-auto p-4 [--panel-pad:1rem]">
          <div id="railbody">{body(tab)}</div>
        </TabPanel>
      </Tabs>
    </section>
  );
}
