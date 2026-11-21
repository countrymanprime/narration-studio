import type { CSSProperties, ReactElement } from 'react';
import type { ScopedSettingField } from '../../../types';
import { useDawCapabilityReport } from '../../../daw/useDawCapabilityReport';
import { BackupsSection, hasBackups } from '../BackupsSection';
import { RecordingCheckSummary } from '../RecordingCheckSummary';
import { ScopedFieldsPanel } from '../page/ScopedFieldsPanel';
import { NEEDS_PROJECT_FOR_PROJECT, NEEDS_PROJECT_REASON } from '../registry/projectNeeds';
import { PANEL_ROWS } from '../registry/panelFields';
import { useHasProject, useSettingsHost } from '../row/SettingsHost';

// The settings that only one page reads, each now a row under the topic it belongs to. Their fields are edited in a panel with Save and Discard
// (several values that make sense together), so a body draws the panel for the host tool and a field no other row draws.

// Module-level so a panel's field list keeps its identity between reads (ScopedFieldsPanel's contract).
const filterFor = (rowId: string) => {
  const { wanted } = PANEL_ROWS[rowId]!;
  return (field: ScopedSettingField) => wanted(field.key);
};
const coverageOnly = filterFor('stt.rules');
const colourOnly = filterFor('stt.compareColours');
const favouritesOnly = filterFor('daw.fxFavourites');

/** The scopes a panel edits: the computer's values, and this project's when one is open, with what waits for a project said under it. */
function Scoped({ children, labelWidth }: { children: (scopes: readonly ['global'] | readonly ['global', 'project']) => ReactElement; labelWidth?: string }) {
  const hasProject = useHasProject();
  return (
    // The row's body column lays its children out from the start, so a panel would shrink to its content: it takes the row's whole width instead.
    <div className="w-full min-w-0" style={labelWidth ? ({ '--scoped-label': labelWidth, '--scoped-label-max': labelWidth } as CSSProperties) : undefined}>
      {children(hasProject ? (['global', 'project'] as const) : (['global'] as const))}
      {!hasProject && <p className="m-0 mt-2 text-[0.8125rem] text-[var(--text-muted)]">{NEEDS_PROJECT_FOR_PROJECT}</p>}
    </div>
  );
}

export function RecordingRulesBody() {
  const { notify } = useSettingsHost();
  return (
    <Scoped>
      {(scopes) => (
        <ScopedFieldsPanel
          id="recording-check"
          title="Recording check"
          tool="RecordingCoverage"
          scopes={scopes}
          pageSaysReadError
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
        <ScopedFieldsPanel
          id="compare"
          title="Compare marker colours"
          tool="TranscriptCompare"
          scopes={scopes}
          pageSaysReadError
          filter={colourOnly}
          notify={notify}
        />
      )}
    </Scoped>
  );
}

export function FavouriteEffectsBody() {
  const { notify } = useSettingsHost();
  return (
    <Scoped>
      {(scopes) => <ScopedFieldsPanel id="fx" title="Favourite effects" tool="DAW" scopes={scopes} pageSaysReadError filter={favouritesOnly} notify={notify} />}
    </Scoped>
  );
}

export function SilenceCleanupBody() {
  const { notify } = useSettingsHost();
  return (
    <Scoped>{(scopes) => <ScopedFieldsPanel id="cleanup" title="Silence cleanup" tool="Cleanup" scopes={scopes} pageSaysReadError notify={notify} />}</Scoped>
  );
}

export function PreviewSuggestionBody() {
  const { notify } = useSettingsHost();
  return (
    <Scoped>
      {(scopes) => <ScopedFieldsPanel id="preview" title="Preview suggestion" tool="Preview" scopes={scopes} pageSaysReadError notify={notify} />}
    </Scoped>
  );
}

export function StageSuggestionsBody() {
  const { notify } = useSettingsHost();
  return (
    <Scoped labelWidth="19rem">
      {(scopes) => (
        <ScopedFieldsPanel id="stage-suggestions" title="Stage suggestions" tool="StageRecommendations" scopes={scopes} pageSaysReadError notify={notify} />
      )}
    </Scoped>
  );
}

export function AudacityBackupsBody() {
  const { report } = useDawCapabilityReport();
  const hasProject = useHasProject();
  // Only Audacity keeps backups; the section draws nothing for another tool, so the row says why instead of showing a label and no control.
  if (report && !hasBackups(report))
    return <p className="m-0 text-[0.8125rem] text-[var(--text-muted)]">Backups are kept only when the project records with Audacity.</p>;
  return hasProject ? (
    <div className="w-full min-w-0">
      <BackupsSection />
    </div>
  ) : (
    <p className="m-0 text-[0.8125rem] text-[var(--text-muted)]">{NEEDS_PROJECT_REASON}</p>
  );
}
