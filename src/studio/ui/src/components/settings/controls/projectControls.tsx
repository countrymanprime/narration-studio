import type { ComponentType } from 'react';
import { MotionRowBody, ReaderFontBody, ReaderSizeBody, ReaderSpacingBody, ReaderWidthBody, ThemeRowBody, ZoomRowBody } from './AppearanceBodies';
import { CreditsRowBody } from './CreditsBody';
import { ManuscriptRowBody, MarksRowBody, ProjectDataRowBody, StoryBibleDataRowBody, StoryBibleTypesRowBody } from './ProjectBodies';
import { ShortcutsRowBody } from './ShortcutsBody';

/** Bodies for Project, Appearance & keys and App & updates rows, by registry row id. (App & updates draws its version and update check as `AboutSection`.) */
export const PROJECT_CONTROLS: Record<string, ComponentType> = {
  'project.manuscript': ManuscriptRowBody,
  'project.types': StoryBibleTypesRowBody,
  'project.bibleData': StoryBibleDataRowBody,
  'project.marks': MarksRowBody,
  'project.credits': CreditsRowBody,
  'project.data': ProjectDataRowBody,
  'look.theme': ThemeRowBody,
  'look.motion': MotionRowBody,
  'look.reader': ReaderFontBody,
  'look.readerSize': ReaderSizeBody,
  'look.readerSpacing': ReaderSpacingBody,
  'look.readerWidth': ReaderWidthBody,
  'look.zoom': ZoomRowBody,
  'keys.map': ShortcutsRowBody,
};
