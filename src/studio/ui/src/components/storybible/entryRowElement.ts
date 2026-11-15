/** The Story Bible table's row for an entry, where a narrator was when they chose from its right-click menu (which closed with the choice). Null while the row is not drawn (deleted, filtered out, scrolled out of a windowed list). */
export const entryRowElement = (id: string): HTMLElement | null =>
  [...document.querySelectorAll<HTMLElement>('main [data-entry-id]')].find((element) => element.dataset.entryId === id) ?? null;
