import { useEffect, useRef, type ComponentProps } from 'react';
import { Heading } from '../../primitives/Heading';
import { BackupsSection } from '../BackupsSection';
import { ManuscriptSection } from '../ManuscriptSection';
import { registerSettingsSection } from '../sections';
import { Settings } from '../Settings';
import { AppearancePanel } from './AppearancePanel';
import { DeliveryProfileField } from './DeliveryProfileField';
import { KeysPanel } from './KeysPanel';
import { RecordingPanel } from './RecordingPanel';
import { StoryBibleTypesPanel } from './StoryBibleTypesPanel';

// Backups belongs to the kept DAW category, after the capability list.
registerSettingsSection('Daw', 'backups', BackupsSection, 20);

/**
 * The Studio Next Settings page, at `/settings`: an 860 px column of the mock's panels the repo can back (Recording, Delivery profile, Story
 * Bible types, Appearance, Keyboard shortcuts, Manuscript), then `Settings` trimmed to the categories the mock does not cover. The
 * mock's Definitions, Reader text and Marks panels have no host model yet, and the capability, backups and analysis
 * sections mount in the kept DAW and Story Bible categories through `sections.ts`. `initialCategory` (a `#credits`, `#delivery`,
 * `#cleanup` or `#booth` link) opens that kept category and scrolls to it.
 */
export function SettingsPage(props: ComponentProps<typeof Settings>) {
  const { data, go, notify, refreshBootstrap, initialCategory } = props;
  const kept = useRef<HTMLElement>(null);

  useEffect(() => {
    if (initialCategory) kept.current?.scrollIntoView?.({ block: 'start' });
  }, [initialCategory]);

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-4">
      <Heading title="Settings" />
      <RecordingPanel />
      <DeliveryProfileField />
      <StoryBibleTypesPanel />
      <AppearancePanel />
      <KeysPanel />
      <ManuscriptSection data={data} go={go} notify={notify} refreshBootstrap={refreshBootstrap} />
      <section ref={kept} aria-label="More settings">
        <Settings {...props} />
      </section>
    </div>
  );
}
