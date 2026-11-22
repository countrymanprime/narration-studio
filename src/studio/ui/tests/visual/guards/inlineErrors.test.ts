import { describe, expect, it } from 'vitest';
import { INLINE_ERRORS } from './inline-errors-allowlist';
import { DRAWN_IN_OVERLAY, inlineErrorFindings, knownComponents, scanSource, sourceExists, type KnownComponents } from './inlineErrors';

// An error drawn in a page's flow moves the layout when it appears. Errors go in a toast, a modal or an always-present fixed result box.
// The allowlist is today's debt by file; it may only shrink.
describe('errors drawn in a page’s flow', () => {
  const findings = inlineErrorFindings();
  const found: Record<string, number> = {};
  for (const { file } of findings) found[file] = (found[file] ?? 0) + 1;

  it('adds none beyond the allowlist', () => {
    // Each file over its count, with every element the guard counts in it, so the new one is in the list.
    const over = Object.entries(found)
      .filter(([file, n]) => n > (INLINE_ERRORS[file] ?? 0))
      .map(([file, n]) => {
        const lines = findings.filter((f) => f.file === file).map((f) => `${f.line} (${f.why})`);
        return `${file}: ${n} (listed ${INLINE_ERRORS[file] ?? 0}): ${lines.join('; ')}`;
      });
    expect(
      over,
      'Show the error as a toast, in a modal, or in a result box that is always on the page. See .claude/skills/frontend-primitives/SKILL.md.',
    ).toEqual([]);
  });

  it('lowers the allowlist when an error is fixed', () => {
    const stale = Object.entries(INLINE_ERRORS)
      .filter(([file, n]) => (found[file] ?? 0) < n)
      .map(([file, n]) => `${file}: listed ${n}, found ${found[file] ?? 0}`);
    expect(stale, 'Lower or remove these entries in inline-errors-allowlist.ts.').toEqual([]);
  });
});

// The files exempt because they are drawn inside an overlay the guard cannot see from them. The list may only shrink, and each entry names a
// file that exists and still draws an error the exemption hides (a file the guard now reads as drawn in an overlay comes off it).
const MAX_DRAWN_IN_OVERLAY = 1;

describe('files drawn only inside an overlay', () => {
  const unexempted = inlineErrorFindings({ withDrawnInOverlay: true });

  it('does not grow', () => {
    expect(Object.keys(DRAWN_IN_OVERLAY).length).toBeLessThanOrEqual(MAX_DRAWN_IN_OVERLAY);
  });

  it('names files that exist, each with where it is drawn', () => {
    for (const [file, where] of Object.entries(DRAWN_IN_OVERLAY)) {
      expect(sourceExists(file), file).toBe(true);
      expect(where.length, file).toBeGreaterThan(0);
    }
  });

  it('holds only files whose exemption hides an error', () => {
    const idle = Object.keys(DRAWN_IN_OVERLAY).filter((file) => !unexempted.some((f) => f.file === file));
    expect(idle, 'Remove these entries from DRAWN_IN_OVERLAY: the guard finds nothing in them.').toEqual([]);
  });
});

const scan = (body: string) => scanSource('Fixture.tsx', body).map(({ line, why }) => `${line}: ${why}`);

describe('what the guard counts', () => {
  it('counts a danger-coloured line drawn only when something failed', () => {
    expect(scan(`export const A = ({ e }) => (\n  <div>\n    {e && <p className="text-[var(--danger)]">Failed</p>}\n  </div>\n);`)).toEqual([
      '3: drawn in some states, danger or warn colour',
    ]);
  });

  it('counts each conditional shape: &&, ?:, an early return, and an error-named variable as text', () => {
    const body = [
      'export function A({ ok, saveError, phase }) {',
      '  if (phase === "failed") return <p>Not saved.</p>;',
      '  return (',
      '    <div>',
      '      {ok ? <span>Saved</span> : <p style={{ color: "var(--warn-text)" }}>Check this</p>}',
      '      {saveError && <p>{saveError}</p>}',
      '      <p>{saveError}</p>',
      '    </div>',
      '  );',
      '}',
    ].join('\n');
    expect(scan(body)).toEqual([
      '2: drawn in some states, under phase === "failed"',
      '5: drawn in some states, danger or warn colour',
      '6: drawn in some states, error-named text',
      '7: error-named text, empty until the error comes',
    ]);
  });

  it('counts role="alert", a warn tone on a card, Note alert, a Field error and a known notice component', () => {
    const body = [
      'export const A = ({ a, b, c, d, msg }) => (',
      '  <div>',
      '    <p role="alert">Always here</p>',
      '    {a && <InsetCard tone="warn">Not running</InsetCard>}',
      '    {b && <Note alert>{msg}</Note>}',
      '    <Field label="Name" error={msg} />',
      '    {c && <ReadNotice what="the types" />}',
      '    {d && <p>The list could not be read.</p>}',
      '  </div>',
      ');',
    ].join('\n');
    expect(scan(body)).toEqual([
      '3: role="alert"',
      '4: drawn in some states, tone="warn"',
      '5: drawn in some states, Note alert',
      '6: Field error, its line drawn only when set',
      '7: drawn in some states, <ReadNotice>',
      '8: drawn in some states, failure sentence',
    ]);
  });

  it('counts a conditional block once, however many error marks it holds', () => {
    expect(scan(`export const A = ({ e }) => e ? <div role="alert"><p className="text-[var(--danger-text)]">{e}</p></div> : null;`)).toEqual([
      '1: drawn in some states, role="alert"',
    ]);
  });
});

