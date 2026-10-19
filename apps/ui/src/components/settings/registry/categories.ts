import type { Category, CategoryGroup } from './types';

export const GROUPS: readonly CategoryGroup[] = ['Shared tools', 'This project', 'This computer'];

export const CATEGORIES: readonly Category[] = [
  { id: 'recording', label: 'Recording & DAW', group: 'Shared tools', icon: 'microphone', blurb: 'How the app records and talks to your recording program.' },
  {
    id: 'speech',
    label: 'Speech to text',
    group: 'Shared tools',
    icon: 'wave',
    blurb: 'The one transcription engine that Booth, the recording check, Proof and Pickups listen with.',
  },
  {
    id: 'voice',
    label: 'Voice & pronunciation',
    group: 'Shared tools',
    icon: 'hear',
    blurb: 'The voice that speaks previews, and where definitions and pronunciations come from.',
  },
  {
    id: 'models',
    label: 'Models & downloads',
    group: 'Shared tools',
    icon: 'download',
    blurb: 'Everything the app downloads, in one list. Pick which one is used in the section that uses it.',
  },
  {
    id: 'delivery',
    label: 'Delivery',
    group: 'Shared tools',
    icon: 'delivery',
    blurb: 'The standard this project is judged against, and the limits it carries.',
  },
  {
    id: 'project',
    label: 'Project',
    group: 'This project',
    icon: 'book',
    blurb: 'The manuscript, the Story Bible vocabulary, narrator and credits of the open project.',
  },
  {
    id: 'appearance',
    label: 'Appearance & keys',
    group: 'This computer',
    icon: 'appearance',
    blurb: 'How the app looks and which keys do what on this computer.',
  },
  { id: 'app', label: 'App & updates', group: 'This computer', icon: 'gear', blurb: 'Updates, notifications and diagnostics.' },
];

export const PAGES_CATEGORY = { id: 'pages', label: 'Set on a page', icon: 'openFullApp' } as const;

export const categoryLabel = (id: string): string => CATEGORIES.find((category) => category.id === id)?.label ?? PAGES_CATEGORY.label;
