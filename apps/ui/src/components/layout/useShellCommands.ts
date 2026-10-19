import { useEffect, useRef } from 'react';
import { registerCommandProvider, type ProvidedCommand } from '../../input/commandProviders';
import { ZOOM_STEPS } from '../../hooks/useZoom';
import { CATEGORIES } from '../settings/registry/categories';

export type ShellCommandsInput = {
  hasManuscript: boolean;
  /** Opens Settings, on a category when given. */
  openSettings: (categoryId?: string) => void;
  /** Opens the page where a manuscript is imported (Production, whose empty state holds the choose button). */
  importManuscript: () => void;
  darkTheme: boolean;
  toggleTheme: () => void;
  zoomPercent: number;
  setZoom: (factor: number) => void;
  /** The journal's newest entry label; absent when there is nothing to undo. */
  undoLabel?: string;
  undo: () => void;
};

/**
 * Registers the jump menu commands the shell owns that no page does, as the Studio Next mock lists them (`app/commands.ts`): one "Settings: <category>"
 * for each category, Import and Replace manuscript, the theme toggle, "Set zoom to N%" for each of the host's zoom steps, and "Undo: <last change>"
 * (docs/architecture/studio-shell-and-registries.md#command-providers-and-go-to). The latest input is read each time the menu opens, so a new
 * object never re-registers the provider. The mock's 80 and 90% steps are not here: the host snaps zoom to `ZOOM_STEPS`, which starts at 100%.
 */
export function useShellCommands(input: ShellCommandsInput): void {
  const latest = useRef(input);
  latest.current = input;

  useEffect(
    () =>
      registerCommandProvider(() => {
        const { hasManuscript, openSettings, importManuscript, darkTheme, toggleTheme, zoomPercent, setZoom, undoLabel, undo } = latest.current;
        const commands: ProvidedCommand[] = [
          ...CATEGORIES.map((category) => ({
            id: `settings.category.${category.id}`,
            group: 'Settings',
            label: `Settings: ${category.label}`,
            hint: 'settings',
            run: () => openSettings(category.id),
          })),
          {
            id: 'manuscript.import',
            group: 'Manuscript',
            label: 'Import manuscript…',
            disabledReason: hasManuscript ? 'This project has a manuscript: use Replace manuscript…' : undefined,
            run: importManuscript,
          },
          {
            id: 'manuscript.replace',
            group: 'Manuscript',
            label: 'Replace manuscript…',
            disabledReason: hasManuscript ? undefined : 'There is no manuscript to replace: use Import manuscript…',
            // Replace lives in Settings' Project category, with the confirmation of what it clears.
            run: () => openSettings('project'),
          },
          { id: 'view.theme', group: 'View', label: 'Toggle dark theme', hint: darkTheme ? 'dark now' : 'light now', run: toggleTheme },
          ...ZOOM_STEPS.map((factor) => {
            const percent = Math.round(factor * 100);
            return {
              id: `zoom.set.${percent}`,
              group: 'Zoom',
              label: `Set zoom to ${percent}%`,
              hint: 'zoom',
              disabledReason: percent === zoomPercent ? `Already ${percent}%` : undefined,
              run: () => setZoom(factor),
            };
          }),
          {
            id: 'undo.labelled',
            group: 'Edit',
            label: undoLabel ? `Undo: ${undoLabel}` : 'Undo',
            hint: 'Ctrl Z',
            disabledReason: undoLabel ? undefined : 'Nothing to undo',
            run: undo,
          },
        ];
        return commands;
      }),
    [],
  );
}
