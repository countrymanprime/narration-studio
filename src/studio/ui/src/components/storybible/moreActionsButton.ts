/**
 * The Story Bible's More actions button, where a narrator was when they chose Scan, Import entries or Voice data: the item went with its menu, so the dialog or panel it
 * opened hands focus back here (#3416 items 50 and 93). Null when the page is not drawn.
 */
export const moreActionsButton = (): HTMLElement | null => document.querySelector<HTMLElement>('main button[aria-label="More actions"]');
