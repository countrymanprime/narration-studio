// The `storybible` rows of STATE_CATALOG (see state-catalog.ts), in the order they are captured.
import type { StateEntry } from '../lib/types';
import { KEEPS_DESKTOP_SCROLL } from './shared';

export const storybibleStates: StateEntry[] = [
  // Story Bible
  {
    page: 'storybible',
    state: 'rebuild-running',
    description: 'Story Bible, a rebuild still running: its dialog says the step cannot be cancelled but can go on in the background (?mockRebuildRunning=1)',
  },
  {
    page: 'storybible',
    state: 'entry-saving',
    description: 'Story Bible, an entry being saved: the Save button is busy and the other actions are off (?mockHoldEdits=1)',
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
  { page: 'storybible', state: 'category-all', description: 'Story Bible, the kind chip All on: every entry as a two-line row with its type colour' },
  { page: 'storybible', state: 'category-character', description: 'Story Bible, the Character kind chip on' },
  { page: 'storybible', state: 'category-place', description: 'Story Bible, the Place kind chip on' },
  { page: 'storybible', state: 'category-organization', description: 'Story Bible, the Organization kind chip on' },
  { page: 'storybible', state: 'search-narrowed', description: 'Story Bible, a search for "hatter" narrowing the list by name and by alias' },
  { page: 'storybible', state: 'no-manuscript', description: 'Story Bible, a project with no manuscript: the page asks for one (?mockNoManuscript=1)' },
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
    description: 'Story Bible, the inline error with Retry when the entities could not be read; navigation still works',
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

  // Voice samples (phase 4 of docs/prds/character-voice-samples.prd.md): the entry's section and the Voice data panel's lists, with samples seeded by
  // `?mockVoiceSamples=bible` (a Queen with four samples, one whose passage changed and one whose audio file is missing; the Hatter's one; Narration's
  // one; one whose character left the Story Bible) or `full` (a Queen at the 20 a character may have). The playing state moves with the audio, so it has
  // Vitest and a story and no row.
  {
    page: 'storybible',
    state: 'voice-samples-entry',
    description:
      'Story Bible, the locked Queen of Hearts entry with four voice samples above Reference clips: the primary with its star, Passage changed, Audio file missing, each with where it came from and Open in Editing (?mockVoiceSamples=bible)',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'storybible',
    state: 'voice-samples-empty',
    description: 'Story Bible, an entry with no voice sample: how to mark one and Open Editing (?mockVoiceSamples=bible, Alice)',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'storybible',
    state: 'voice-samples-limit',
    description: 'Story Bible, the Queen of Hearts at the 20 voice samples a character may have: the section says so (?mockVoiceSamples=full)',
  },
  {
    page: 'storybible',
    state: 'voice-sample-rename',
    description: 'Story Bible, the Rename voice sample dialog: the label and the note, Cancel and Save (?mockVoiceSamples=bible)',
  },
  {
    page: 'storybible',
    state: 'voice-sample-move',
    description: 'Story Bible, the Move voice sample dialog: the character to move to with how many samples it has (?mockVoiceSamples=bible)',
  },
  {
    page: 'storybible',
    state: 'voice-sample-delete-confirm',
    description:
      'Story Bible, the Delete voice sample confirm: it names the sample and says its audio is removed and the recording is not touched (?mockVoiceSamples=bible)',
  },
  {
    page: 'storybible',
    state: 'voice-data-samples',
    description:
      'Story Bible, the Voice data slide-over with Narration voice samples, the totals against 200 MiB, Remove voice samples and Remove voice data, and the sample of a character who is no longer in the Story Bible (?mockVoiceSamples=bible)',
  },
  {
    page: 'storybible',
    state: 'remove-voice-samples-confirm',
    description: 'Story Bible, the Voice data slide-over with the Remove voice samples confirm open (destructive, project-wide) (?mockVoiceSamples=bible)',
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
  {
    page: 'storybible',
    state: 'loading',
    description:
      'Story Bible while the entries are still being read (?mockHold=entities): the title, buttons, tabs, search and kind chips as usual, grey blocks in the list and the detail pane, no "No entries match" sentence, and one polite "Reading the Story Bible…" status',
  },
  {
    page: 'storybible',
    state: 'series-tab-loading',
    description:
      'Story Bible, the Series tab while the series are still being read (?mockHold=series): the page and its tabs as usual and grey blocks in the tab, with one polite "Reading the series…" status',
  },
  {
    page: 'storybible',
    state: 'series-tab-load-failed',
    description:
      'Story Bible, the Series tab when the series cannot be read (?mockSeries=fails): the page and its tabs as usual and, in the tab, "This page could not be loaded" with the read\'s own sentence as an alert and a Retry button that reads the series again; no skeleton left behind',
  },
];
