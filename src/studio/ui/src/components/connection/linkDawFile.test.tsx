// @vitest-environment jsdom
// Audit cluster 11 (docs/research/ui-function-audit.md): "link the project file" is one action. Every place that offers it asks `useLinkDawFile`, whose
// answer is App's guarded one (a second press while the native picker is open is `busy`); no screen calls the host's link by itself.
import { renderHook } from '@testing-library/react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { LinkDawFileContext, linkOutcome, useLinkDawFile, type LinkOutcome } from './linkDawFile';

const wrap = (api = createMockApi(), shared?: () => Promise<LinkOutcome>) =>
  function Wrapper({ children }: { children: ReactNode }) {
    const inner = <ApiProvider api={api}>{children}</ApiProvider>;
    return shared ? <LinkDawFileContext.Provider value={shared}>{inner}</LinkDawFileContext.Provider> : inner;
  };

describe('linkOutcome', () => {
  it('says what the host answered: cancelled, refused with its sentence, linked with its note, or failed', async () => {
    expect(await linkOutcome(async () => ({ selected: false, linked: false }))).toEqual({ kind: 'cancelled' });
    expect(await linkOutcome(async () => ({ selected: true, linked: false, message: 'Not a project.' }))).toEqual({
      kind: 'refused',
      message: 'Not a project.',
    });
    expect(await linkOutcome(async () => ({ selected: true, linked: true, note: 'It is in D:/Audio.' }))).toEqual({
      kind: 'linked',
      note: 'It is in D:/Audio.',
    });
    const error = new Error('no dialog');
    expect(await linkOutcome(async () => Promise.reject(error))).toEqual({ kind: 'failed', error });
  });
});

describe('useLinkDawFile', () => {
  it("is App's guarded action when App provides it, so every caller shares its answer", async () => {
    const shared = vi.fn(async (): Promise<LinkOutcome> => ({ kind: 'busy' }));
    const { result } = renderHook(() => useLinkDawFile(), { wrapper: wrap(createMockApi(), shared) });
    expect(await result.current()).toEqual({ kind: 'busy' });
    expect(shared).toHaveBeenCalledTimes(1);
  });

  it('calls the host itself where nothing provides it (a component test)', async () => {
    const linkDawFile = vi.fn(async () => ({ selected: true, linked: true }));
    const { result } = renderHook(() => useLinkDawFile(), { wrapper: wrap(createMockApi({ linkDawFile })) });
    expect(await result.current()).toEqual({ kind: 'linked' });
    expect(linkDawFile).toHaveBeenCalledTimes(1);
  });
});

describe('one link action', () => {
  const SRC = join(__dirname, '..', '..');
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sources(path);
      return /\.(ts|tsx)$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name) ? [path] : [];
    });

  it("no screen calls the host's linkDawFile by itself: App and the shared hook are the only callers", () => {
    const allowed = ['App.tsx', 'components/connection/linkDawFile.tsx'];
    const offenders = sources(SRC)
      .map((path) => relative(SRC, path).split(sep).join('/'))
      .filter((path) => !path.startsWith('api/') && !path.startsWith('ports/') && !path.startsWith('interactionFeedback') && !allowed.includes(path))
      .filter((path) => /\.linkDawFile\(/.test(readFileSync(join(SRC, path), 'utf8')));
    expect(offenders, 'ask useLinkDawFile() instead, so the press shares the pending guard').toEqual([]);
  });
});
