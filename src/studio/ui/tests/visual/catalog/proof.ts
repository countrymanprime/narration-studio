// The `proof` rows of STATE_CATALOG: the Studio Next Proof page (see state-catalog.ts), in the order they are captured.
import type { StateEntry } from '../lib/types';
import { KEEPS_DESKTOP_SCROLL, POPUP_ANCHORED_AT_FIRST_WIDTH, REFLOW, wholePage } from './shared';

export const proofStates: StateEntry[] = [
  {
    page: 'proof',
    state: 'load-error',
    description:
      'Proof when the chapters it loads on opening could not be read (?mockInvalidPayload=manuscript): the title, "This page could not be loaded" with Retry; navigation still works',
    ...REFLOW,
  },
  {
    page: 'proof',
    state: 'loading',
    description:
      'Proof while the chapters are still being read (?mockChapters=loading): the Proof title and grey blocks where the chapter strip, the notes queue and the Inspector will be, with one polite "Reading the chapters and notes…" status',
    ...REFLOW,
  },
  {
    page: 'proof',
    state: 'inspector-repair-menu',
    description: 'Proof, a click note selected - Repair in REAPER in the inspector icon row, its menu open on Repair with Cleanup tools',
    ...REFLOW,
    ...POPUP_ANCHORED_AT_FIRST_WIDTH,
  },
  {
    page: 'proof',
    state: 'daw-tools-menu',
    description:
      'Proof, the DAW tools icon button at the end of the head opened on a linked chapter - the Structure heading over Prepare chapter render and Create chapter regions',
    ...REFLOW,
    ...POPUP_ANCHORED_AT_FIRST_WIDTH,
  },
  {
    page: 'proof',
    state: 'default',
    description:
      "Proof, all chapters (Studio Next mock): the head with the chapter stepper and the cleared ring, the chapter strip with each chapter's open notes, the notes queue (chips, sort, find, Check recordings, the proofer sheet icons, the Sources line, the table grouped by chapter), the Inspector on the first note and the key hints",
    ...REFLOW,
  },
  {
    page: 'proof',
    state: 'chapter',
    description:
      "Proof, Chapter 1 with its track linked (?mockChapterLink=confirmed): the recording check card, the waveform window with the note pins, the chapter's notes with the In view chip and a takes badge, and Esc All chapters in the key hints",
    ...REFLOW,
  },
  {
    page: 'proof',
    state: 'compare-open',
    description:
      'Proof, Chapter 1 linked, Compare with the script pressed beside Check recordings (#2822): the Compare panel under the check card with its Differences, Preview and Native takes tabs, on the comparison’s setup',
    ...REFLOW,
  },
  {
    page: 'proof',
    state: 'compare-preview',
    description: 'Proof, Chapter 1 linked, the Compare panel on its Preview tab (#2822): the same preview panel the chapter view draws',
    ...REFLOW,
  },
  {
    page: 'proof',
    state: 'chapter-no-recording',
    description:
      'Proof, Chapter 2 with no track linked: the check card with nothing recorded to check and why (Check recordings and Compare with the script both off), and no waveform under it',
    ...REFLOW,
  },
  {
    page: 'proof',
    state: 'takes-lanes',
    description:
      'Proof, Chapter 1 linked, on the misread at 00:12.4 whose spot has several takes: the playing take as a band on the trace, the other takes in their lanes under it, and the takes at this spot in the Inspector',
    ...REFLOW,
  },
  {
    page: 'proof',
    state: 'check-stale',
    description:
      'Proof, Chapter 4 whose stored recording check is stale (?mockCoverage=stale): the check card says what changed since and offers to check again',
    ...REFLOW,
  },
  {
    page: 'proof',
    state: 'retired-take-review-note',
    description:
      'Proof, Chapter 4 with a pickup the retired take review saved (?mockCoverage=pickups): a plain note with no time, listed under In view, worded as its group and typed Repeat, From Take review, with Show in REAPER, Hear it and Add marker off for the note having no time',
    ...REFLOW,
  },
  {
    page: 'proof',
    state: 'check-findings',
    description:
      'Proof, Chapter 1 linked, its recording check’s findings shown: a line said twice listed as Said twice with the words said again, Fix in edit and Open in Editing, above the gaps',
    ...REFLOW,
  },
  {
    page: 'proof',
    state: 'check-never',
    description: 'Proof, Chapter 7 never checked: the check card with no check yet and Check recordings',
    ...REFLOW,
  },
  {
    page: 'proof',
    state: 'check-recordings-dialog',
    description:
      "Proof, Chapter 4, the queue's Check recordings dialog before a run: the chapters to check and the shared options (speech model, larger model, chunk length, parallel processes, crossover, chapters at once)",
    ...REFLOW,
  },
  {
    page: 'proof',
    state: 'check-checking',
    description:
      "Proof, Chapter 4 while its recording check runs (?mockCoverage=hold-recheck, started from the queue's Check recordings): the Check recordings dialog running over the page, the card behind it in its checking state",
    ...REFLOW,
  },
  {
    page: 'proof',
    state: 'check-checking-none',
    description:
      'Proof, Chapter 4 while its recording check runs with nothing in doubt (?mockCoverage=hold-none): the activity panel shows the first pass done, workers idle and the Re-check figure reading "None needed"',
    ...REFLOW,
  },
  {
    page: 'proof',
    state: 'check-checking-all',
    description:
      'Proof, Chapter 4 while its recording check runs with so much in doubt that the larger model redoes whole recordings (?mockCoverage=hold-all): the activity panel shows the Re-check figure partway through every chunk',
    ...REFLOW,
  },
  {
    page: 'proof',
    state: 'check-finished',
    description:
      "Proof, Chapter 4 after its recording check ran to the end: the stopped activity box (Done, the final chunk and re-check counts, the clock stopped) above the chapter's result in the Check recordings dialog",
    ...REFLOW,
  },
  {
    page: 'proof',
    state: 'note-thread',
    description:
      "Proof, all chapters, the first note with a thread: a note of your own and a proofer's reply under Notes on this finding, with Proofer replied chosen for the next one",
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'proof',
    state: 'hear-it',
    description:
      'Proof, all chapters, Hear it pressed on the misread at 00:12.4 ("pink eyes"): Stop hearing it in the Inspector\'s row, "Playing in REAPER, 3 s either side" under it, and In the script with the note\'s paragraph, its words marked, between the paragraphs before and after',
    ...REFLOW,
  },
  {
    page: 'proof',
    state: 'treat-as-same',
    description:
      'Proof, a one-word misread selected (?mockFindings=misread: "Dinah" heard as "Dina"): the equals button after Add marker in the Inspector\'s row, with the keyboard focus on it (#2736; its tooltip is checked in TreatAsSame.test.tsx, since a portalled tooltip fails axe\'s region rule on a page capture)',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'proof',
    state: 'treat-as-same-added',
    description:
      'Proof, the equals button pressed on the one-word misread: the information toast "Added equivalence: Dinah = Dina" with what comes next, the button off (its reason "Already treated as the same"), and the note still To review (#2736)',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'proof',
    state: 'treat-as-same-long',
    description:
      'Proof, a one-word misread of a 45-letter word with no place to break, heard one letter off (?mockFindings=misread-long): the words wrap inside the Script and Heard quotes and the notes table, and the equals button stays inside the Inspector, at every width down to 390 px (#2736)',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'proof',
    state: 'treat-as-same-rtl',
    description:
      'Proof, a one-word misread of a Hebrew word with an emoji heard as another Hebrew word (?mockFindings=misread-rtl): the words read right to left in the quotes and the equals button stays in the row (#2736)',
    ...REFLOW,
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'proof',
    state: 'notes-filtered',
    description: 'Proof, all chapters with the To review chip pressed: "Notes · 3 of 4" and the note marked fine as read left out',
    ...REFLOW,
  },
  {
    page: 'proof',
    state: 'find-open',
    description: 'Proof, all chapters with find in notes open on "rabbit": the field beside the sort and the one matching note',
    ...REFLOW,
  },
  {
    page: 'proof',
    state: 'search-menu',
    description: 'Proof, all chapters, Ctrl+F then "rabbit": the jump menu searching the page, the matching notes listed under Notes with the word marked',
    ...REFLOW,
  },
  {
    page: 'proof',
    state: 'evidence-changed',
    description:
      'Proof, a note whose evidence changed after it was shown (?mockFindings=changed): the evidence-changed banner with before and now, the decisions held until the new evidence is taken, and the typed note kept',
    ...REFLOW,
  },
  {
    page: 'proof',
    state: 'empty',
    description: 'Proof, a project with no notes at all (?mockFindings=empty): no ring, every chapter tile empty, "No notes yet" in the Inspector',
    ...REFLOW,
  },
  {
    page: 'proof',
    state: 'no-manuscript',
    description:
      'Proof with no manuscript imported (?mockNoManuscript=1): the page asks for the manuscript, the rail shows no note count, and nothing moves to Production',
    ...REFLOW,
  },
  {
    page: 'proof',
    state: 'address-checking',
    description:
      'Proof opened from a link to a chapter the list does not have, while the list is read once more (?mockChapters=reread-hangs, at /proof?chapter=gone): the Proof title and the loaded page\'s two columns as grey blocks, with one polite "Checking this link…" status in place of the bare sentence',
    sameAs: {
      of: 'proof/loading',
      reason:
        "The address gate holds Proof on the page's own skeleton (ProofSkeleton) while it checks the link, as the chapter read does while it loads: the two differ only in the polite status a screen reader hears, which draws nothing.",
    },
    ...REFLOW,
  },
];
proofStates.push(wholePage(proofStates, 'default', ['desktop']));