describe('what the guard counts that a first reading missed', () => {
  const one = (body: string) => scan(`export const A = ({ e, error, errors, saveError, failures, x }) => ${body};`);

  it('an error inside a slide-over of the same file: its body is a panel whose content shifts', () => {
    expect(scan(`export const A = ({ e }) => <SlideOver open title="T">{e ? <p className="text-[var(--danger-text)]">x</p> : null}</SlideOver>;`)).toEqual([
      '1: drawn in some states, danger or warn colour',
    ]);
    expect(scan(`export const A = ({ e }) => <Popover label="P">{e && <p role="alert">{e}</p>}</Popover>;`)).toEqual([]);
  });

  it('a slot that is itself drawn only in some states', () => {
    expect(one('<div>{e && <div className="min-h-[2lh]" role="alert">{e}</div>}</div>')).toEqual(['1: drawn in some states, role="alert"']);
    expect(one('<div>{e && <div className="min-h-[2lh]"><p role="alert">{e}</p></div>}</div>')).toEqual(['1: drawn in some states, role="alert"']);
    expect(scan(`export function A({ e }) { if (e) return <span className="min-h-[3lh] text-[var(--danger-text)]">{e}</span>; return null; }`)).toEqual([
      '1: drawn in some states, danger or warn colour',
    ]);
  });

  it('a min-h that reserves nothing a line needs, or only at one width', () => {
    for (const slot of ['min-h-px', 'min-h-0.5', 'min-h-fit', 'min-h-screen', 'md:min-h-[2lh]'])
      expect(one(`<div className="${slot}">{e && <p role="alert">{e}</p>}</div>`), slot).toEqual(['1: drawn in some states, role="alert"']);
  });

  it('a list or a call drawn only while something failed', () => {
    expect(one('<div>{errors.length > 0 && errors.map((m) => <p key={m} className="text-[var(--danger-text)]">{m}</p>)}</div>')).toEqual([
      '1: drawn in some states, danger or warn colour',
    ]);
    expect(one('<ul>{failures.map((f) => <li key={f} className="text-[var(--danger-text)]">{f}</li>)}</ul>')).toEqual([
      '1: drawn in some states, danger or warn colour',
    ]);
    expect(one('<div>{saveError && renderError(saveError)}</div>')).toEqual(['1: drawn in some states, under saveError, by a call']);
  });

  it('the view a component returns after an early return, after a negated test, and in an error case', () => {
    expect(scan(`export function A({ ok }) { if (ok) return <p>Fine.</p>; return <p className="text-[var(--danger-text)]">It broke.</p>; }`)).toEqual([
      '1: drawn in some states, danger or warn colour',
    ]);
    expect(scan(`export function A({ error }) { if (!error) { return <p>Fine.</p>; } else { return <p>It broke.</p>; } }`)).toEqual([
      '1: drawn in some states, under !error',
    ]);
    expect(scan(`export function A({ phase }) { switch (phase) { case 'error': return <p>Oops.</p>; default: return <p>Fine.</p>; } }`)).toEqual([
      '1: drawn in some states, under an error case',
    ]);
  });

  it('a view of content counts once, and an error it draws in some states counts on its own', () => {
    const body = [
      'export function A({ loading, saveError }) {',
      '  if (loading) return <p>Reading…</p>;',
      '  return (',
      '    <main>',
      '      <p className="text-[var(--warn-text)]">Unsaved changes</p>',
      '      {saveError && <p>{saveError}</p>}',
      '    </main>',
      '  );',
      '}',
    ].join('\n');
    expect(scan(body)).toEqual(['4: drawn in some states, danger or warn colour', '6: drawn in some states, error-named text']);
  });

  it('an error’s text in the shapes it takes, always drawn', () => {
    for (const text of ['{error?.message}', '{e.message}', '{`Failed: ${error}`}', "{String(error ?? '')}", "{saveError ? 'Could not save' : null}"])
      expect(one(`<p className="text-sm">${text}</p>`), text).toEqual(['1: error-named text, empty until the error comes']);
  });

  it('a failure sentence in a string, a line that collapses while empty, and one hidden until set', () => {
    expect(one("<div>{x && <p>{'The file could not be read.'}</p>}</div>")).toEqual(['1: drawn in some states, failure sentence']);
    expect(one('<p className="empty:hidden text-[var(--danger-text)]">{x}</p>')).toEqual(['1: empty:hidden error line, gone while it is empty']);
    expect(one('<p hidden={!e} className="text-[var(--danger-text)]">Could not save</p>')).toEqual(['1: drawn in some states, danger or warn colour']);
  });

  it('role={"alert"}, aria-live="assertive" and screen-reader text a breakpoint shows', () => {
    expect(one("<div>{x && <p role={'alert'}>x</p>}</div>")).toEqual(['1: drawn in some states, role="alert"']);
    expect(one('<div>{x && <p aria-live="assertive">x</p>}</div>')).toEqual(['1: drawn in some states, aria-live="assertive"']);
    for (const cls of ['md:sr-only', 'not-sr-only'])
      expect(one(`<div>{e && <p className="${cls} text-[var(--danger-text)]">x</p>}</div>`), cls).toEqual(['1: drawn in some states, danger or warn colour']);
  });

  it('an exported component of another file that draws a notice, drawn here in some states', () => {
    const known = knownComponents([{ file: 'Line.tsx', text: 'export function SaveFailedLine({ m }) { return <p role="alert">{m}</p>; }' }]);
    expect(scanSource('A.tsx', `export const A = ({ e }) => <div>{e && <SaveFailedLine m={e} />}</div>;`, known).map((f) => f.why)).toEqual([
      'drawn in some states, <SaveFailedLine>',
    ]);
  });
});

