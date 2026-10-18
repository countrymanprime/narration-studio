import { describeApiError } from '../../api/errorMessage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBook, faFolderOpen, faXmark } from '@fortawesome/free-solid-svg-icons';
import { useApi } from '../../api/ApiContext';
import { Brand } from '../layout/Brand';
import { Button } from '../primitives/Button';
import { Heading } from '../primitives/Heading';
import { IconButton } from '../primitives/IconButton';
import { Panel } from '../primitives/Panel';
import { TOAST_INFO_MS, type Notify } from '../primitives/Toast';
import { TooltipTarget } from '../primitives/Tooltip';
import { NewProjectDialog } from './NewProjectDialog';
import { recentWhen } from './recentWhen';
import { DemoBanner } from '../layout/DemoBanner';
import type { ProjectSwitchResult, RecentProject } from '../../types';

// How long a removed recent project can be brought back. The host has no call that puts an entry back, so a removal is only sent to it when
// this has passed (or the picker closes); until then the row is just hidden. Longer than the toast that offers the Undo, so the Undo is never
// pressed after the removal has gone through.
export const REMOVE_UNDO_MS = TOAST_INFO_MS + 1_000;

// The application-data empty state for "no project folder was given" - a
// standalone launch (Start Menu shortcut, taskbar pin) with no REAPER-supplied
// project. Distinct from StartupScreen, which only models host-connection
// failure states before any bootstrap payload exists at all. Built to the Studio Next mock's
// ProjectPicker.tsx, less what the host cannot back yet: pins, the taskbar jump list and the "REAPER is running" banner.
// `onCreated` runs when New project made a project (the app opens it on Script); opening or browsing to one leaves the page alone.
export function ProjectPicker({ notify, onCreated }: { notify: Notify; onCreated: () => void }) {
  const api = useApi();
  const [recents, setRecents] = useState<RecentProject[]>([]);
  const [recentsFailed, setRecentsFailed] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  // The paths of recent projects removed from the list but not yet from the host: their Undo is still on offer.
  const [hidden, setHidden] = useState<string[]>([]);
  const removalTimers = useRef(new Map<string, number>());

  useEffect(() => {
    let active = true;
    void api
      .projectRecents()
      .then((next) => {
        if (active) setRecents(next);
      })
      .catch(() => {
        if (active) setRecentsFailed(true);
      });
    return () => {
      active = false;
    };
  }, [api]);

  // A successful switch/create emits the native "system:attached" event,
  // which App.tsx's existing subscription already turns into a bootstrap
  // refresh - this component only needs to surface a refusal, if any.
  const applyResult = (result: ProjectSwitchResult) => setReason(result.switched ? '' : (result.reason ?? ''));

  // Every action funnels through here so a failed IPC call (e.g. the dialog
  // rejecting, or the host not being ready) surfaces as visible text instead
  // of an unhandled promise rejection, and so overlapping clicks can't fire
  // two switches/creates against the same backend state machine at once.
  const runAction = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      setReason(describeApiError(error));
    } finally {
      setBusy(false);
    }
  };

  const openRecent = (entry: RecentProject) => runAction(async () => applyResult(await api.switchProject(entry.path, entry.name)));

  const visible = recents.filter((entry) => !hidden.includes(entry.path));
  const removeButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const listRef = useRef<HTMLDivElement>(null);
  const pendingFocusRef = useRef<string | null | undefined>(undefined);

  // After a row is hidden or brought back, its focused button is gone or new: move focus to the entry that slid into its place (or the
  // previous one, if it was last), or to the list when none is left, so keyboard and screen-reader users keep their place.
  useEffect(() => {
    const target = pendingFocusRef.current;
    if (target === undefined) return;
    pendingFocusRef.current = undefined;
    const button = target === null ? undefined : removeButtonRefs.current.get(target);
    (button ?? listRef.current)?.focus();
  }, [hidden]);

  // Sends one pending removal to the host. A refusal puts the row back and says why.
  const commitRemoval = useCallback(
    async (path: string) => {
      const timer = removalTimers.current.get(path);
      if (timer === undefined) return;
      window.clearTimeout(timer);
      removalTimers.current.delete(path);
      try {
        setRecents(await api.removeRecentProject(path));
      } catch (error) {
        setReason(describeApiError(error));
      } finally {
        setHidden((current) => current.filter((candidate) => candidate !== path));
      }
    },
    [api],
  );

  // Going away (a project was opened) settles what is still waiting, so a removed entry does not come back the next time.
  useEffect(() => {
    const timers = removalTimers.current;
    return () => {
      for (const path of [...timers.keys()]) void commitRemoval(path);
    };
  }, [commitRemoval]);

  const undoRemoval = (path: string) => {
    const timer = removalTimers.current.get(path);
    if (timer === undefined) return;
    window.clearTimeout(timer);
    removalTimers.current.delete(path);
    pendingFocusRef.current = path;
    setHidden((current) => current.filter((candidate) => candidate !== path));
  };

  const removeRecent = (entry: RecentProject) => {
    const index = visible.findIndex((candidate) => candidate.path === entry.path);
    pendingFocusRef.current = (visible[index + 1] ?? visible[index - 1])?.path ?? null;
    removalTimers.current.set(
      entry.path,
      window.setTimeout(() => void commitRemoval(entry.path), REMOVE_UNDO_MS),
    );
    setHidden((current) => [...current, entry.path]);
    setReason('');
    notify(`Removed ${entry.name} from recent projects. Its files are kept.`, 'info', { label: 'Undo', onAction: () => undoRemoval(entry.path) });
  };

  const browse = () =>
    runAction(async () => {
      const selection = await api.selectProjectFolder();
      if (!selection.selected || !selection.path) return;
      applyResult(await api.switchProject(selection.path));
    });

  const projectCreated = (result: ProjectSwitchResult) => {
    setNewProjectOpen(false);
    applyResult(result);
    onCreated();
  };

  const now = new Date();
  return (
    // tabIndex -1 like AppShell's <main>: a dialog that closes with nothing to give focus back to sends it here, not to <body>.
    <div className="flex h-full flex-col overflow-hidden">
      <DemoBanner />
      <main tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto p-6 focus:outline-none">
        {/* min-w-0: the column otherwise grows to its longest nowrap child (a project path) and overflows narrow screens. */}
        <div className="mx-auto flex min-h-full w-full max-w-[47.5rem] min-w-0 flex-col justify-center gap-5">
          <div className="flex items-center gap-[0.625rem]">
            <Brand />
          </div>
          <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
            <div className="min-w-0 flex-1">
              <Heading title="Choose your project" size="display">
                Open the book you’re working on, or start a new project.
              </Heading>
            </div>
            <Button variant="primary" onClick={() => setNewProjectOpen(true)} disabled={busy}>
              New project
            </Button>
          </div>
          {reason && (
            <p className="text-sm" role="alert" style={{ color: 'var(--danger-text)' }}>
              {reason}
            </p>
          )}
          <Panel
            title="Recent projects"
            flush
            actions={
              <TooltipTarget text="Browse folders…">
                <IconButton label="Browse folders…" onClick={() => void browse()} disabled={busy}>
                  <FontAwesomeIcon icon={faFolderOpen} />
                </IconButton>
              </TooltipTarget>
            }
          >
            <div tabIndex={-1} ref={listRef} className="focus:outline-none">
              {recentsFailed ? (
                <p className="p-4 text-sm" style={{ color: 'var(--danger-text)' }}>
                  Couldn&apos;t load recent projects.
                </p>
              ) : visible.length === 0 ? (
                <p className="p-4 text-sm" style={{ color: 'var(--text-muted)' }}>
                  No recent projects yet.
                </p>
              ) : (
                <ul>
                  {visible.map((entry) => (
                    <li key={entry.path} className="flex items-center gap-3 border-t border-[var(--border)] px-4 py-[0.8125rem] first:border-t-0">
                      <span
                        aria-hidden="true"
                        className="flex size-9 flex-none items-center justify-center rounded-[var(--radius-button)] bg-[var(--surface-2)] text-[var(--text-muted)] max-sm:hidden"
                      >
                        <FontAwesomeIcon icon={faBook} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold" title={entry.name}>
                          {entry.name}
                        </div>
                        <div className="truncate font-['IBM_Plex_Mono',ui-monospace,monospace] text-sm text-[var(--text-muted)]" title={entry.path}>
                          {entry.path}
                        </div>
                      </div>
                      <span className="flex-none text-sm text-[var(--text-muted)] max-sm:hidden">{recentWhen(entry.lastOpened, now)}</span>
                      <Button variant="secondary" aria-label={`Open ${entry.name}`} onClick={() => void openRecent(entry)} disabled={busy}>
                        Open
                      </Button>
                      <IconButton
                        ref={(node) => {
                          if (node) removeButtonRefs.current.set(entry.path, node);
                          else removeButtonRefs.current.delete(entry.path);
                        }}
                        label={`Remove ${entry.name} from recent projects`}
                        onClick={() => removeRecent(entry)}
                      >
                        <FontAwesomeIcon icon={faXmark} />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>
          <p className="text-sm text-[var(--text-muted)]">Project files stay in the folder you choose.</p>
        </div>
        {newProjectOpen && <NewProjectDialog onClose={() => setNewProjectOpen(false)} onCreated={projectCreated} />}
      </main>
    </div>
  );
}
