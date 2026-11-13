// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Class guard for issue 3431: no toast is made or drawn outside the one mechanism, so none can lack a bounded lifetime. `ToastRegion` is drawn only by
// `OverlayHost`; the only code that builds a `ToastMessage` is the overlay service (every `notify` and `overlay.toast` ends there); and a toast's timer,
// `toastLifetimeMs` in `Toast.tsx`, has no branch that skips it for a tone (the old `sticky` error). A second queue or a hand-built message fails here.
const SRC = __dirname;

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.tsx?$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name)) yield path;
  }
}

const rel = (path: string) => relative(SRC, path).split(sep).join('/');
const files = [...sources(SRC)].map((path) => ({ path: rel(path), text: readFileSync(path, 'utf8') }));
const usersOf = (pattern: RegExp) => files.filter((file) => pattern.test(file.text)).map((file) => file.path);

describe('toasts have one mechanism and every toast has a bounded lifetime (#3431)', () => {
  it('draws the toast region only in the overlay host', () => {
    expect(usersOf(/<ToastRegion\b/).sort()).toEqual(['overlay/OverlayHost.tsx']);
  });

  it('builds a ToastMessage only in the overlay service', () => {
    expect(usersOf(/:\s*ToastMessage\s*=\s*\{|as ToastMessage\b|satisfies ToastMessage\b/).sort()).toEqual(['overlay/overlayService.ts']);
  });

  it('starts the timer of every toast, whatever its tone', () => {
    const toast = readFileSync(join(SRC, 'components/primitives/Toast.tsx'), 'utf8');
    expect(toast).toMatch(/const stays = toastLifetimeMs\(message\)/);
    const timer = toast.slice(toast.indexOf('const fade = window.setTimeout'), toast.indexOf('const fade = window.setTimeout') + 200);
    expect(timer).toContain('stays');
    // Only a pointer on the toast or focus in it may hold the timer.
    expect(toast).toMatch(/useEffect\(\(\) => \{\n\s+if \(held\) return;/);
  });
});
