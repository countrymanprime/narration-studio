/**
 * The icon vocabulary as data (ADR 0761 A16, SNF-Q1): an action name to the icon that draws it and the tooltip that
 * names it, from `icon-audit.md` sections 5 and 6 of the Studio Next mock. The key is the action, never the glyph, so
 * two pages that ask for "markDone" cannot draw it differently. `Icon` and `IconButton` read it; `icons.catalog.test.ts`
 * checks it.
 *
 * Add-only: a page slice that needs an action appends a row and touches no other. A concept with no unambiguous icon is a
 * `text` row (audit rule 6). A page icon may be worn by a `pageLink` row ("Open in Script") and by nothing else (rule 1).
 */
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faArrowLeft,
  faArrowRight,
  faArrowUpRightFromSquare,
  faBackwardStep,
  faBook,
  faBookmark,
  faBookOpen,
  faCalendarDays,
  faCaretDown,
  faCheck,
  faChevronDown,
  faChevronUp,
  faCircle,
  faCircleCheck,
  faClockRotateLeft,
  faCopy,
  faDownload,
  faEarListen,
  faEye,
  faEyeSlash,
  faFileExport,
  faFileImport,
  faFileLines,
  faFlag,
  faFolderOpen,
  faFont,
  faForwardStep,
  faGauge,
  faGear,
  faGlobe,
  faHighlighter,
  faHouse,
  faLayerGroup,
  faListOl,
  faListUl,
  faLocationCrosshairs,
  faMagnifyingGlass,
  faMagnifyingGlassMinus,
  faMagnifyingGlassPlus,
  faMicrophone,
  faMicrophoneLines,
  faMoon,
  faPen,
  faPlay,
  faPause,
  faAngleLeft,
  faAngleRight,
  faPlus,
  faRotate,
  faRotateLeft,
  faScissors,
  faSliders,
  faStop,
  faSun,
  faTableColumns,
  faThumbtack,
  faTrashCan,
  faComment,
  faUpRightAndDownLeftFromCenter,
  faUpload,
  faVolumeHigh,
  faWandMagicSparkles,
  faWaveSquare,
  faXmark,
  faListCheck,
} from '@fortawesome/free-solid-svg-icons';
import { faCircleCheck as faCircleCheckRegular } from '@fortawesome/free-regular-svg-icons';

/** `page` is a rail or navigation icon, `pageLink` a button that opens that page, `action` anything else. A `text` row has no icon. */
type CatalogKind = 'page' | 'pageLink' | 'action';

type CatalogFields = {
  /** What the control does, in words. Two rows that wear one icon must share it (an alias); `page:<name>` for a page and its links. */
  meaning: string;
  /** Sentence case, verb first, no full stop. The shortcut is not written here. */
  tooltip: string;
  /** Shown in parentheses after the tooltip. */
  shortcut?: string;
};

type IconRow = CatalogFields & { kind: CatalogKind; icon: IconDefinition };
type TextRow = CatalogFields & { kind: 'text'; icon: null };
export type CatalogRow = IconRow | TextRow;

const action = (icon: IconDefinition, meaning: string, tooltip: string, shortcut?: string): IconRow => ({ kind: 'action', icon, meaning, tooltip, shortcut });
const page = (icon: IconDefinition, name: string, tooltip: string): IconRow => ({ kind: 'page', icon, meaning: `page:${name}`, tooltip });
const pageLink = (icon: IconDefinition, name: string, tooltip: string): IconRow => ({ kind: 'pageLink', icon, meaning: `page:${name}`, tooltip });
const text = (meaning: string, tooltip: string): TextRow => ({ kind: 'text', icon: null, meaning, tooltip });

/** The first word of every tooltip. A page slice that needs another verb adds it here with its row. */
export const TOOLTIP_VERBS = [
  'Accept',
  'Add',
  'Cancel',
  'Check',
  'Clear',
  'Close',
  'Compare',
  'Copy',
  'Delete',
  'Dismiss',
  'Download',
  'Edit',
  'Export',
  'Find',
  'Go',
  'Hear',
  'Hide',
  'Import',
  'Jump',
  'Keep',
  'Look',
  'Manage',
  'Mark',
  'Open',
  'Pause',
  'Pin',
  'Play',
  'Record',
  'Reject',
  'Reopen',
  'Remove',
  'Retry',
  'Save',
  'Scan',
  'Show',
  'Stop',
  'Toggle',
  'Undo',
  'Unpin',
  'Use',
  'Zoom',
] as const;

