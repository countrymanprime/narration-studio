import { describeApiError } from '../../api/errorMessage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBook, faXmark } from '@fortawesome/free-solid-svg-icons';
import { useApi } from '../../api/ApiContext';
import { Brand } from '../layout/Brand';
import { Button } from '../primitives/Button';
import { Heading } from '../primitives/Heading';
import { IconButton } from '../primitives/IconButton';
import { Panel } from '../primitives/Panel';
import { SectionLabel } from '../primitives/SectionLabel';
import { TOAST_INFO_MS, type Notify } from '../primitives/Toast';
import { CHANGE_HIGHLIGHT_CLASSES, useJustChanged } from '../primitives/changeHighlight';
import { NewProjectDialog } from './NewProjectDialog';
import { recentWhen } from './recentWhen';
import { ExtensionBanner } from '../../appExtension';
import type { ProjectSwitchResult, RecentProject, RunningDawProject } from '../../types';

// How long a removed recent project can be brought back. The host has no call that puts an entry back, so a removal is only sent to it when
// this has passed (or the picker closes); until then the row is just hidden. Longer than the toast that offers the Undo, so the Undo is never
// pressed after the removal has gone through.
export const REMOVE_UNDO_MS = TOAST_INFO_MS + 1_000;

// The application-data empty state for "no project folder was given" - a
// standalone launch (Start Menu shortcut, taskbar pin) with no REAPER-supplied
// project. Distinct from StartupScreen, which only models host-connection
// failure states before any bootstrap payload exists at all. Built to the Studio Next mock's
// ProjectPicker.tsx, less the taskbar jump list preview, which the host does not expose.
// `onCreated` runs when New project made a project (the app opens it on Script); opening or browsing to one leaves the page alone.
// `onBack` is set when the picker was opened from the header's project name over a project that is already open: it draws a Back button that closes the picker and keeps that project.
export function ProjectPicker({
  notify,
  onCreated,
  onBack,
  currentName,
}: {
  notify: Notify;
  onCreated: () => void;
  onBack?: () => void;
  currentName?: string;
}) {
  const api = useApi();
  const [recents, setRecents] = useState<RecentProject[]>([]);
  // The recent project the running REAPER has open, when the host knows one; null draws no banner (a failed read draws none either).
  const [running, setRunning] = useState<RunningDawProject | null>(null);
  const [recentsFailed, setRecentsFailed] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  // The paths of recent projects removed from the list but not yet from the host: their Undo is still on offer.
  const [hidden, setHidden] = useState<string[]>([]);
  // The row an Undo brought back is highlighted once, so the narrator sees where it returned.
  const restored = useJustChanged();
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
    void api
      .projectRunningDaw()
      .then((next) => {
        if (active && next.linked) setRunning(next);
      })
      .catch(() => {
        if (active) setRunning(null);
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

  // Pinned projects first, each group in the host's most-recent-first order.
  const visible = [...recents.filter((entry) => entry.pinned), ...recents.filter((entry) => !entry.pinned)].filter((entry) => !hidden.includes(entry.path));
  // The list says which are pinned with a heading over each group, not only with the pin's tint (alignment audit XPJ-3).
  const pinnedRows = visible.filter((entry) => entry.pinned);
  const recentRows = visible.filter((entry) => !entry.pinned);
  // The project the running REAPER has open is marked on its own row, whose Open is the one to press; the banner keeps an Open only
  // when that project is not in the list (XPJ-7).
  const runningListed = running !== null && visible.some((entry) => entry.path === running.path);
  const togglePin = async (entry: RecentProject) => {
    try {
      setRecents(await api.setProjectPinned(entry.path, !entry.pinned));
    } catch (error) {
      setReason(describeApiError(error));
    }
  };

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

  const undoRemoval = (entry: RecentProject) => {
    const { path } = entry;
    const timer = removalTimers.current.get(path);
    // The picker closed (a project was opened) and sent the removal while this Undo was still on screen: say so rather than do nothing.
    if (timer === undefined) {
      notify(`${entry.name} was already removed from recent projects.`);
      return;
    }
    window.clearTimeout(timer);
    removalTimers.current.delete(path);
    pendingFocusRef.current = path;
    restored.mark(path);
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
    notify(`Removed ${entry.name} from recent projects. Its files are kept.`, 'info', { label: 'Undo', onAction: () => undoRemoval(entry) });
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
      <ExtensionBanner />
      <main tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto p-6 focus:outline-none">
        {/* min-w-0: the column otherwise grows to its longest nowrap child (a project path) and overflows narrow screens. */}
        {/* Top-aligned: centred, the mark landed at a different height for every list length and banner (alignment audit XPJ-1, R3PJ-1). */}
        <div className="mx-auto flex w-full max-w-[47.5rem] min-w-0 flex-col gap-5 pt-[min(6vh,3rem)]">
          <div className="flex items-center gap-[0.625rem]">
            <Brand />
            {onBack && (
              <Button variant="secondary" className="ml-auto" onClick={onBack} aria-label={currentName ? `Back to ${currentName}` : 'Back'}>
                Back
              </Button>
            )}
          </div>
          {/* The two ways to a project sit together (XPJ-4), on the title's baseline (XPJ-11); below sm they go under the title, which
              then has the row to itself (XPJ-10). */}
          <div className="flex flex-col items-start gap-x-4 gap-y-3 sm:flex-row sm:items-baseline">
            <div className="min-w-0 flex-1">
              <Heading title="Choose your project" size="display">
                Open the book you’re working on, or start a new project.
              </Heading>
            </div>
            <div className="flex flex-none flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void browse()} disabled={busy}>
                Open folder…
              </Button>
              <Button variant="primary" onClick={() => setNewProjectOpen(true)} disabled={busy}>
                New project
              </Button>
            </div>
          </div>
          {reason && (
            <p className="text-sm" role="alert" style={{ color: 'var(--danger-text)' }}>
              {reason}
            </p>
          )}
          {running && (
            <div
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius-button)] border border-[var(--accent)] bg-[var(--accent-soft)] px-4 py-3 text-sm"
              role="status"
            >
              <span className="min-w-0 flex-1">
                REAPER is running with a project linked to <b>{running.name}</b>.{runningListed && ' Its row is marked below.'}
              </span>
              {!runningListed && (
                <Button
                  variant="secondary"
                  aria-label={`Open ${running.name}`}
                  onClick={() => void openRecent({ path: running.path, name: running.name, lastOpened: '', pinned: false })}
                  disabled={busy}
                >
                  Open
                </Button>
              )}
            </div>
          )}
          <Panel title="Pinned and recent" flush>
            <div tabIndex={-1} ref={listRef} className="focus:outline-none">
              {recentsFailed ? (
                <p className="p-4 text-sm" style={{ color: 'var(--danger-text)' }}>
                  Couldn&apos;t load recent projects.
                </p>
              ) : visible.length === 0 ? (
                // An empty list offers the way forward where the eye is, not only in the header row (XPJ-8).
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 text-sm">
                  <p className="min-w-0 flex-1" style={{ color: 'var(--text-muted)' }}>
                    No recent projects yet.
                  </p>
                  <Button variant="secondary" onClick={() => setNewProjectOpen(true)} disabled={busy}>
                    New project
                  </Button>
                </div>
              ) : (
                <>
                  {[
                    { label: 'Pinned', rows: pinnedRows },
                    { label: 'Recent', rows: recentRows },
                  ]
                    .filter((group) => group.rows.length > 0)
                    .map((group) => (
                      <section key={group.label} aria-labelledby={`picker-${group.label}`} className="border-t border-[var(--border)] first:border-t-0">
                        {pinnedRows.length > 0 && (
                          <SectionLabel as="h3" id={`picker-${group.label}`} className="block px-4 pt-3 pb-1">
                            {group.label}
                          </SectionLabel>
                        )}
                        <ul aria-labelledby={pinnedRows.length > 0 ? `picker-${group.label}` : undefined}>
                          {group.rows.map((entry) => (
                            <li
                              key={entry.path}
                              data-just-changed={restored.changed === entry.path ? '' : undefined}
                              aria-current={running?.path === entry.path ? 'true' : undefined}
                              className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--border)] px-4 py-[0.8125rem] first:border-t-0 sm:flex-nowrap ${running?.path === entry.path ? 'bg-[var(--accent-soft)] shadow-[inset_3px_0_0_var(--accent)]' : ''} ${restored.changed === entry.path ? CHANGE_HIGHLIGHT_CLASSES : ''}`}
                            >
                              <span
                                aria-hidden="true"
                                className="flex size-9 flex-none items-center justify-center rounded-[var(--radius-button)] bg-[var(--surface-2)] text-[var(--text-muted)] max-sm:hidden"
                              >
                                <FontAwesomeIcon icon={faBook} />
                              </span>
                              {/* Below sm the name takes the whole first line and the date and buttons wrap under it, so the name is readable (XPJ-2). */}
                              <div className="min-w-0 flex-1 max-sm:basis-full">
                                <div className="truncate font-semibold" title={entry.name}>
                                  {entry.name}
                                </div>
                                {running?.path === entry.path && <div className="text-xs text-[var(--accent-strong)]">Open in REAPER now</div>}
                                <div className="truncate font-['IBM_Plex_Mono',ui-monospace,monospace] text-sm text-[var(--text-muted)]" title={entry.path}>
                                  {entry.path}
                                </div>
                              </div>
                              <span className="flex-none text-sm text-[var(--text-muted)] max-sm:mr-auto">{recentWhen(entry.lastOpened, now)}</span>
                              <Button variant="secondary" aria-label={`Open ${entry.name}`} onClick={() => void openRecent(entry)} disabled={busy}>
                                Open
                              </Button>
                              <IconButton
                                action={entry.pinned ? 'unpin' : 'pin'}
                                label={`${entry.pinned ? 'Unpin' : 'Pin'} ${entry.name}`}
                                aria-pressed={entry.pinned}
                                // Pinned reads louder than unpinned: the glyph takes the accent, not the muted grey on the accent tint (R4SM-16).
                                className="aria-pressed:text-[var(--accent-strong)]"
                                onClick={() => void togglePin(entry)}
                              />
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
                      </section>
                    ))}
                </>
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
