/** Pausing and resuming the running take: the timer and the follow cursor live in the page, this is only the switch. */
export type TakeControls = { pause: () => void; resume: () => void };

/**
 * Holds the take while something asks the narrator a question (a menu, the roll confirm). Holds nest: the take pauses on the first
 * and resumes when the last is released, so closing a menu cannot resume a take a confirm still holds. A release is safe to call twice.
 */
export function createTakeHold({ pause, resume }: TakeControls): () => () => void {
  let holds = 0;
  return () => {
    holds += 1;
    if (holds === 1) pause();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      holds -= 1;
      if (holds === 0) resume();
    };
  };
}
