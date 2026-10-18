import { RecordingCheckSummary } from '../RecordingCheckSummary';
import type { ScopedSettingField } from '../../../types';
import type { PageSetting } from '../registry/pageSettings';
import { useSettingsHost } from '../row/SettingsHost';
import { ScopedFieldsPanel } from './ScopedFieldsPanel';

// Module-level so the panel's field list keeps its identity between reads (ScopedFieldsPanel's contract).
const favouritesOnly = (field: ScopedSettingField) => field.key === 'fx_favourites';

/** The panel that always edited a setting now listed under Set on a page, kept as built until its page has the control. */
export function PageSettingPanel({ panel }: { panel: NonNullable<PageSetting['panel']> }) {
  const { notify } = useSettingsHost();
  switch (panel) {
    case 'coverage':
      return (
        <ScopedFieldsPanel
          id="recording-check"
          title="Recording check"
          tool="RecordingCoverage"
          scopes={['global', 'project']}
          notify={notify}
          before={({ fields, scope }) => <RecordingCheckSummary fields={fields} scope={scope} />}
        />
      );
    case 'fx':
      return <ScopedFieldsPanel id="fx" title="Favourite effects" tool="DAW" scopes={['global', 'project']} filter={favouritesOnly} notify={notify} />;
  }
}
