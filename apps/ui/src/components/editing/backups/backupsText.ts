/** What the Backups tab and the backup step say (the Studio Next mock's BackupsTab.tsx, commands/backups.ts and EDIT_TEXT). */
export const BACKUPS_TEXT = {
  none: 'No backups yet.',
  off: 'Backups are off.',
  keep: 'Keep backups',
  window: 'Audio kept either side of a punch or an edit (s)',
  retention: 'Keep backups for (days)',
  restore: 'Put this back',
  kept: 'Kept',
  missing: 'Missing',
  selected: 'Selected',
} as const;

/** The edit stops with this when the audio could not be backed up first. */
export const NO_BACKUP = 'The audio could not be backed up, so nothing was changed.';

/** A backup asked for around a stretch with no words of the script in it. */
export const NO_WORDS = 'There are no words of the script there to back up around.';

/** The settings could not be read, so the controls stay off. */
export const NO_SETTINGS = 'The backup settings could not be read.';

/** "Put back Oct 12": the status of a backup that has been restored. */
export const putBackOn = (date: string): string => `Put back ${date}`;

/** The toast after a restore: the DAW's sentence, then where it is undone, since the app cannot undo it (the undo-inverse table, row 1). */
export const restoredText = (message: string, dawName: string): string => `${message} This cannot be undone here: undo it in ${dawName}.`;

/** When a backup was made or put back, as the mock shows it: "Oct 12". */
export const dayOf = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
