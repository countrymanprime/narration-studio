import { useCallback, useEffect, useRef, useState } from 'react';
import type { DawCapabilities } from '../../api/contracts/daw';
import { describeApiError } from '../../api/errorMessage';
import { usePort } from '../../ports/usePort';
import type { Scope, ScopedSettingField } from '../../types';
import { IconButton } from '../primitives/IconButton';
import { SectionLabel } from '../primitives/SectionLabel';
import { numberProblem } from './numberSetting';
import { ScopedSetting } from './ScopedSetting';
import { keepFocusOnRemoval } from '../layout/keepFocusOnRemoval';
import { plural } from '../../plural';
import { useUnsavedDraft } from '../../studio/drafts/unsavedDrafts';

const TOOL = 'DAW';
const WINDOW_KEY = 'backups.window_seconds';
const RETENTION_KEY = 'backups.retention_days';
const KEYS = [WINDOW_KEY, RETENTION_KEY];

/** One backups setting at the layer in force: the project's override when it has one, else Global. */
export type BackupsRow = { field: ScopedSettingField; scope: Scope };

/** Whether the DAW has backups at all: a built `backups` row. REAPER's Not yet available and the built-in recorder's Unsupported have none. */
export function hasBackups(caps: DawCapabilities | undefined): boolean {
  const level = caps?.capabilities['backups']?.level;
  return level === 'supported' || level === 'experimental';
}

/** "about 2 minutes either side" for 120 s: whole minutes from a minute up, seconds below. */
function windowWords(seconds: number): string {
  return `about ${seconds >= 60 ? plural(Math.round(seconds / 60), 'minute') : plural(seconds, 'second')} either side`;
}

/** Whether a row's edit is text its box held because it is not a number (`onRefused`); every number the box reports is one the range accepts. */
function isNotANumber(row: BackupsRow, draft: string | undefined): boolean {
  return draft !== undefined && draft !== '' && row.field.number !== undefined && numberProblem(row.field.number, draft) !== undefined;
}

/** The value a row stands for: the edit when it is a number, else what is in force. */
function shown(row: BackupsRow, draft: string | undefined): number {
  return Number(draft && !isNotANumber(row, draft) ? draft : row.field.effectiveValue);
}

export type BackupsViewProps = {
  /** The DAW's name from the capability report. */
  daw: string;
  /** The capability's own sentence when backups are present but unavailable; the rows are not drawn then. */
  reason?: string;
  /** Why the capability report or the settings could not be read. */
  loadError?: string;
  onRetry?: () => void;
  rows: BackupsRow[];
  drafts: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onCommit: (key: string) => void;
  onClearOverride: (key: string) => void;
  /** Why the last save was refused, in the host's words. */
  saveError?: string;
};

/**
 * The Backups section as drawn: the heading, then the load error with Retry, the capability's sentence, or the help and the two
 * rows. Props only, so the stories can show every state.
 */
export function BackupsView({ daw, reason, loadError, onRetry, rows, drafts, onChange, onCommit, onClearOverride, saveError }: BackupsViewProps) {
  const row = (key: string) => rows.find((candidate) => candidate.field.key === key);
  const windowRow = row(WINDOW_KEY);
  const retention = row(RETENTION_KEY);
  return (
    <section aria-labelledby="daw-backups-label" className="space-y-2 pt-3">
      <SectionLabel as="h3" id="daw-backups-label">
        Backups
      </SectionLabel>
      {loadError ? (
        <div
          className="flex flex-wrap items-center gap-3 rounded-md p-3"
          role="alert"
          style={{ background: 'var(--review-soft)', color: 'var(--danger-text)' }}
        >
          <span>The backups settings could not be read: {loadError}.</span>
          {onRetry && <IconButton action="retry" ref={keepFocusOnRemoval} type="button" onClick={onRetry} />}
        </div>
      ) : reason ? (
        <p style={{ color: 'var(--text-muted)' }}>{reason}</p>
      ) : (
        <>
          {windowRow && retention && (
            <p style={{ color: 'var(--text-muted)' }}>
              {daw} keeps a copy of the audio around an edit, {windowWords(shown(windowRow, drafts[WINDOW_KEY]))}, for{' '}
              {plural(shown(retention, drafts[RETENTION_KEY]), 'day')}.
            </p>
          )}
          {rows.map(({ field, scope }) => (
            // Leaving the box saves it; a blur that stays inside the row (Reset) does not.
            <div
              key={field.key}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onCommit(field.key);
              }}
            >
              <ScopedSetting
                field={field}
                scope={scope}
                value={drafts[field.key] ?? field.value}
                change={(value) => onChange(field.key, value)}
                onClearOverride={() => onClearOverride(field.key)}
              />
            </div>
          ))}
          {saveError && (
            <p role="alert" style={{ color: 'var(--danger-text)' }}>
              The change was not saved: {saveError}.
            </p>
          )}
        </>
      )}
    </section>
  );
}

