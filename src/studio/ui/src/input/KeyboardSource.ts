import { gestureFromKeyboardEvent } from './gestures';
import type { GestureEvent, InputSource } from './InputSource';

/**
 * The Must input source (Solution Detail): a `keydown` listener on `document`, normalising modifiers through
 * `gestureFromKeyboardEvent`. Many USB footswitches present as keyboards, so this alone covers them. A held key's repeats
 * are passed on marked `repeat`, and the router runs one only for a command whose catalogue row says `repeats` (the keys that
 * step through the text); every other command is press-only, so a held key fires it once, the same as every listener it replaces.
 *
 * A plain factory rather than a class, like the rest of `src/input/` (a target is injectable for tests, defaulting
 * to the real `document`).
 */
export function createKeyboardSource(target: Pick<Document, 'addEventListener' | 'removeEventListener'> = document): InputSource {
  return {
    subscribe(onGesture: (event: GestureEvent) => void): () => void {
      const onKeyDown = (event: Event) => {
        const keyboardEvent = event as KeyboardEvent;
        onGesture({
          gesture: gestureFromKeyboardEvent(keyboardEvent),
          repeat: keyboardEvent.repeat,
          target: keyboardEvent.target,
          preventDefault: () => keyboardEvent.preventDefault(),
          consumed: () => keyboardEvent.defaultPrevented,
        });
      };
      target.addEventListener('keydown', onKeyDown);
      return () => target.removeEventListener('keydown', onKeyDown);
    },
  };
}
