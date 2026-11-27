import { readProjectStorage, writeProjectStorage } from '../../projectFolder';
import type { DiagnosticsSourceKind } from '../../types';

// Which kind of file Master & QC's Diagnostics is set to check ("Rendered chapters" or "Raw recordings"), per project (#4099). The host keeps the kind only of a check that ran, so a
// choice made and not yet run was lost with the page. A per-viewer convenience in browser storage under its own key, never a host field; the helpers guard storage that is missing, full or blocked.
const PROJECT_KEY = 'master.diagnosticsSource';

/** The kind the narrator last chose for this project, or undefined when none is kept, no project is open, or the kept value is no kind. */
export function loadDiagnosticsSource(projectFolder: string): DiagnosticsSourceKind | undefined {
  const kept = readProjectStorage(PROJECT_KEY, projectFolder);
  return kept === 'raw_recording' || kept === 'processed_render' ? kept : undefined;
}

/** Remembers the kind the narrator chose. A failed write only means it is not kept past this visit. */
export function saveDiagnosticsSource(projectFolder: string, kind: DiagnosticsSourceKind): void {
  writeProjectStorage(PROJECT_KEY, projectFolder, kind);
}
