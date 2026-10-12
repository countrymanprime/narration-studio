import type { ReactNode } from 'react';
import type { DawBackup } from '../../../api/contracts/daw';
import { Checkbox } from '../../primitives/Checkbox';
import { IconButton } from '../../primitives/IconButton';
import { NumberInput } from '../../primitives/NumberInput';
import { SectionLabel } from '../../primitives/SectionLabel';
import { clock } from '../bar/clock';
import { BACKUPS_TEXT, dayOf } from './backupsText';
import type { BackupsGate } from './useBackups';
import type { BackupSettingsState } from './useBackupSettings';

const Fact = ({ name, children }: { name: string; children: ReactNode }) => (
  <div className="flex justify-between gap-2">
    <span className="text-[var(--text-muted)]">{name}</span>
    <span>{children}</span>
  </div>
);

const MONO = "font-['IBM_Plex_Mono',ui-monospace,monospace]";

/**
 * The backup settings: whether to keep them, how much audio each one clones either side of the change, and how long they are kept; then the
 * backup picked in the list, with Put this back. The limits of each number are the settings' own.
 */
export function BackupsInspector({
  settings,
  gate,
  backup,
  chapterName,
  total,
  onRestore,
}: {
  settings: Pick<BackupSettingsState, 'settings' | 'error' | 'setKeep' | 'setWindow' | 'setRetention'>;
  gate: BackupsGate;
  backup: DawBackup | null;
  chapterName: string;
  /** The chapter's length, in seconds. */
  total: number;
  onRestore: (id: string) => void;
}) {
  const s = settings.settings;
  const reason = gate.ok ? undefined : gate.reason || BACKUPS_TEXT.off;
  return (
    <section aria-label="Backup settings" className="flex flex-col gap-3">
      <h3 className="m-0 font-['Barlow_Condensed',sans-serif] text-lg font-semibold">Backups</h3>
      {s ? (
        <>
          <Checkbox checked={s.keep} onChange={settings.setKeep}>
            {BACKUPS_TEXT.keep}
          </Checkbox>
          {!s.keep ? (
            <p id="bknote" className="m-0 text-[length:var(--font-size-sm)] text-[var(--text-muted)]">
              {reason ?? BACKUPS_TEXT.off}
            </p>
          ) : null}
          <label className="flex items-center justify-between gap-2 text-sm">
            <span>{BACKUPS_TEXT.window}</span>
            <NumberInput
              data-bkwin
              label={BACKUPS_TEXT.window}
              value={s.window.value}
              min={s.window.min}
              max={s.window.max}
              step={s.window.step}
              onValueChange={settings.setWindow}
            />
          </label>
          <label className="flex items-center justify-between gap-2 text-sm">
            <span>{BACKUPS_TEXT.retention}</span>
            <NumberInput
              data-bkkeep
              label={BACKUPS_TEXT.retention}
              value={s.retention.value}
              min={s.retention.min}
              max={s.retention.max}
              step={s.retention.step}
              onValueChange={settings.setRetention}
            />
          </label>
        </>
      ) : (
        <p className="m-0 text-[length:var(--font-size-sm)] text-[var(--text-muted)]">{settings.error}</p>
      )}
      {backup ? (
        <>
          <SectionLabel>{BACKUPS_TEXT.selected}</SectionLabel>
          <div className="flex flex-col gap-1 text-sm">
            <Fact name="Chapter">{chapterName}</Fact>
            <Fact name="What">{backup.label ?? ''}</Fact>
            <Fact name="Covers">
              <span className={MONO}>
                {clock(backup.start)}–{clock(backup.end)} of {clock(total)}
              </span>
            </Fact>
            <Fact name="Made">
              <span className={MONO}>{dayOf(backup.createdAt)}</span>
            </Fact>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex-1" />
            <IconButton action="undo" label={BACKUPS_TEXT.restore} data-bkput disabledReason={reason} onClick={() => onRestore(backup.id)} />
          </div>
        </>
      ) : null}
    </section>
  );
}