describe('what other files tell the guard', () => {
  const known: KnownComponents = knownComponents([
    { file: 'Shell.tsx', text: 'export function Shell({ children }) { return <Dialog title="T">{children}</Dialog>; }' },
    { file: 'FixDialog.tsx', text: 'export function FixDialog({ e }) { return <Shell>{e && <p role="alert">{e}</p>}</Shell>; }' },
    { file: 'Step.tsx', text: 'export function Step({ e }) { return e ? <p role="alert">{e}</p> : <p>Fine.</p>; }' },
    { file: 'Wizard.tsx', text: 'export function Wizard() { return <form><Step /></form>; }' },
    { file: 'open.tsx', text: "export const openWizard = () => overlay.open({ kind: 'dialog', title: 'W', render: () => <Wizard /> });" },
    { file: 'Panel.tsx', text: 'export function Panel({ e }) { return <div>{e && <p role="alert">{e}</p>}</div>; }' },
    { file: 'Page.tsx', text: 'export function Page() { return <SlideOver open title="P"><Panel /></SlideOver>; }' },
  ]);

  it('a component that returns a dialog, through a wrapper, is an overlay', () => {
    expect(known.overlays.has('Shell')).toBe(true);
    expect(known.overlays.has('FixDialog')).toBe(true);
    expect(scanSource('X.tsx', 'export const X = ({ e }) => <div><FixDialog>{e && <p role="alert">{e}</p>}</FixDialog></div>;', known)).toEqual([]);
  });

  it('a component drawn only in what overlay.open renders, or only in such a component, is drawn in an overlay', () => {
    expect(known.drawnInOverlay.has('Wizard')).toBe(true);
    expect(known.drawnInOverlay.has('Step')).toBe(true);
    expect(scanSource('Step.tsx', 'export function Step({ e }) { return e ? <p role="alert">{e}</p> : <p>Fine.</p>; }', known)).toEqual([]);
  });

  it('but a component that returns a slide-over, and a panel drawn in one, stay counted: a slide-over’s body is in scope', () => {
    expect(known.overlays.has('Page')).toBe(false);
    expect(known.drawnInOverlay.has('Panel')).toBe(false);
  });
});

