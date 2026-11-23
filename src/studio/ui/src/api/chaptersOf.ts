import type { ManuscriptChapter, ManuscriptChapterList } from './contracts/manuscript';
import { DEFAULT_PROJECT_FOLDER } from './mockHost/project';

/**
 * The host's chapter list answer for tests, stories and fixtures: the chapters with the project they were read from (#4040). Without a project it is the
 * mock host's default folder, which is what `createMockApi()` stamps; a harness that names another folder passes it and seeds the mock with the same one.
 */
export const chaptersOf = (chapters: readonly ManuscriptChapter[], project: string = DEFAULT_PROJECT_FOLDER): ManuscriptChapterList => ({
  project,
  chapters: [...chapters],
});
