import { createContext } from 'react';

/**
 * The app shell's header slot for the DAW connection chip (#4060): the bar is always drawn and has a fixed height, so a chip that comes and goes
 * there moves nothing on the page below, where it pushed the heading down or wrapped a header row. The shell provides the element, on the spacer's
 * side of the bar as the zoom chip is; a `ConnectionIndicator` that asks for it is drawn there, and one with no shell around it (a story, a test of
 * one page) is drawn where it stands, as `KeyHints` is with no page footer.
 */
export const HeaderStatusSlotContext = createContext<HTMLElement | null>(null);