export const CATALOG = {
  // Pages: the rail (audit section 5, "Go to page").
  home: page(faHouse, 'production', 'Open Production'),
  calendar: page(faCalendarDays, 'schedule', 'Open Schedule'),
  script: page(faFileLines, 'script', 'Open Script'),
  book: page(faBook, 'storyBible', 'Open Story Bible'),
  microphone: page(faMicrophone, 'booth', 'Open Booth'),
  scissors: page(faScissors, 'editing', 'Open Editing'),
  wave: page(faWaveSquare, 'proof', 'Open Proof'),
  pickups: page(faListCheck, 'pickups', 'Open Pickups'),
  gauge: page(faGauge, 'master', 'Open Master and QC'),
  delivery: page(faUpload, 'delivery', 'Open Delivery'),
  gear: page(faGear, 'settings', 'Open Settings'),

  // Buttons that open a page, wearing that page's icon and nothing else's.
  openInScript: pageLink(faFileLines, 'script', 'Open in Script'),
  openInStoryBible: pageLink(faBook, 'storyBible', 'Open in Story Bible'),
  openInBooth: pageLink(faMicrophone, 'booth', 'Open in Booth'),
  manageTakes: pageLink(faScissors, 'editing', 'Manage takes in Editing'),
  openSchedule: pageLink(faCalendarDays, 'schedule', 'Open the schedule'),

  // Finding and moving.
  find: action(faMagnifyingGlass, 'find', 'Find in the manuscript', 'Ctrl+F'),
  jumpTo: action(faMagnifyingGlass, 'find', 'Jump to a page or run a command', 'Ctrl+K'),
  locate: action(faLocationCrosshairs, 'locate in text', 'Show in text'),
  previous: action(faChevronUp, 'previous item', 'Go to the previous item'),
  next: action(faChevronDown, 'next item', 'Go to the next item'),
  previousChapter: action(faBackwardStep, 'previous chapter', 'Go to the previous chapter', 'Alt+Up'),
  nextChapter: action(faForwardStep, 'next chapter', 'Go to the next chapter', 'Alt+Down'),
  goTo: action(faArrowRight, 'go on', 'Go to the next step'),
  list: action(faListUl, 'show a list', 'Show the results'),
  chapters: action(faListOl, 'chapter list', 'Show the chapter list'),
  levels: action(faMicrophoneLines, 'recording levels', 'Show the recording levels'),
  sidePanel: action(faTableColumns, 'side panel', 'Toggle the side panel'),
  openFullApp: action(faUpRightAndDownLeftFromCenter, 'open the full app', 'Open the full app'),

  // Making and removing.
  add: action(faPlus, 'add', 'Add'),
  edit: action(faPen, 'edit', 'Edit'),
  close: action(faXmark, 'close', 'Close'),
  delete: action(faTrashCan, 'discard', 'Delete'),
  remove: action(faTrashCan, 'discard', 'Remove'),
  copy: action(faCopy, 'copy', 'Copy'),
  addNote: action(faComment, 'add a note', 'Add a note'),
  markText: action(faHighlighter, 'mark text', 'Mark the selected text'),

  // Audio.
  play: action(faPlay, 'play', 'Play', 'Space'),
  pause: action(faPause, 'pause', 'Pause', 'Space'),
  previousWord: action(faAngleLeft, 'previous word', 'Go to the previous word', 'Left'),
  nextWord: action(faAngleRight, 'next word', 'Go to the next word', 'Right'),
  stop: action(faStop, 'stop', 'Stop'),
  hear: action(faVolumeHigh, 'hear a reference', 'Hear the reference clip'),
  record: action(faCircle, 'record', 'Record my own clip'),
  zoomIn: action(faMagnifyingGlassPlus, 'zoom in', 'Zoom in'),
  zoomOut: action(faMagnifyingGlassMinus, 'zoom out', 'Zoom out'),
  checkRecordings: action(faEarListen, 'check recordings', 'Check recordings'),

  // State: outline is off, solid is on (audit rule 3).
  markDone: action(faCircleCheckRegular, 'mark done', 'Mark done'),
  keepTake: action(faCircleCheckRegular, 'mark done', 'Keep this take'),
  markedDone: action(faCircleCheck, 'marked done', 'Mark open again'),
  pin: action(faThumbtack, 'pin', 'Pin'),
  unpin: action(faThumbtack, 'pin', 'Unpin'),
  themeDark: action(faMoon, 'theme:dark', 'Use the dark theme'),
  themeLight: action(faSun, 'theme:light', 'Use the light theme'),

  // Files and the DAW.
  import: action(faFileImport, 'import', 'Import a file'),
  export: action(faFileExport, 'export', 'Export a file'),
  download: action(faDownload, 'download', 'Download'),
  openFolder: action(faFolderOpen, 'open a folder', 'Open the folder'),
  undo: action(faRotateLeft, 'undo', 'Undo', 'Ctrl+Z'),
  history: action(faClockRotateLeft, 'undo history', 'Open the undo history', 'Ctrl+Shift+H'),
  retry: action(faRotate, 'try again', 'Retry'),
  openInReaper: action(faArrowUpRightFromSquare, 'go to REAPER', 'Open in REAPER'),
  showInReaper: action(faArrowUpRightFromSquare, 'go to REAPER', 'Show in REAPER'),
  addMarker: action(faFlag, 'REAPER marker', 'Add a marker in REAPER'),

  // Script, Story Bible and the extraction tools (SN-B60): the actions those pages draw in the Studio Next mock. A catalogue key
  // is the action, so a row that wears an icon another action already wears shares that action's meaning (an alias).
  bookmark: action(faBookmark, 'bookmark', 'Add a bookmark here', 'B'),
  bookmarks: action(faBookmark, 'bookmark', 'Show the bookmarks'),
  textSettings: action(faFont, 'text settings', 'Edit the text settings'),
  openMenu: action(faCaretDown, 'open a menu', 'Open the menu'),
  incomingRelationship: action(faArrowLeft, 'incoming relationship', 'Show an incoming relationship'),
  showExample: action(faEye, 'show an example', 'Show the format example'),
  hideExample: action(faEyeSlash, 'hide an example', 'Hide the format example'),
  recordHere: action(faCircle, 'record', 'Record from here'),
  goToChapter: action(faArrowRight, 'go on', 'Go to the chapter'),
  addWord: action(faPlus, 'add', 'Add to my words'),
  addMark: action(faPlus, 'add', 'Add a mark'),
  addRelationship: action(faPlus, 'add', 'Add a relationship'),
  editBookmark: action(faPen, 'edit', 'Edit the bookmark'),
  editMessage: action(faPen, 'edit', 'Edit this message'),
  editSuggestion: action(faPen, 'edit', 'Edit this suggestion'),
  deleteBookmark: action(faTrashCan, 'discard', 'Delete the bookmark'),
  deleteNote: action(faTrashCan, 'discard', 'Delete the note'),
  deleteMessage: action(faTrashCan, 'discard', 'Delete the message'),
  deleteEntry: action(faTrashCan, 'discard', 'Delete this entry'),
  copyQuery: action(faCopy, 'copy', 'Copy the query'),
  copyPrompt: action(faCopy, 'copy', 'Copy the prompt for your own LLM'),
  copyExample: action(faCopy, 'copy', 'Copy the example'),
  recordInBooth: pageLink(faMicrophone, 'booth', 'Record in Booth'),
  addToStoryBible: pageLink(faBook, 'storyBible', 'Add to Story Bible'),
  // The mock draws accept as a check and reject, dismiss and cancel-a-download as an X (audit rule 4 asks for text on cancel; the mock wins, D98).
  accept: action(faCheck, 'accept', 'Accept this suggestion'),
  saveAndAccept: action(faCheck, 'accept', 'Save and accept'),
  markReviewed: action(faCircleCheckRegular, 'mark done', 'Mark reviewed'),
  reject: action(faXmark, 'close', 'Reject this suggestion'),
  dismiss: action(faXmark, 'close', 'Dismiss'),
  cancelEdit: action(faXmark, 'close', 'Cancel the edit'),
  cancelDownload: action(faXmark, 'close', 'Cancel the download'),
  // Where a pronunciation or an extracted suggestion came from (PronSource, Suggested, the Analysis tools list).
  sourceAuto: action(faWandMagicSparkles, 'source:rules', 'Use the automatic source'),
  sourceRules: action(faWandMagicSparkles, 'source:rules', 'Use the rules source'),
  sourceDictionary: action(faBookOpen, 'source:reference', 'Use the local dictionary'),
  sourceBookNlp: action(faBookOpen, 'source:reference', 'Use BookNLP'),
  sourceOnline: action(faGlobe, 'source:network', 'Use the online service'),
  sourceLocalModel: action(faGlobe, 'source:network', 'Use the local model'),
  sourceManual: action(faPen, 'edit', 'Use my own entry'),
  sourceImported: action(faFileImport, 'import', 'Use the imported file'),
  sourceGliner: action(faLocationCrosshairs, 'locate in text', 'Use GLiNER'),

  // Editing: the mock's sliders for effects, on Add FX and on the clean-up and effects drawer.
  addFx: action(faSliders, 'effects', 'Add FX', 'F'),
  cleanUpAndEffects: action(faSliders, 'effects', 'Show clean up and effects', 'Ctrl+Shift+C'),
  // The mock's wave is the Proof page's icon (audit rule 1), so the takes of a line wear the layers.
  showTakes: action(faLayerGroup, 'takes', 'Show the takes of this line', 'T'),

  // No unambiguous icon: text (audit rule 6).
  cancel: text('cancel', 'Cancel'),
  save: text('save', 'Save'),
  lookUp: text('look up', 'Look up'),
  compare: text('compare', 'Compare without and with the effect'),
  clearFilters: text('clear filters', 'Clear filters'),
  reopen: text('reopen', 'Reopen'),
  scan: text('scan', 'Scan the manuscript'),
  importFromFile: text('import from a file', 'Import from a file instead'),
} as const satisfies Record<string, CatalogRow>;

