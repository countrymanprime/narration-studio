// The Script page's title, visually hidden: the mock draws none, the reader is the page. One component, so the loaded page and its loading
// skeleton name the page the same way and `panelCopies.test.ts` counts one copy.
export function ScriptTitle() {
  return <h1 className="sr-only">Script</h1>;
}
