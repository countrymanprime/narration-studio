import { ECHO_WINDOW_MS } from './components/primitives/echoGuard';

/** Waits out the double-click window, for a test that presses a button and then, as a narrator would not, the button that replaced it at once. */
export const outwaitEcho = () => new Promise<void>((done) => setTimeout(done, ECHO_WINDOW_MS + 20));
