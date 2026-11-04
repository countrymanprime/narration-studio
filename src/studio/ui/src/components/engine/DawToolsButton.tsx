import { useState } from 'react';
import { DawToolsMenu } from './DawToolsMenu';
import type { DawToolGroup } from './dawTools';
import { useDawToolsSource } from './useDawToolsSource';

/**
 * The DAW tools icon button of a page header: `DawToolsMenu` as a menu, fed by the page's own read of the project (`useDawToolsSource`). A page
 * names the groups it offers (Editing, Proof and Master offer `structure`) and nothing else; the entries, their reasons and their dialogs are the registry's.
 */
export function DawToolsButton({ groups }: { groups: readonly DawToolGroup[] }) {
  // Nothing is read for the menu until it is first opened, so a page that never opens it makes no host call for it.
  const [wanted, setWanted] = useState(false);
  const source = useDawToolsSource(wanted);
  return (
    <DawToolsMenu
      label="DAW tools"
      layout="menu"
      groups={groups}
      links={source.links}
      forAudacity={source.forAudacity}
      dawOff={source.dawOff}
      linkedChapterCount={source.linkedChapterCount}
      onOpen={() => setWanted(true)}
    />
  );
}
