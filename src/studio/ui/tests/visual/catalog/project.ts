// The `project` rows of STATE_CATALOG (see state-catalog.ts), in the order they are captured.
import type { StateEntry } from '../lib/types';

export const projectStates: StateEntry[] = [
  // Project (pre-app: no project folder attached yet)
  {
    page: 'project',
    state: 'picker-empty',
    description:
      'No project open yet - ProjectPicker with the mark, the New project action, Open folder…, the recent-projects list (Open and Remove on each row)',
  },
  {
    page: 'project',
    state: 'new-project-dialog',
    description: 'New project opened from the picker - the New Project dialog showing the real default projects folder and the name rules',
  },
  {
    page: 'project',
    state: 'picker-removed',
    description: 'A recent project removed - the row is gone and the toast says its files are kept, with Undo',
  },
  {
    page: 'project',
    state: 'picker-pinned',
    description: 'A recent project pinned - its row moves under a Pinned heading above Recent and its pin toggle reads pressed',
  },
  {
    page: 'project',
    state: 'picker-daw-running',
    description:
      'REAPER running with a project linked to a recent project (?mockNoProject=1&mockDawRunning=1) - the banner above the list names it and its row is marked Open in REAPER now',
  },
  {
    page: 'project',
    state: 'picker-no-recents',
    description: 'Every recent project removed - the list says there are none and offers New project in it; Open folder… stays',
  },
];
