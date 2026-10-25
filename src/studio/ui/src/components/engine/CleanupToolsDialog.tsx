import { useEffect, useState } from 'react';
import { useApi } from '../../api/ApiContext';
import { Button } from '../primitives/Button';
import { Dialog } from '../primitives/Dialog';
import { ToolResult } from './ToolResult';
import type { CleanupToolKey, CleanupToolsState } from '../../types';

const IDLE: CleanupToolsState = { phase: 'idle', message: '', tool: '', action: '' };

/** The allow-listed tools, in the order the host's cleanuptools.Tools lists them. */
const TOOLS: { key: CleanupToolKey; label: string; description: string }[] = [
  {
    key: 'repair_pops_clicks',
    label: 'Repair Pops/Clicks',
    description: 'REAPER’s own dialog (REAPER 7.80 or later). It finds pops and clicks in the selected items; nothing is repaired until you apply it.',
  },
  {
    key: 'magnolius_declick',
    label: 'Magnolius DeClick',
    description: 'A free third-party script for mouth clicks. Only if you installed it in REAPER yourself: The app never installs it.',
  },
];

/** Cleanup launchers: opens a repair tool in REAPER on the
 * items selected there. The app changes nothing itself; the tool's own dialog does the work. Reachable from the audio
 * engine panel next to "Prepare chapter render…", not a new nav item. */
export function CleanupToolsDialog({ onClose }: { onClose: () => void }) {
  const api = useApi();
  const [state, setState] = useState<CleanupToolsState>(IDLE);
  const [requestError, setRequestError] = useState('');
  // The tool the last Open was for, so a failure of the request itself shows under that tool's row too.
  const [requested, setRequested] = useState<CleanupToolKey>();

  useEffect(() => {
    const unsubscribe = api.subscribeCleanupTools(setState);
    void api
      .cleanupToolsState()
      .then(setState)
      .catch(() => {});
    return unsubscribe;
  }, [api]);

  const running = state.phase === 'launching';
  // A launch's outcome belongs to the tool it opened (R3EN1-3): it shows under that row, not at the foot of the list. One that names no
  // listed tool (an older run's state) shows under the list.
  const outcomeTool: string = requestError ? (requested ?? '') : state.phase === 'launched' || state.phase === 'error' ? state.tool : '';
  const outcome =
    requestError || state.phase === 'error' ? (
      <ToolResult tone="danger" message={requestError || state.message} />
    ) : state.phase === 'launched' ? (
      <ToolResult tone="success" message={state.message} />
    ) : null;
  const outcomeListed = TOOLS.some((tool) => tool.key === outcomeTool);

  const launch = (tool: CleanupToolKey) => {
    setRequested(tool);
    setRequestError('');
    api.cleanupToolsLaunch(tool).catch((reason: unknown) => setRequestError(String(reason)));
  };

  return (
    <Dialog
      dismissOnOutsidePress={true}
      title="Cleanup tools"
      onClose={running ? undefined : onClose}
      escapeCloses={!running}
      description="Open a repair tool in REAPER on the items you have selected there. The app changes nothing itself: you apply or cancel the repair in the tool’s own window."
      actions={
        <Button variant="secondary" onClick={onClose} disabled={running}>
          Close
        </Button>
      }
    >
      <ul>
        {TOOLS.map((tool) => (
          <li key={tool.key} className="space-y-2 border-t py-3 first:border-t-0" style={{ borderColor: 'var(--border)' }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1 basis-60">
                <p className="text-sm font-semibold">{tool.label}</p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {tool.description}
                </p>
              </div>
              <Button
                variant="secondary"
                aria-label={`Open ${tool.label}`}
                onClick={() => launch(tool.key)}
                pending={running && state.tool === tool.key}
                disabled={running && state.tool !== tool.key}
              >
                Open
              </Button>
            </div>
            {outcomeListed && outcomeTool === tool.key && outcome}
          </li>
        ))}
      </ul>
      {!outcomeListed && outcome && <div className="mt-3">{outcome}</div>}
    </Dialog>
  );
}
