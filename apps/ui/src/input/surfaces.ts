import { COMMAND_CATALOG, type CommandDescriptor, type CommandSurface } from './commands.catalog';

export type Surface = CommandSurface;

/**
 * The static rows shown on one surface, in catalogue order (ADR 0780 decision 1). The jump menu, the shortcut sheet and
 * the Settings key list read this instead of filtering the catalogue themselves, so a row added with `surfaces` shows on
 * all of them with no other edit. Provided commands are jump menu only and live in `commandProviders.ts`.
 *
 * `catalog` defaults to the real one; a test passes a copy with a fake row.
 */
export function commandsFor(surface: Surface, catalog: readonly CommandDescriptor[] = COMMAND_CATALOG): CommandDescriptor[] {
  return catalog.filter((command) => command.surfaces?.includes(surface));
}