describe('what the guard leaves alone', () => {
  it('an error inside an overlay element of the same file', () => {
    expect(scan(`export const A = ({ e }) => (\n  <Dialog title="T">\n    {e && <p role="alert">{e}</p>}\n  </Dialog>\n);`)).toEqual([]);
  });

  it('a component of the file drawn only inside its overlay', () => {
    const body = [
      'function Row({ e }) { return e ? <p role="alert">{e}</p> : null; }',
      'export function A() { return <Popover label="P"><Row e="x" /></Popover>; }',
    ].join('\n');
    expect(scan(body)).toEqual([]);
  });

  it('but counts an exported component, which another file may draw in a page', () => {
    const body = [
      'export function Row({ e }) { return e ? <p role="alert">{e}</p> : null; }',
      'export function A() { return <Popover label="P"><Row e="x" /></Popover>; }',
    ].join('\n');
    expect(scan(body)).toEqual(['1: drawn in some states, role="alert"']);
  });

  it('an error in a slot that keeps its height', () => {
    expect(scan(`export const A = ({ e }) => <span className="min-h-[3lh]">{e && <span className="text-[var(--danger-text)]">{e}</span>}</span>;`)).toEqual([]);
  });

  it('a slot reached through a wrapper that holds nothing else', () => {
    expect(scan(`export const A = ({ e }) => <div className="min-h-[1lh]"><div>{e && <p className="text-[var(--danger-text)]">{e}</p>}</div></div>;`)).toEqual(
      [],
    );
  });

  it('a component every view of which is the same slot', () => {
    const body = [
      'export function A({ e, plan }) {',
      '  if (e) return <span className="min-h-[3lh] text-[var(--danger-text)]">Could not work it out: {e}</span>;',
      '  if (!plan) return <span className="min-h-[3lh]">Working it out…</span>;',
      '  return <span className="min-h-[3lh]">{plan}</span>;',
      '}',
    ].join('\n');
    expect(scan(body)).toEqual([]);
  });

  it('but counts one under a min-h-0, which reserves nothing', () => {
    expect(scan(`export const A = ({ e }) => <main className="min-h-0">{e && <p role="alert">{e}</p>}</main>;`)).toEqual([
      '1: drawn in some states, role="alert"',
    ]);
  });

  it('normal status text, a loading line and data colouring that is always drawn', () => {
    const body = [
      'export const A = ({ loading, over, n }) => (',
      '  <div>',
      '    {loading && <p role="status">Reading…</p>}',
      '    <span style={{ color: over ? "var(--danger-text)" : undefined }}>{n} dB</span>',
      '    <span role="status">{over ? "Too loud" : "Fine"}</span>',
      '  </div>',
      ');',
    ].join('\n');
    expect(scan(body)).toEqual([]);
  });

  it('a badge, a swap of like inline elements, a table cell’s own state, a negated error condition and icon buttons alone', () => {
    const body = [
      'export const A = ({ bad, ok, error, row }) => (',
      '  <div>',
      '    {bad && <StatusBadge tone="danger" label="Failed" />}',
      '    {ok ? <span>Linked</span> : <span className="text-[var(--warn-text)]">Several</span>}',
      '    <TableCell>{row.missing && <span style={{ color: "var(--danger-text)" }}>Missing</span>}</TableCell>',
      '    {!error && <p>All read.</p>}',
      '    {error && (<><IconButton action="retry" label="Retry" /></>)}',
      '  </div>',
      ');',
    ].join('\n');
    expect(scan(body)).toEqual([]);
  });

  it('a condition that says there is no error, and a confirm’s "can’t undo"', () => {
    const body = [
      'export const A = ({ isErrorFree, noErrors, errors, error, armed }) => (',
      '  <div>',
      '    {isErrorFree && <p>All good.</p>}',
      '    {noErrors && <p>All good.</p>}',
      '    {errors.length === 0 && <p>Clean.</p>}',
      '    {error === null && <p>Saved.</p>}',
      '    {armed && <p>You can’t undo this.</p>}',
      '  </div>',
      ');',
    ].join('\n');
    expect(scan(body)).toEqual([]);
    expect(scan(`export const A = ({ x }) => <div>{x && <p>Can’t tell if this list is current.</p>}</div>;`)).toEqual([
      '1: drawn in some states, failure sentence',
    ]);
  });

  it('an error inside a namespaced dialog, a tooltip beside it, and a word in a button’s label', () => {
    expect(scan(`export const A = ({ e }) => <div><Tooltip text="x" />{e && <ui.Dialog title="T"><p role="alert">{e}</p></ui.Dialog>}</div>;`)).toEqual([]);
    expect(scan(`export const A = ({ problem }) => <Button>Play{problem ? \` · \${problem}\` : ''}</Button>;`)).toEqual([]);
  });

  it('a screen that replaces the page on a failed read, and screen-reader-only text', () => {
    expect(scan(`export function A({ error }) { if (error) return <LoadError message={error} />; return <span className="sr-only">{error}</span>; }`)).toEqual(
      [],
    );
  });
});