/** Each backups row at the layer in force, from the two reads: the project's field when it overrides, else Global's. */
function rowsOf(global: ScopedSettingField[], project: ScopedSettingField[]): BackupsRow[] {
  return KEYS.flatMap((key): BackupsRow[] => {
    const own = project.find((field) => field.key === key);
    if (own?.isSet) return [{ field: own, scope: 'project' }];
    const shared = global.find((field) => field.key === key);
    return shared ? [{ field: shared, scope: 'global' }] : [];
  });
}

/**
 * Settings > DAW: Backups (SNM-3b). Drawn only when the DAW reports the `backups` capability as built; when it
 * is there but unavailable (the DAW not running) the capability's own sentence stands in for the rows. The window
 * either side of an edit and the retention are the DAW tool's two number settings, edited through `ScopedSetting` and
 * saved when a box is left, at the layer the value comes from; a number past the store's range is saved as the nearest limit. It takes no props, so a Settings
 * page mounts it as `<BackupsSection />`. The report is read when it mounts, as the Editing drawer reads it.
 */
export function BackupsSection() {
  const daw = usePort('daw');
  const system = usePort('system');
  const [caps, setCaps] = useState<DawCapabilities>();
  const [rows, setRows] = useState<BackupsRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // What `commit` reads: leaving a box can change its draft (a number past the range becomes the limit) in the same event that commits it,
  // before the state above has drawn.
  const latestDrafts = useRef(drafts);
  const holdDrafts = useCallback((next: Record<string, string>) => {
    latestDrafts.current = next;
    setDrafts(next);
  }, []);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [attempt, setAttempt] = useState(0);

  const readSettings = useCallback(async () => {
    const [global, project] = await Promise.all([system.settingsForScope('global'), system.settingsForScope('project')]);
    setRows(rowsOf(global[TOOL] ?? [], project[TOOL] ?? []));
  }, [system]);

  useEffect(() => {
    let live = true;
    daw
      .capabilities()
      .then(async (next) => {
        if (!live) return;
        setCaps(next);
        if (hasBackups(next) && next.capabilities['backups']?.available) await readSettings();
        if (live) setLoadError('');
      })
      .catch((error: unknown) => {
        if (live) setLoadError(describeApiError(error));
      });
    return () => {
      live = false;
    };
  }, [daw, readSettings, attempt]);

  const save = useCallback(
    async (scope: Scope, values: Record<string, string | null>) => {
      try {
        await system.saveSettings(TOOL, scope, values);
        setSaveError('');
        await readSettings();
        // Only what was saved leaves the form: what is being typed in the other box stays.
        holdDrafts(Object.fromEntries(Object.entries(latestDrafts.current).filter(([key]) => !(key in values))));
      } catch (error) {
        setSaveError(describeApiError(error));
      }
    },
    [readSettings, system, holdDrafts],
  );

  const commit = (key: string) => {
    const row = rows.find((candidate) => candidate.field.key === key);
    const draft = latestDrafts.current[key];
    if (!row || draft === undefined || draft === row.field.value || isNotANumber(row, draft)) return;
    void save(row.scope, { [key]: draft === '' ? null : draft });
  };

  // Text that is not a number is held in its box, not saved: leaving the category or the page asks before it is dropped (#3877 N6).
  const held = rows.some((row) => isNotANumber(row, drafts[row.field.key]));
  useUnsavedDraft('audacity-backups', { dirty: held, label: 'a backups value that is not a number', discard: () => holdDrafts({}) });

  if (!loadError && !hasBackups(caps)) return null;
  const support = caps?.capabilities['backups'];
  return (
    <BackupsView
      daw={caps?.daw ?? ''}
      reason={support && !support.available ? (support.message ?? '') : undefined}
      loadError={loadError}
      onRetry={() => setAttempt((n) => n + 1)}
      rows={rows}
      drafts={drafts}
      onChange={(key, value) => holdDrafts({ ...latestDrafts.current, [key]: value })}
      onCommit={commit}
      onClearOverride={(key) => void save('project', { [key]: null })}
      saveError={saveError}
    />
  );
}
