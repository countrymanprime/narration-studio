import type { SettingMeta } from './types';

/** What a row that needs a project says in place of its control while no project is open. */
export const NEEDS_PROJECT_REASON = 'Open a project to change this.';

/** What a panel that edits the computer's values and a project's says beside the computer's while no project is open. */
export const NEEDS_PROJECT_FOR_PROJECT = 'Open a project to set these for a project.';

/**
 * Rows whose scope is not `project` but whose control reads or writes the open project all the same: `project.credits` edits the templates
 * (the computer's) beside this project's values, and cannot read those with no project.
 */
const READS_THE_PROJECT: ReadonlySet<string> = new Set(['project.credits']);

/**
 * Whether a row can only be changed with a project open: its scope is the project's, or its control reads the project. With no project it is
 * drawn with `NEEDS_PROJECT_REASON` and its control disabled, never left out and never asked to read a project that is not there. A row a
 * project may override (`both`) is not one: its computer value is the row, and only the override waits for a project.
 */
export const needsProject = (row: Pick<SettingMeta, 'id' | 'scope'>): boolean => row.scope === 'project' || READS_THE_PROJECT.has(row.id);
