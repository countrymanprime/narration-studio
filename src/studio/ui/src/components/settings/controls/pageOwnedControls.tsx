import type { ReactElement } from 'react';
import type { ScopedSettingField } from '../../../types';
import { BackupsSection } from '../BackupsSection';
import { RecordingCheckSummary } from '../RecordingCheckSummary';
import { ScopedFieldsPanel } from '../page/ScopedFieldsPanel';
import { NEEDS_PROJECT_FOR_PROJECT, NEEDS_PROJECT_REASON } from '../registry/projectNeeds';
import { ROWS } from '../registry/rows';
import { useHasProject, useSettingsHost } from '../row/SettingsHost';

// The settings that only one page reads, each now a row under the topic it belongs to. Their fields are edited in a panel with Save and Discard
// (several values that make sense together), so a body draws the panel for the host tool and a field no other row draws.

/** The host keys of `tool` that a row of its own draws, so the panel never draws one a second time. */
const rowKeys = (tool: string): ReadonlySet<string> => new Set(ROWS.flatMap((row) => (row.field?.tool === tool ? [row.field.key] : [])));

// Module-level so a panel's field list keeps its identity between reads (ScopedFieldsPanel's contract).
const COVERAGE_ROW_KEYS = rowKeys('RecordingCoverage');
const coverageOnly = (field: ScopedSettingField) => !COVERAGE_ROW_KEYS.has(field.key);
const colourOnly = (field: ScopedSettingField) => field.kind === 'color';
const favouritesOnly = (field: ScopedSettingField) => field.key === 'fx_favourites';

/** The scopes a panel edits: the computer's values, and this project's when one is open, with what waits for a project said under it. */
function Scoped({ children }: { children: (scopes: readonly ['global'] | readonly ['global', 'project']) => ReactElement }) {
  const hasProject = useHasProject();
  return (
    <>
      {children(hasProject ? (['global', 'project'] as const) : (['global'] as const))}
      {!hasProject && <p className="m-0 mt-2 text-[0.8125rem] text-[var(--text-muted)]">{NEEDS_PROJECT_FOR_PROJECT}</p>}
    </>
  );
}

export function RecordingRulesBody() {
  const { notify } = useSettingsHost();
  return (
    <Scoped>
      {(scopes) => (
        <ScopedFieldsPanel
          id="recording-check"
          title="Recording check rules"
          tool="RecordingCoverage"
          scopes={scopes}
          filter={coverageOnly}
          notify={notify}
          before={({ fields, scope }) => <RecordingCheckSummary fields={fields} scope={scope} cascade={false} />}
        />
      )}
    </Scoped>
  );
}

export function CompareColoursBody() {
  const { notify } = useSettingsHost();
  return (
    <Scoped>
      {(scopes) => (
        <ScopedFieldsPanel id="compare" title="Compare marker colours" tool="TranscriptCompare" scopes={scopes} filter={colourOnly} notify={notify} />
      )}
    </Scoped>
  );
}

export function FavouriteEffectsBody() {
  const { notify } = useSettingsHost();
  return (
    <Scoped>{(scopes) => <ScopedFieldsPanel id="fx" title="Favourite effects" tool="DAW" scopes={scopes} filter={favouritesOnly} notify={notify} />}</Scoped>
  );
}

export function SilenceCleanupBody() {
  const { notify } = useSettingsHost();
  return <Scoped>{(scopes) => <ScopedFieldsPanel id="cleanup" title="Silence cleanup" tool="Cleanup" scopes={scopes} notify={notify} />}</Scoped>;
}

export function PreviewSuggestionBody() {
  const { notify } = useSettingsHost();
  return <Scoped>{(scopes) => <ScopedFieldsPanel id="preview" title="Preview suggestion" tool="Preview" scopes={scopes} notify={notify} />}</Scoped>;
}

export function StageSuggestionsBody() {
  const { notify } = useSettingsHost();
  return (
    <Scoped>
      {(scopes) => <ScopedFieldsPanel id="stage-suggestions" title="Stage suggestions" tool="StageRecommendations" scopes={scopes} notify={notify} />}
    </Scoped>
  );
}

export function AudacityBackupsBody() {
  return useHasProject() ? <BackupsSection /> : <p className="m-0 text-[0.8125rem] text-[var(--text-muted)]">{NEEDS_PROJECT_REASON}</p>;
}
