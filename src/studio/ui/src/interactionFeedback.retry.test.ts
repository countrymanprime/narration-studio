// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import { ERROR_TOAST_RETRY, UNJUDGED_ERROR_TOASTS } from './interactionFeedback.catalog';

// docs/architecture/interaction-feedback.md#retry: every error toast is judged for whether pressing Retry may repeat the action, and a
// toast judged `yes` carries it. The scan reads the source with the TypeScript parser, like interactionFeedback.test.ts.

/** The most error toasts left unjudged. Lower it when the list shrinks; raising it is how a toast would slip past, so it never goes up. */
const UNJUDGED_CEILING = 249;

const uiRoot = join(__dirname, '..');
const srcRoot = __dirname;
const NOT_UNDER_TEST = /\.(test|stories)\.tsx?$/;
/** The hook that raises every `useErrorToast` toast: its own `overlay.toast` is the mechanism, not a site. */
const MECHANISM = 'src/hooks/useErrorToast.ts';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !NOT_UNDER_TEST.test(entry.name) ? [path] : [];
  });
}

type Site = { key: string; kind: 'notify' | 'toast' | 'hook'; hasRetry: boolean };

const isError = (node: ts.Node | undefined) => !!node && ts.isStringLiteral(node) && node.text === 'error';
const toneIsError = (node: ts.Node | undefined, file: ts.SourceFile) =>
  !!node &&
  ts.isObjectLiteralExpression(node) &&
  node.properties.some((p) => ts.isPropertyAssignment(p) && p.name.getText(file) === 'tone' && isError(p.initializer));
const hasAction = (node: ts.Node | undefined, file: ts.SourceFile) =>
  !!node && ts.isObjectLiteralExpression(node) && node.properties.some((p) => p.name?.getText(file) === 'action');

/** Every `notify(_, 'error')`, `x.toast(_, { tone: 'error' })` and `useErrorToast(_)` in a file, keyed `<name>#<n>` in source order. */
export function errorToastSites(source: string, name: string): Site[] {
  const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, name.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const sites: Site[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const called = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : '';
      const [, second, third] = node.arguments;
      let kind: Site['kind'] | undefined;
      let hasRetry = false;
      if (called === 'notify' && isError(second)) [kind, hasRetry] = ['notify', third !== undefined];
      else if (called === 'toast' && toneIsError(second, file)) [kind, hasRetry] = ['toast', hasAction(second, file)];
      else if (called === 'useErrorToast') [kind, hasRetry] = ['hook', node.arguments.length > 1];
      if (kind) sites.push({ key: `${name}#${sites.length + 1}`, kind, hasRetry });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return sites;
}

const actual = sourceFiles(srcRoot)
  .map((path) => relative(uiRoot, path).split(sep).join('/'))
  .filter((name) => name !== MECHANISM)
  .flatMap((name) => errorToastSites(readFileSync(join(uiRoot, name), 'utf8'), name));
const actualKeys = new Set(actual.map((site) => site.key));

describe('the error toast scan', () => {
  test('finds the three ways to say an error and what carries a Retry', () => {
    const source = `
      notify('a', 'error');
      notify('b', 'info');
      notify('c', 'error', retryAction(go));
      overlay.toast('d', { tone: 'error' });
      overlay.toast('e', { tone: 'error', action: retryAction(go) });
      overlay.toast('f');
      useErrorToast(message);
      useErrorToast(message, again);`;
    expect(errorToastSites(source, 'probe.tsx')).toEqual([
      { key: 'probe.tsx#1', kind: 'notify', hasRetry: false },
      { key: 'probe.tsx#2', kind: 'notify', hasRetry: true },
      { key: 'probe.tsx#3', kind: 'toast', hasRetry: false },
      { key: 'probe.tsx#4', kind: 'toast', hasRetry: true },
      { key: 'probe.tsx#5', kind: 'hook', hasRetry: false },
      { key: 'probe.tsx#6', kind: 'hook', hasRetry: true },
    ]);
  });
});

describe('the retry column', () => {
  const unjudged = new Set(UNJUDGED_ERROR_TOASTS);

  test('every error toast is judged or on the shrink-only list', () => {
    const missing = [...actualKeys].filter((key) => !(key in ERROR_TOAST_RETRY) && !unjudged.has(key));
    expect(missing, 'judge the toast in ERROR_TOAST_RETRY: yes (and give it a Retry), no, or n/a, with the reason').toEqual([]);
  });

  test('the unjudged list never grows, holds only toasts that exist, and holds nothing judged', () => {
    expect(UNJUDGED_ERROR_TOASTS.length).toBeLessThanOrEqual(UNJUDGED_CEILING);
    expect(
      UNJUDGED_ERROR_TOASTS.filter((key) => !actualKeys.has(key)),
      'a gone or renumbered toast leaves the list',
    ).toEqual([]);
    expect(
      UNJUDGED_ERROR_TOASTS.filter((key) => key in ERROR_TOAST_RETRY),
      'a judged toast leaves the list',
    ).toEqual([]);
    expect(unjudged.size).toBe(UNJUDGED_ERROR_TOASTS.length);
  });

  test('no judgment is for a toast that is gone, and every one says why', () => {
    expect(Object.keys(ERROR_TOAST_RETRY).filter((key) => !actualKeys.has(key))).toEqual([]);
    expect(
      Object.entries(ERROR_TOAST_RETRY)
        .filter(([, judgment]) => judgment.reason.trim().length < 15)
        .map(([key]) => key),
    ).toEqual([]);
  });

  test('a toast judged yes carries a Retry, and one that carries a Retry is judged yes', () => {
    const wrong = actual
      .filter((site) => site.key in ERROR_TOAST_RETRY)
      .filter((site) => (ERROR_TOAST_RETRY[site.key].retry === 'yes') !== site.hasRetry)
      .map((site) => site.key);
    expect(wrong).toEqual([]);
  });
});
