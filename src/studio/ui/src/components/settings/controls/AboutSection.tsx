import { brand } from '../../../brand.gen';
import { Panel } from '../../primitives/Panel';
import { SectionLabel } from '../../primitives/SectionLabel';
import { AboutPanel } from '../AboutPanel';
import { UpdatesPanel } from '../UpdatesPanel';
import { useSettingsStore } from '../data/SettingsStore';
import { computerValue } from '../data/values';
import { rowOf } from '../registry/rows';
import { useSettingsHost } from '../row/SettingsHost';
import { ABOUT_ROW } from './aboutRow';

const CHANNEL = rowOf('app.channel')!;

/**
 * The version, and the update check, under App & updates: what is running, whether a newer release exists on the channel set above, and the
 * download and install steps, as two rows under their own section label. The update panel is keyed on the channel, so it asks the host
 * again when the channel row changes.
 */
export function AboutSection() {
  const { data } = useSettingsHost();
  const store = useSettingsStore();
  const channel = computerValue(CHANNEL, store.fieldsOf(CHANNEL).global);
  return (
    <section aria-label="This version" className="flex flex-col">
      <SectionLabel as="h3" className="mb-1.5">
        This version
      </SectionLabel>
      <Panel flush>
        <div className={ABOUT_ROW} data-about="version">
          <div className="flex min-w-0 flex-col gap-[3px]">
            <b className="text-[0.9375rem] font-semibold">{brand.name}</b>
            <span className="max-w-[60ch] text-[0.8125rem] text-[var(--text-muted)]">
              The app is free software, licensed under the GNU Affero General Public License, version 3 or later.
            </span>
          </div>
          <AboutPanel version={data.version} />
        </div>
        <div className={ABOUT_ROW} data-about="updates">
          <div className="flex min-w-0 flex-col gap-[3px]">
            <b className="text-[0.9375rem] font-semibold">Updates</b>
            <span className="max-w-[60ch] text-[0.8125rem] text-[var(--text-muted)]">Newer releases on the update channel you chose.</span>
          </div>
          <UpdatesPanel key={channel} />
        </div>
      </Panel>
    </section>
  );
}
