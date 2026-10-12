import { useCallback, useEffect, useState } from 'react';
import type { DawCapabilities } from '../../api/contracts/daw';
import { describeApiError } from '../../api/errorMessage';
import { usePort } from '../../ports/usePort';
import type { Scope, ScopedSettingField } from '../../types';
import { Button } from '../primitives/Button';
import { SectionLabel } from '../primitives/SectionLabel';
import { numberProblem } from './numberSetting';
import { ScopedSetting } from './ScopedSetting';

const TOOL = 'DAW';
const WINDOW_KEY = 'backups.window_seconds';
const RETENTION_KEY = 'backups.retention_days';
const KEYS = [WINDOW_KEY, RETENTION_KEY];

/** One backups setting at the layer in force: the project's override when it has one, else Global. */
export type BackupsRow = { field: ScopedSettingField; scope: Scope };

/** Whether the DAW has backups at all: a Supported or Experimental `backups` row. REAPER's Not yet available and the built-in recorder's Unsupported have none. */
function hasBackups(caps: DawCapabilities | undefined): boolean {
  const level = caps?.capabilities['backups']?.level;
  return level === 'supported' || level === 'experimental';
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "about 2 minutes either side" for 120 s: whole minutes from a minute up, seconds below. */
function windowWords(seconds: number): string {
  return `about ${seconds >= 60 ? plural(Math.round(seconds / 60), 'minute') : plural(seconds, 'second')} either side`;
}

/** The value a row stands for: the edit when it is a valid number, else what is in force. */
function shown(row: BackupsRow, draft: string | undefined): number {
  const valid = draft !== undefined && draft !== '' && row.field.number && !numberProblem(row.field.number, draft);
  return Number(valid ? draft : row.field.effectiveValue);
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
          {onRetry && (
            <Button variant="secondary" type="button" onClick={onRetry}>
              Retry
            </Button>
          )}
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
 * Settings > DAW: Backups (SNM-3b). Drawn only when the DAW reports the `backups` capability as Supported or Experimental; when it
 * is there but unavailable (turned off, the DAW not running) the capability's own sentence stands in for the rows. The window
 * either side of an edit and the retention are the DAW tool's two number settings (ADR 0863), edited through `ScopedSetting` and
 * saved when a box is left, at the layer the value comes from, with the store's own range check. It takes no props, so a Settings
 * page mounts it as `<BackupsSection />`. The report is read when it mounts, as the Editing drawer reads it.
 */
export function BackupsSection() {
  const daw = usePort('daw');
  const system = usePort('system');
  const [caps, setCaps] = useState<DawCapabilities>();
  const [rows, setRows] = useState<BackupsRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [attempt, setAttempt] = useState(0);

  const readSettings = useCallback(async () => {
    const [global, project] = await Promise.all([system.settingsForScope('global'), system.settingsForScope('project')]);
    setRows(rowsOf(global[TOOL] ?? [], project[TOOL] ?? []));
    setDrafts({});
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
      } catch (error) {
        setSaveError(describeApiError(error));
      }
    },
    [readSettings, system],
  );

  const commit = (key: string) => {
    const row = rows.find((candidate) => candidate.field.key === key);
    const draft = drafts[key];
    if (!row || draft === undefined || draft === row.field.value) return;
    if (row.field.number && numberProblem(row.field.number, draft)) return;
    void save(row.scope, { [key]: draft === '' ? null : draft });
  };

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
      onChange={(key, value) => setDrafts((current) => ({ ...current, [key]: value }))}
      onCommit={commit}
      onClearOverride={(key) => void save('project', { [key]: null })}
      saveError={saveError}
    />
  );
}