export type ActionName = keyof typeof CATALOG;
/** An action that is drawn as an icon. */
export type IconName = { [K in ActionName]: (typeof CATALOG)[K]['icon'] extends null ? never : K }[ActionName];

const NEUTRAL: IconName = 'list';

const hasIcon = (name: string): name is IconName => Object.hasOwn(CATALOG, name) && (CATALOG as Record<string, CatalogRow>)[name]!.icon !== null;

/** An icon by a name that comes from data (a source list); an unknown name falls back to the neutral key. */
export const iconNamed = (name: string): IconName => (hasIcon(name) ? name : NEUTRAL);

/** The Font Awesome definition a key draws. */
export const iconFor = (name: IconName): IconDefinition => CATALOG[name].icon;

export const tooltipWithShortcut = (row: CatalogRow): string => (row.shortcut ? `${row.tooltip} (${row.shortcut})` : row.tooltip);

/** The hint a button shows: the tooltip, then its shortcut in parentheses. */
export const tooltipFor = (name: ActionName): string => tooltipWithShortcut(CATALOG[name]);

/** The accessible name of a button: the tooltip without the shortcut, which a screen reader gets as `aria-keyshortcuts`. */
export const nameFor = (name: ActionName): string => CATALOG[name].tooltip;

const iconId = (icon: IconDefinition): string => `${icon.prefix === 'far' ? 'regular' : 'solid'}:${icon.iconName}`;

