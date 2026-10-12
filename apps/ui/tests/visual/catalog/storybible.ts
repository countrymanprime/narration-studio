// The `storybible` rows of STATE_CATALOG (see state-catalog.ts), in the order they are captured.
import type { StateEntry } from '../lib/types';
import { KEEPS_DESKTOP_SCROLL } from './shared';

export const storybibleStates: StateEntry[] = [
  // Story Bible
  {
    page: 'storybible',
    state: 'rebuild-running',
    description:
      'Story Bible, a rebuild still running: its dialog says the step cannot be cancelled but can go on in the background (ADR 0076, ?mockRebuildRunning=1)',
  },
  {
    page: 'storybible',
    state: 'entry-saving',
    description: 'Story Bible, an entry being saved: the Save button is busy and the other actions are off (ADR 0075, ?mockHoldEdits=1)',
  },
  {
    page: 'storybible',
    state: 'language-model-confirm',
    description:
      'Story Bible, the first-use question before the language model is downloaded: what it is, its sizes and where it goes, with Download, Build with rules-only and Cancel (?mockAssets=missing)',
  },
  {
    page: 'storybible',
    state: 'language-model-progress',
    description: 'Story Bible, the language model download with real bytes, 39 percent and Cancel (?mockAssets=downloading)',
  },
  {
    page: 'storybible',
    state: 'voice-download-confirm',
    description: 'Story Bible, the first-use question before the local preview voice is downloaded: what it is, its size, publisher and licence',
  },
  {
    page: 'storybible',
    state: 'voice-download-progress',
    description: 'Story Bible, the voice download with real bytes, 39 percent and Cancel (?mockAssets=downloading)',
  },
  {
    page: 'storybible',
    state: 'voice-download-failed',
    description: 'Story Bible, the voice download after it failed: the reason as an alert and Close (?mockAssets=download-fails)',
  },
  {
    page: 'storybible',
    state: 'review-filter',
    description:
      "Story Bible, the Needs review chip on: the entries the host flagged or that have a suggestion to verify with their Verify or Review pill, and the selected entry with its own and its name's flags and Mark reviewed off until its two suggestions are decided",
  },
  { page: 'storybible', state: 'category-all', description: 'Story Bible, All category tab' },
  { page: 'storybible', state: 'category-character', description: 'Story Bible, Character category tab' },
  { page: 'storybible', state: 'category-place', description: 'Story Bible, Place/Location category tab' },
  { page: 'storybible', state: 'category-organization', description: 'Story Bible, Organization category tab' },
  { page: 'storybible', state: 'category-needs-review', description: 'Story Bible, Needs Review category tab', ...KEEPS_DESKTOP_SCROLL },
  {
    page: 'storybible',
    state: 'entity-selected',
    description: 'Story Bible, an entity selected (detail panel open)',
    sameAs: { of: 'storybible/category-all', reason: 'Story Bible opens on All with the first entity already selected.' },
  },
  { page: 'storybible', state: 'alias-typeahead', description: 'Story Bible, alias-typeahead dropdown open' },
  { page: 'storybible', state: 'delete-confirm', description: 'Story Bible, delete confirm dialog open' },
  { page: 'storybible', state: 'entry-locked', description: 'Story Bible, a locked entry' },
  {
    page: 'storybible',
    state: 'entry-unlocked',
    description: 'Story Bible, an unlocked entry (read-only until Edit)',
    sameAs: { of: 'storybible/entity-selected', reason: 'The fixture entity a fresh selection lands on is unlocked, so selecting it is this state.' },
  },
  { page: 'storybible', state: 'entry-editing', description: 'Story Bible, an unlocked entry in edit mode (Save and Cancel shown)' },
  {
    page: 'storybible',
    state: 'entry-properties-editing',
    description: 'Story Bible, an entry in edit mode with its properties table: a new row with a value and no name, and the message that says so',
    ...KEEPS_DESKTOP_SCROLL,
  },
  { page: 'storybible', state: 'entry-needs-review', description: 'Story Bible, a Needs Review entry with review-colored evidence highlights' },
  {
    page: 'storybible',
    state: 'entry-pronunciation-missing',
    description:
      'Story Bible, an entry with no pronunciation in edit mode: each name a row with its "How I say" field and source tag (SN-B22), Play disabled with a reason',
  },
  {
    page: 'storybible',
    state: 'entry-names-own-pronunciation',
    description:
      "Story Bible, an entry in edit mode after the narrator typed their own pronunciation of its first name: the source tag reads Entered by me, the dictionary's answer kept as the alternate",
  },
  {
    page: 'storybible',
    state: 'entry-pronunciation-online',
    description: "Story Bible, a name's Look up elsewhere after Look up online: Merriam-Webster's respelling with Use this, on the narrator's own key",
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'storybible',
    state: 'alias-pronunciation-editing',
    description: 'Story Bible, an entry in edit mode with an alias’s own pronunciation typed: each alias its own row, independent of the first name',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'storybible',
    state: 'verification-filter',
    description:
      'Story Bible, Needs verification on: the suggestions not in the Story Bible yet listed above the entries, each with its kind and confidence, and only the entries with something to verify (SN-X42)',
  },
  {
    page: 'storybible',
    state: 'loose-suggestion',
    description: 'Story Bible, a suggestion with no entry yet chosen from the list: its row with the quote, the confidence chip and Accept, Edit and Reject',
  },
  {
    page: 'storybible',
    state: 'entry-suggestions',
    description: 'Story Bible, an entry with suggestions to verify: its Verify pill, its accepted claims and its Suggested list (SN-X41)',
    ...KEEPS_DESKTOP_SCROLL,
  },
  { page: 'storybible', state: 'import-dialog', description: 'Story Bible, the Import entries dialog (CSV or JSON, SN-X522)' },

  {
    page: 'storybible',
    state: 'invalid-payload',
    description: 'Story Bible, the inline error with Retry when the entities could not be read; navigation still works (ADR 0069)',
  },

  // Character bible, the non-acoustic part only: there are no findings, drift comparison or audition states here.
  {
    page: 'storybible',
    state: 'character-voice-references',
    description:
      'Story Bible, a Character entry: Reference clips (an approved reference, one flagged changed since approval, approve-a-region picker) and Dialogue cues (an unattributed cue with its speaker correction control)',
  },
  {
    page: 'storybible',
    state: 'voice-data-panel',
    description: 'Story Bible, the Voice data slide-over from the toolbar: approving a reference for plain Narration and the Remove voice data action',
  },
  {
    page: 'storybible',
    state: 'remove-voice-data-confirm',
    description: 'Story Bible, the Voice data slide-over with the Remove voice data confirm dialog open (destructive, project-wide)',
  },

  // Series tab (a tab, with no nav entry of its own; non-acoustic only: reference clips and their source book, no
  // per-book drift evidence).
  {
    page: 'storybible',
    state: 'series-tab-empty',
    description: 'Story Bible, the Series tab for a project outside any series: the honest empty state and Create series (?mockSeries=not-in-series)',
  },
  {
    page: 'storybible',
    state: 'series-tab-populated',
    description:
      'Story Bible, the Series tab with a two-book series: characters grouped across books with their approved reference clips, each labeled by its source book',
  },
];
