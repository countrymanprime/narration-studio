import * as host from '../../wailsjs/github.com/countrymanprime/narration-utils/shell/host';

/**
 * One trace line in the host's run log (`event` is `kind`): what the narrator did and what the app answered, so a failure can be
 * read back without asking. `kind` starts with `ui.`; `.fail` is logged as a warning, `.ok` as debug detail, anything else as info.
 * The host scrubs file paths and cuts the message, but the caller still sends ids, names of bindings, counts and outcomes, never
 * manuscript or transcript text. Fire and forget: a missing host (a test, the mock client) or a failed write is not an error.
 */
export function logUi(kind: `ui.${string}`, message: string): void {
  try {
    void host.SystemReportDiagnostic(kind, message).catch(() => {});
  } catch {
    // No host to write to.
  }
}
