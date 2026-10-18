import type { ComponentType } from 'react';
import { ReaderTextRowBody, ThemeRowBody, ZoomRowBody } from './AppearanceBodies';
import { CreditsRowBody } from './CreditsBody';
import { ManuscriptRowBody, MarksRowBody, ProjectDataRowBody, StoryBibleTypesRowBody } from './ProjectBodies';
import { ShortcutsRowBody } from './ShortcutsBody';

/** Bodies for Project, Appearance & keys and App & updates rows, by registry row id. (App & updates draws its version and update check as `AboutSection`.) */
export const PROJECT_CONTROLS: Record<string, ComponentType> = {
  'project.manuscript': ManuscriptRowBody,
  'project.types': StoryBibleTypesRowBody,
  'project.marks': MarksRowBody,
  'project.credits': CreditsRowBody,
  'project.data': ProjectDataRowBody,
  'look.theme': ThemeRowBody,
  'look.reader': ReaderTextRowBody,
  'look.zoom': ZoomRowBody,
  'keys.map': ShortcutsRowBody,
};
