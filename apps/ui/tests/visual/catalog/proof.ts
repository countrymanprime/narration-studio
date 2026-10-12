// The `proof` rows of STATE_CATALOG: the Studio Next Proof page (see state-catalog.ts), in the order they are captured.
import type { StateEntry } from '../lib/types';

export const proofStates: StateEntry[] = [
  {
    page: 'proof',
    state: 'default',
    description:
      "Proof, all chapters (Studio Next mock): the head with the chapter stepper and the cleared ring, the chapter strip with each chapter's open notes, the notes queue (chips, sort, find, Check recordings, the proofer sheet icons, the Sources line, the table grouped by chapter), the Inspector on the first note and the key hints",
  },
  {
    page: 'proof',
    state: 'chapter',
    description:
      "Proof, Chapter 1 with its track linked (?mockChapterLink=confirmed): the recording check card, the waveform window with the note pins, the chapter's notes with the In view chip and a takes badge, and Esc All chapters in the key hints",
  },
  {
    page: 'proof',
    state: 'chapter-no-recording',
    description:
      'Proof, Chapter 2 with no track linked: the check card with nothing recorded to check, "No recording for this chapter yet" where the waveform goes',
  },
  {
    page: 'proof',
    state: 'takes-lanes',
    description:
      'Proof, Chapter 1 linked, on the misread at 0:12.4 whose spot has several takes: the playing take as a band on the trace, the other takes in their lanes under it, and the takes at this spot in the Inspector',
  },
  {
    page: 'proof',
    state: 'check-stale',
    description:
      'Proof, Chapter 4 whose stored recording check is stale (?mockCoverage=stale): the check card says what changed since and offers to check again',
  },
  {
    page: 'proof',
    state: 'check-never',
    description: 'Proof, Chapter 7 never checked: the check card with no check yet and Check recordings',
  },
  {
    page: 'proof',
    state: 'check-checking',
    description:
      "Proof, Chapter 4 while its recording check runs (?mockCoverage=hold, started from the queue's Check recordings): the Check recordings dialog running over the page, the card behind it in its checking state",
  },
  {
    page: 'proof',
    state: 'notes-filtered',
    description: 'Proof, all chapters with the To review chip pressed: "Notes · 3 of 4" and the waived note left out',
  },
  {
    page: 'proof',
    state: 'find-open',
    description: 'Proof, all chapters with find in notes open on "rabbit": the field beside the sort and the one matching note',
  },
  {
    page: 'proof',
    state: 'evidence-changed',
    description:
      'Proof, a note whose evidence changed after it was shown (?mockFindings=changed): the evidence-changed banner with before and now, the decisions held until the new evidence is taken, and the typed note kept',
  },
  {
    page: 'proof',
    state: 'empty',
    description: 'Proof, a project with no notes at all (?mockFindings=empty): no ring, every chapter tile empty, "No notes yet" in the Inspector',
  },
];
