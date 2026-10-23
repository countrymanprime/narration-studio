/** What makes a toolbar icon button the mock's `.seltool` one: no border or fill, the toolbar's text colour, a white wash on hover. Important so
 * it wins over `IconButton`'s own hover rules. */
export const TOOL_BUTTON = 'border-0! bg-transparent! text-inherit! not-aria-disabled:hover:bg-white/15!';
