import { CHAPTER_SHAPES, type ChapterShape } from '../../fixtures/chapters';
import { makeScenario, SCENARIO_SIZES, type Scenario } from '../../fixtures/scenario';

// The groups of the dev-only Mock states panel, as data (docs/research/mockups/studio-next/src/app/mock-states.tsx draws the
// same idea). Every `params` entry is a URL parameter `main.tsx` reads once at boot; `mockStates.test.ts` scans `main.tsx`
// and fails when one is not read there. A slice that adds a `?mock...` parameter adds a row here.
export interface MockOption {
  value: string;
  label: string;
  /** The parameters this option sets. The default option sets none, so choosing it clears the group's parameters. */
  set: Readonly<Record<string, string>>;
}

export interface MockGroup {
  id: string;
  label: string;
  kind: 'radio' | 'checkbox';
  /** Every parameter the group owns; choosing an option clears them all, then writes the option's own. */
  params: readonly string[];
  options: readonly MockOption[];
}

const DEFAULT: MockOption = { value: 'default', label: 'Default', set: {} };

export const MOCK_GROUPS: readonly MockGroup[] = [
  {
    id: 'manuscript',
    label: 'Manuscript',
    kind: 'radio',
    params: ['mockNoManuscript'],
    options: [
      { ...DEFAULT, label: 'Manuscript present' },
      { value: 'none', label: 'No manuscript', set: { mockNoManuscript: '1' } },
    ],
  },
  {
    id: 'length',
    label: 'Book length',
    kind: 'radio',
    params: ['mockChapters'],
    options: [DEFAULT, ...SCENARIO_SIZES.map((size) => ({ value: String(size), label: `${size} chapters`, set: { mockChapters: String(size) } }))],
  },
  {
    id: 'headings',
    label: 'Chapter heading style',
    kind: 'radio',
    params: ['mockHeadings'],
    options: [DEFAULT, ...CHAPTER_SHAPES.map((shape) => ({ value: shape, label: shape, set: { mockHeadings: shape } }))],
  },
  {
    id: 'daw',
    label: 'DAW',
    kind: 'radio',
    params: ['mockDaw'],
    options: [
      { ...DEFAULT, label: 'REAPER' },
      { value: 'audacity', label: 'Audacity', set: { mockDaw: 'Audacity' } },
      // A fresh machine (REAPER not connected, no project file linked) with a DAW that moves like the host's (src/api/dawMock.ts): what REAPER does
      // once the app starts it. A driver plays the rest through window.__NARRATION_MOCK_DAW__.
      { value: 'live', label: 'Fresh machine: REAPER answers after the launch', set: { mockDaw: 'live' } },
      { value: 'late', label: 'Fresh machine: REAPER answers 8 s after the launch', set: { mockDaw: 'late' } },
      { value: 'quiet', label: 'Fresh machine: REAPER opens its bridge and never answers', set: { mockDaw: 'quiet' } },
      { value: 'different', label: 'Fresh machine: REAPER has another project open', set: { mockDaw: 'different' } },
      { value: 'refuse', label: 'Fresh machine: the launch is refused', set: { mockDaw: 'refuse' } },
      { value: 'restart', label: 'Fresh machine: REAPER answers, goes quiet, returns', set: { mockDaw: 'restart' } },
      { value: 'busy', label: 'Fresh machine: the busy app turns the project away', set: { mockDaw: 'busy' } },
    ],
  },
  {
    id: 'daw-project',
    label: 'DAW project',
    kind: 'radio',
    params: ['mockNoProject', 'mockNoDaw', 'mockDawMismatch', 'mockDawNotDetected'],
    options: [
      { ...DEFAULT, label: 'Project linked' },
      { value: 'no-project', label: 'No project folder', set: { mockNoProject: '1' } },
      { value: 'not-linked', label: 'No DAW project linked', set: { mockNoDaw: '1' } },
      { value: 'mismatch', label: 'Wrong project open', set: { mockDawMismatch: '1' } },
      { value: 'not-detected', label: 'DAW not detected', set: { mockDawNotDetected: '1' } },
    ],
  },
  {
    id: 'zoom',
    label: 'Zoom',
    kind: 'radio',
    params: ['mockZoom'],
    options: [
      { ...DEFAULT, label: '100%' },
      { value: '125', label: '125%', set: { mockZoom: '125' } },
    ],
  },
  {
    id: 'flags',
    label: 'Other states',
    kind: 'checkbox',
    params: ['mockDawExperimentalOn', 'mockNoDevices'],
    options: [
      { value: 'experimental', label: 'Experimental DAW capabilities on', set: { mockDawExperimentalOn: '1' } },
      { value: 'no-devices', label: 'No input devices', set: { mockNoDevices: '1' } },
    ],
  },
];

// An option is current when each parameter it sets is in the URL; a flag's `1` also matches the bare `?mockFlag`.
function isSet(params: URLSearchParams, name: string, value: string): boolean {
  return params.has(name) && (value === '1' || params.get(name) === value);
}

function matches(params: URLSearchParams, option: MockOption): boolean {
  const entries = Object.entries(option.set);
  return entries.length > 0 && entries.every(([name, value]) => isSet(params, name, value));
}

/** The option of a radio group the URL selects: the default one when none of the others is set. */
export function currentOption(group: MockGroup, search: string): MockOption {
  const params = new URLSearchParams(search);
  return group.options.find((option) => matches(params, option)) ?? group.options[0];
}

/** Whether a checkbox option is set in the URL. */
export function isOptionOn(option: MockOption, search: string): boolean {
  return matches(new URLSearchParams(search), option);
}

/** The query string after choosing `option` (or switching a checkbox `on`/off): the group's parameters cleared, the option's written, every other parameter kept. */
export function applyOption(search: string, group: MockGroup, option: MockOption, on = true): string {
  const params = new URLSearchParams(search);
  if (group.kind === 'checkbox') {
    for (const name of Object.keys(option.set)) params.delete(name);
  } else {
    for (const name of group.params) params.delete(name);
  }
  if (on) for (const [name, value] of Object.entries(option.set)) params.set(name, value);
  const next = params.toString();
  return next ? `?${next}` : '';
}

/**
 * `?mockChapters=40&mockHeadings=legacyNewline`: the scenario book for the mock API's seed (fixtures/scenario.ts). One valid
 * value is enough, the other takes its default; an unknown value is ignored, and with neither valid the default book boots.
 */
export function scenarioFromParams(params: URLSearchParams): Scenario | undefined {
  const chapters = SCENARIO_SIZES.find((size) => String(size) === params.get('mockChapters'));
  const shape: ChapterShape | undefined = CHAPTER_SHAPES.find((candidate) => candidate === params.get('mockHeadings'));
  if (chapters === undefined && shape === undefined) return undefined;
  return makeScenario({ shape: shape ?? CHAPTER_SHAPES[0], chapters: chapters ?? SCENARIO_SIZES[0] });
}
