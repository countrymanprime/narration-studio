// The sentences the Booth says about a take, written once: the record control, the page's status, the toasts that say what a take left behind and the setup
// dialog all use these, so the words cannot drift apart.

/** What the app says of a take it stopped (and saved). */
export const TAKE_SAVED = 'Take saved';
/** What it says of a take it only saw end (one the DAW started). */
export const TAKE_ENDED = 'The take ended';
/** What a toast that says what a take left behind opens with. */
export const takeToastOpener = (byDaw: boolean): string => (byDaw ? TAKE_ENDED : TAKE_SAVED);
/** The sentence for a take the DAW started that has ended there; `name` is the recorder as `recorderName` words it. */
export const takeEndedIn = (name: string): string => `${TAKE_ENDED} in ${name}.`;
/** "<DAW> is recording a take now.": what the wrong-project refusal and its dialog add when the DAW records; `name` as `recorderNameCapital` words it. */
export const recordingATakeNow = (name: string): string => `${name} is recording a take now.`;
