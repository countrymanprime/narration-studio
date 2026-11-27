import { readProjectStorage, writeProjectStorage } from '../../../projectFolder';
import { CATEGORIES } from '../registry/categories';
import type { CategoryId } from '../registry/types';

// The category the narrator last had open in Settings, per project: opening Settings with no link asking for a category returns to it (#4099), as Editing and the Booth return to
// their chapter. A per-viewer convenience in browser storage under its own key, never a host field; the helpers guard storage that is missing, full or blocked.
const PROJECT_KEY = 'settings.lastCategory';

/** The category Settings last showed for this project, or undefined when none is kept, no project is open, or the kept one is no category of this build. */
export function loadSettingsCategory(projectFolder: string): CategoryId | undefined {
  const kept = readProjectStorage(PROJECT_KEY, projectFolder);
  return CATEGORIES.find((category) => category.id === kept)?.id;
}

/** Remembers the category Settings is on. A failed write only means it is not kept past this visit. */
export function saveSettingsCategory(projectFolder: string, id: CategoryId): void {
  writeProjectStorage(PROJECT_KEY, projectFolder, id);
}
