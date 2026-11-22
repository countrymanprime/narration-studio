import { describe, expect, it } from 'vitest';
import { INLINE_ERRORS } from './inline-errors-allowlist';
import { DRAWN_IN_OVERLAY, inlineErrorFindings, scanSource, sourceExists } from './inlineErrors';

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

// The files exempt because another file draws them inside an overlay. The list may only shrink, and each entry names a file that exists.
const MAX_DRAWN_IN_OVERLAY = 7;

describe('files drawn only inside an overlay', () => {
  it('does not grow', () => {
    expect(Object.keys(DRAWN_IN_OVERLAY).length).toBeLessThanOrEqual(MAX_DRAWN_IN_OVERLAY);
  });

  it('names files that exist, each with where it is drawn', () => {
    for (const [file, where] of Object.entries(DRAWN_IN_OVERLAY)) {
      expect(sourceExists(file), file).toBe(true);
      expect(where.length, file).toBeGreaterThan(0);
    }
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

describe('what the guard leaves alone', () => {
  it('an error inside an overlay element of the same file', () => {
    expect(scan(`export const A = ({ e }) => (\n  <Dialog title="T">\n    {e && <p role="alert">{e}</p>}\n  </Dialog>\n);`)).toEqual([]);
    expect(scan(`export const A = ({ e }) => <SlideOver open title="T">{e ? <p className="text-[var(--danger-text)]">x</p> : null}</SlideOver>;`)).toEqual([]);
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
    expect(scan(`export function A({ e }) { if (e) return <span className="min-h-[3lh] text-[var(--danger-text)]">{e}</span>; return null; }`)).toEqual([]);
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

  it('a screen that replaces the page on a failed read, and screen-reader-only text', () => {
    expect(scan(`export function A({ error }) { if (error) return <LoadError message={error} />; return <span className="sr-only">{error}</span>; }`)).toEqual(
      [],
    );
  });
});
