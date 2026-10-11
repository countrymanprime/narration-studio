import type { ReactNode } from 'react';
import { IconButton } from '../../primitives/IconButton';
import { Tab, TabList, TabPanel, Tabs } from '../../primitives/Tabs';
import type { ChapterDoc, FlagKind } from '../model';
import { TimelineStrip, type TimelineStripProps } from '../strip/TimelineStrip';
import { drawSections } from './drawerSections';
import { tabLabel, type DrawerTab } from './drawerTabs';
import { FoundList } from './FoundList';

export interface DrawerProps {
  doc: ChapterDoc;
  chapterId: string;
  /** The tab shown, already resolved against `tabs`. */
  tab: DrawerTab;
  /** The tabs on offer with their labels. */
  tabs: ReadonlyArray<readonly [DrawerTab, string]>;
  /** The count each tab wears; Clean up defaults to what the Found list counts. */
  counts?: Partial<Record<DrawerTab, number>>;
  onTab: (tab: DrawerTab) => void;
  onClose: () => void;
  /** The kind the text is stepping through, or null. */
  flagKind: FlagKind | null;
  /** Sets the flag kind and jumps to the first word of it. */
  onReview: (kind: FlagKind) => void;
  /** What the Timeline tab hands the strip. */
  strip: TimelineStripProps;
}

const foundTotal = (doc: ChapterDoc): number => doc.counts.extra + doc.counts.miss + doc.counts.mis + doc.counts.low;

/** The clean-up and effects drawer: tabs by capability, each tab a panel of the sections that registered for it. */
export function Drawer({ doc, chapterId, tab, tabs, counts = {}, onTab, onClose, flagKind, onReview, strip }: DrawerProps) {
  const count = (k: DrawerTab): number => counts[k] ?? (k === 'cleanup' ? foundTotal(doc) : 0);
  const sections = drawSections(tab, { doc, chapterId });
  let body: ReactNode;
  if (tab === 'timeline') {
    body = <TimelineStrip {...strip} />;
  } else {
    body = (
      <>
        {tab === 'cleanup' ? <FoundList doc={doc} activeKind={flagKind} onReview={onReview} /> : null}
        {sections.map(({ section, node }, i) => (
          <section key={`${section.order}-${i}`} aria-label={section.label} className="border-b border-[var(--border)] p-3">
            {node}
          </section>
        ))}
      </>
    );
  }
  return (
    <aside
      id="drawer"
      aria-label="Clean up and effects"
      className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)]"
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <h2 className="m-0 flex-1 font-['Barlow_Condensed',sans-serif] text-xl font-semibold">Clean up and effects</h2>
        <IconButton action="close" id="drawerclose" onClick={onClose} />
      </div>
      <Tabs value={tab} onChange={(next) => onTab(next as DrawerTab)} className="flex min-h-0 flex-1 flex-col">
        <TabList label="Drawer" activation="automatic">
          {tabs.map(([k, label]) => (
            <Tab key={k} value={k}>
              {tabLabel(k, label, count(k))}
            </Tab>
          ))}
        </TabList>
        <TabPanel value={tab} className="min-h-0 flex-1 overflow-y-auto">
          {body}
        </TabPanel>
      </Tabs>
    </aside>
  );
}
