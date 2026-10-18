import { RecordingCheckSummary } from '../RecordingCheckSummary';
import type { ScopedSettingField } from '../../../types';
import type { PageSetting } from '../registry/pageSettings';
import { useSettingsHost } from '../row/SettingsHost';
import { ScopedFieldsPanel } from './ScopedFieldsPanel';

// Module-level so the panel's field list keeps its identity between reads (ScopedFieldsPanel's contract).
const compareOnly = (field: ScopedSettingField) => field.key !== 'model_size';
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
    case 'cleanup':
      return <ScopedFieldsPanel id="cleanup" title="Silence cleanup" tool="Cleanup" scopes={['global', 'project']} notify={notify} />;
    case 'preview':
      return <ScopedFieldsPanel id="preview" title="Preview suggestion" tool="Preview" scopes={['global', 'project']} notify={notify} />;
    case 'stages':
      return <ScopedFieldsPanel id="stage-suggestions" title="Stage suggestions" tool="StageRecommendations" scopes={['global', 'project']} notify={notify} />;
    case 'compare':
      return (
        <ScopedFieldsPanel id="compare" title="Compare defaults" tool="TranscriptCompare" scopes={['global', 'project']} filter={compareOnly} notify={notify} />
      );
    case 'fx':
      return <ScopedFieldsPanel id="fx" title="Favourite effects" tool="DAW" scopes={['global', 'project']} filter={favouritesOnly} notify={notify} />;
  }
}
