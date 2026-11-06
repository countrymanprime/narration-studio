import type { ReactElement } from 'react';
import { BackupsSection } from '../BackupsSection';
import { RecordingCheckSummary } from '../RecordingCheckSummary';
import type { ScopedSettingField } from '../../../types';
import type { PageSetting } from '../registry/pageSettings';
import { useHasProject, useSettingsHost } from '../row/SettingsHost';
import { NEEDS_PROJECT_REASON, NEEDS_PROJECT_FOR_PROJECT } from '../registry/projectNeeds';
import { ScopedFieldsPanel } from './ScopedFieldsPanel';

// Module-level so the panel's field list keeps its identity between reads (ScopedFieldsPanel's contract).
const compareOnly = (field: ScopedSettingField) => field.key !== 'model_size';
const punchOnly = (field: ScopedSettingField) => field.key === 'punch_preroll_seconds';
const favouritesOnly = (field: ScopedSettingField) => field.key === 'fx_favourites';

/** The panel that always edited a setting now listed under Set on a page, kept as built until its page has the control. */
export function PageSettingPanel({ panel }: { panel: PageSetting['panel'] }) {
  const { notify } = useSettingsHost();
  const hasProject = useHasProject();
  // With no project open a panel edits the computer's values only, and says what waits for a project; Audacity's backups are the project's alone.
  const both = hasProject ? (['global', 'project'] as const) : (['global'] as const);
  const waiting = hasProject ? null : <p className="m-0 mt-2 text-[0.8125rem] text-[var(--text-muted)]">{NEEDS_PROJECT_FOR_PROJECT}</p>;
  const only = (element: ReactElement) => (
    <>
      {element}
      {waiting}
    </>
  );
  switch (panel) {
    case 'coverage':
      return only(
        <ScopedFieldsPanel
          id="recording-check"
          title="Recording check"
          tool="RecordingCoverage"
          scopes={both}
          notify={notify}
          before={({ fields, scope }) => <RecordingCheckSummary fields={fields} scope={scope} />}
        />,
      );
    case 'cleanup':
      return only(<ScopedFieldsPanel id="cleanup" title="Silence cleanup" tool="Cleanup" scopes={both} notify={notify} />);
    case 'preview':
      return only(<ScopedFieldsPanel id="preview" title="Preview suggestion" tool="Preview" scopes={both} notify={notify} />);
    case 'stages':
      return only(<ScopedFieldsPanel id="stage-suggestions" title="Stage suggestions" tool="StageRecommendations" scopes={both} notify={notify} />);
    case 'compare':
      return only(<ScopedFieldsPanel id="compare" title="Compare defaults" tool="TranscriptCompare" scopes={both} filter={compareOnly} notify={notify} />);
    case 'punch':
      return <ScopedFieldsPanel id="punch" title="Punch pre-roll" tool="Teleprompter" scopes={['global']} filter={punchOnly} notify={notify} />;
    case 'fx':
      return only(<ScopedFieldsPanel id="fx" title="Favourite effects" tool="DAW" scopes={both} filter={favouritesOnly} notify={notify} />);
    case 'backups':
      return hasProject ? <BackupsSection /> : <p className="m-0 text-[0.8125rem] text-[var(--text-muted)]">{NEEDS_PROJECT_REASON}</p>;
  }
}
