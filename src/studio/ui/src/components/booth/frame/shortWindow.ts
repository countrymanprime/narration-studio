/**
 * The Booth's chrome that gives way so the side panel (a drawer in a small window) has room to read: the top bar's progress line and the
 * footer's key hints. They stay in the page for a screen reader and are not drawn when the window is under 26rem tall, or under 30rem tall
 * and narrow (30rem wide or less), where the bar and the hints wrap to three rows and a threshold set for the smallest window left the
 * panel at 58 px one pixel above it. One class string, so the two never drift apart.
 */
export const GIVES_WAY_IN_A_SHORT_WINDOW = '[@media(max-height:26rem)]:sr-only [@media(max-height:30rem)_and_(max-width:30rem)]:sr-only';
