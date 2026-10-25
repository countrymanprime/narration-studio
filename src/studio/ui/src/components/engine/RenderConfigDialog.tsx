import { useEffect, useState } from 'react';
import { useApi } from '../../api/ApiContext';
import { Button } from '../primitives/Button';
import { Dialog } from '../primitives/Dialog';
import { Field } from '../primitives/Field';
import { ToolResult } from './ToolResult';
import { Kbd } from '../primitives/Kbd';
import type { RenderConfigState } from '../../types';

const IDLE: RenderConfigState = { phase: 'idle', message: '', folder: '', targets: [], count: 0 };

/** Per-chapter render configuration: configure only. Sets the render bounds to all regions, the naming pattern to the region name, and the
 * output folder; this dialog never triggers a render itself. Reachable from the audio engine panel next to "Link
 * chapters…", not a new nav item. */
// `onCreateRegions` opens Create chapter regions in this dialog's place, for a configure that found no chapter regions (R3EN2-8).
export function RenderConfigDialog({ onClose, onCreateRegions }: { onClose: () => void; onCreateRegions?: () => void }) {
  const api = useApi();
  const [state, setState] = useState<RenderConfigState>(IDLE);
  const [folder, setFolder] = useState('');
  const [requestError, setRequestError] = useState('');

  useEffect(() => {
    const unsubscribe = api.subscribeRenderConfig(setState);
    void api
      .renderConfigState()
      .then((fetched) => {
        setState(fetched);
        setFolder((current) => current || fetched.folder);
        if (!fetched.folder) return api.renderConfigSuggestFolder().then((suggested) => setFolder((current) => current || suggested.folder));
      })
      .catch(() => {});
    return unsubscribe;
  }, [api]);

  const running = state.phase === 'configuring';
  const configured = state.phase === 'success' && state.count > 0;

  const configure = () => {
    setRequestError('');
    api.renderConfigConfigure(folder).catch((reason: unknown) => setRequestError(String(reason)));
  };

  return (
    <Dialog
      dismissOnOutsidePress={false}
      title="Prepare chapter render"
      onClose={running ? undefined : onClose}
      escapeCloses={!running}
      description="Set the render bounds to every chapter region and name each file after its region. This does not render anything: you press Render in REAPER yourself."
      actions={
        <>
          {/* Once the render is configured, Close is the next step (ENX-28). */}
          <Button variant={configured ? 'primary' : 'secondary'} onClick={onClose} disabled={running}>
            Close
          </Button>
          <Button variant={configured ? 'secondary' : 'primary'} onClick={configure} disabled={!folder.trim()} pending={running}>
            Configure render
          </Button>
        </>
      }
    >
      <Field label="Output folder" value={folder} onChange={setFolder} disabled={running} placeholder="C:\Books\Alice\renders" />

      {/* One outcome block (R3EN2-7, R3EN2-8, R3EN1-3): the files and the one instruction on success, a warning with the way forward
          when there were no chapter regions to render, a failure in the danger tone. */}
      {state.phase === 'success' && state.count > 0 && (
        <div className="mt-4">
          <ToolResult
            tone="success"
            message={
              <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <span>Render is configured for {state.count === 1 ? '1 chapter file' : `${state.count} chapter files`}. Press Render in REAPER</span>
                <Kbd keys={['Ctrl', 'Alt', 'R']} />
                <span>or File &gt; Render to create them.</span>
              </span>
            }
          >
            {state.targets.length > 0 && (
              <ul aria-label="Files the render will create" className="mt-2 max-h-40 space-y-0.5 overflow-y-auto font-['IBM_Plex_Mono',ui-monospace,monospace]">
                {state.targets.map((target) => (
                  <li key={target}>{target}</li>
                ))}
              </ul>
            )}
          </ToolResult>
        </div>
      )}
      {state.phase === 'success' && state.count === 0 && (
        <div className="mt-4">
          <ToolResult tone="warning" message="No chapter regions were found yet, so there is nothing to render. Create them, then configure the render again.">
            {onCreateRegions && (
              <div className="mt-2">
                <Button variant="secondary" onClick={onCreateRegions}>
                  Create chapter regions…
                </Button>
              </div>
            )}
          </ToolResult>
        </div>
      )}
      {(requestError || state.phase === 'error') && (
        <div className="mt-4">
          <ToolResult tone="danger" message={requestError || state.message} />
        </div>
      )}
    </Dialog>
  );
}
