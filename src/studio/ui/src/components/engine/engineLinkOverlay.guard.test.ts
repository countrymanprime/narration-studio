import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// #3416 item 60: an engine pointer inside a slide-over or dialog that does not close it opens the engine panel on top of it, and the two stack. Every
// `EnginePanelLink` therefore passes `onOpen`, except those that sit on a page (listed here, each checked to have no overlay above it), and every
// `ChapterTrackLinkFix` (whose list-error pointer is one) passes `onNavigate`.
const PAGE_LEVEL = new Set(['proof/ProofChapterPage.tsx', 'proof/checkcard/CheckCard.tsx', 'booth/ResumePrompt.tsx']);

const root = join(__dirname, '..');
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx$/.test(name) && !/\.(test|stories)\.tsx$/.test(name) ? [path] : [];
  });
}
const tags = (text: string, name: string): string[] => [...text.matchAll(new RegExp(`<${name}\\b(?:=>|[^>])*>`, 'g'))].map((match) => match[0]);

describe('engine pointers under an overlay close it', () => {
  const files = sources(root).map((path) => ({ rel: path.slice(root.length + 1).replaceAll('\\', '/'), text: readFileSync(path, 'utf8') }));

  it('every EnginePanelLink passes onOpen, unless it sits on a page', () => {
    const missing = files.flatMap(({ rel, text }) =>
      tags(text, 'EnginePanelLink')
        .filter((tag) => !/\bonOpen=/.test(tag) && !PAGE_LEVEL.has(rel))
        .map(() => rel),
    );
    expect(missing).toEqual([]);
  });

  it('every ChapterTrackLinkFix passes onNavigate', () => {
    const missing = files.flatMap(({ rel, text }) =>
      tags(text, 'ChapterTrackLinkFix')
        .filter((tag) => !/\bonNavigate=/.test(tag))
        .map(() => rel),
    );
    expect(missing).toEqual([]);
  });

  it('the allowlist names files that still exist and still render the pointer', () => {
    for (const rel of PAGE_LEVEL) {
      const file = files.find((entry) => entry.rel === rel);
      expect(file, rel).toBeTruthy();
      expect(tags(file!.text, 'EnginePanelLink').length, rel).toBeGreaterThan(0);
    }
  });
});
