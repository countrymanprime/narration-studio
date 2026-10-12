import { useEffect, useRef, type ComponentProps } from 'react';
import { Heading } from '../../primitives/Heading';
import { BackupsSection } from '../BackupsSection';
import { ManuscriptSection } from '../ManuscriptSection';
import { registerSettingsSection } from '../sections';
import { Settings } from '../Settings';
import { AppearancePanel } from './AppearancePanel';
import { DeliveryProfileField } from './DeliveryProfileField';
import { KeysPanel } from './KeysPanel';

// Backups belongs to the kept DAW category, after the capability list (the SN-M51 audit; SN-M32 left the mount to this page).
registerSettingsSection('Daw', 'backups', BackupsSection, 20);

/**
 * The Studio Next Settings page (SNM-5b): an 860 px column of the mock's panels the repo can back (Delivery profile, Appearance,
 * Keyboard shortcuts, Manuscript), then the old `Settings` mounted unchanged for the categories the mock does not cover. The mock's
 * Recording, Definitions, Reader text, Marks and Story Bible types panels have no host model yet (the audit's finding 2), and the
 * capability, backups and analysis sections mount in the kept DAW and Story Bible categories through `sections.ts`.
 * `initialCategory` (a `#credits`, `#delivery` or `#booth` link) opens that kept category and scrolls to it.
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
      <DeliveryProfileField />
      <AppearancePanel />
      <KeysPanel />
      <ManuscriptSection data={data} go={go} notify={notify} refreshBootstrap={refreshBootstrap} />
      <section ref={kept} aria-label="More settings">
        <Settings {...props} />
      </section>
    </div>
  );
}
