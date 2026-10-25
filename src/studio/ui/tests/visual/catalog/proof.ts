// The `proof` rows of STATE_CATALOG: the Studio Next Proof page (see state-catalog.ts), in the order they are captured.
import type { StateEntry } from '../lib/types';
import { KEEPS_DESKTOP_SCROLL, REFLOW, wholePage } from './shared';

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
    state: 'chapter-no-recording',
    description: 'Proof, Chapter 2 with no track linked: the check card with nothing recorded to check and why, and no waveform under it',
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
      "Proof, Chapter 4 while its recording check runs (?mockCoverage=hold, started from the queue's Check recordings): the Check recordings dialog running over the page, the card behind it in its checking state",
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