type Catalog = Record<string, CatalogRow>;

/** Icons worn by rows with different meanings (audit section 3a). */
export function findSharedIconConflicts(catalog: Catalog): { icon: string; keys: string[]; meanings: string[] }[] {
  const byIcon = new Map<string, { keys: string[]; meanings: Set<string> }>();
  for (const [key, row] of Object.entries(catalog)) {
    if (row.icon === null) continue;
    const entry = byIcon.get(iconId(row.icon)) ?? { keys: [], meanings: new Set<string>() };
    entry.keys.push(key);
    entry.meanings.add(row.meaning);
    byIcon.set(iconId(row.icon), entry);
  }
  return [...byIcon].filter(([, entry]) => entry.meanings.size > 1).map(([icon, entry]) => ({ icon, keys: entry.keys, meanings: [...entry.meanings] }));
}

/** Rows that wear a page's icon without opening that page (audit rule 1). */
export function findPageIconMisuse(catalog: Catalog): { key: string; icon: string; page: string }[] {
  const pages = new Map<string, { key: string; meaning: string }>();
  for (const [key, row] of Object.entries(catalog)) {
    if (row.kind === 'page' && row.icon !== null && !pages.has(iconId(row.icon))) pages.set(iconId(row.icon), { key, meaning: row.meaning });
  }
  const misuse: { key: string; icon: string; page: string }[] = [];
  for (const [key, row] of Object.entries(catalog)) {
    if (row.icon === null) continue;
    const owner = pages.get(iconId(row.icon));
    if (owner === undefined || owner.key === key) continue;
    if (row.kind === 'pageLink' && row.meaning === owner.meaning) continue;
    misuse.push({ key, icon: iconId(row.icon), page: owner.key });
  }
  return misuse;
}
