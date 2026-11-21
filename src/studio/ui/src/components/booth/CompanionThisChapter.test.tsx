// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import type { ProductionChapter, ProductionOverview } from '../../api/contracts/production';
import type { NarrationApi } from '../../types';
import { CompanionThisChapter } from './CompanionThisChapter';

afterEach(cleanup);

async function renderWith(chapter: Partial<ProductionChapter> | undefined, chapterId = 'c1') {
  const base = createMockApi();
  const overview = await base.productionOverview();
  const row = chapter && ({ ...overview.chapters[0], id: 'c1', ...chapter } as ProductionChapter);
  const api: NarrationApi = { ...base, productionOverview: async (): Promise<ProductionOverview> => ({ ...overview, chapters: row ? [row] : [] }) };
  render(
    <ApiProvider api={api}>
      <CompanionThisChapter chapterId={chapterId} />
    </ApiProvider>,
  );
}

describe('CompanionThisChapter (mock 07: "Recorded 12:40 · ..." and the QC line)', () => {
  it("shows the chapter's measured recorded length and its stage with the reason that holds it back", async () => {
    await renderWith({ recordedSeconds: 760, status: 'editing', readiness: { verdict: 'not_ready', reason: 'Head room tone is 0.3 s' } });
    expect(await screen.findByText(/Recorded 12:40/)).toBeTruthy();
    expect(screen.getByText(/Editing/)).toBeTruthy();
    expect(screen.getByText(/Head room tone is 0\.3 s/)).toBeTruthy();
  });

  it('says so when the length was not measured', async () => {
    await renderWith({ recordedSeconds: null, status: 'not_started', readiness: null });
    expect(await screen.findByText('Recorded length not measured')).toBeTruthy();
  });

  it('draws nothing but an honest empty line for a chapter the board does not list', async () => {
    await renderWith(undefined);
    expect(await screen.findByText('Nothing measured for this chapter yet.')).toBeTruthy();
  });
});

// G1 class guard: a Companion line that prints a recorded length must take it from the read that gave the resume notice's percent (`useRecordedThrough`), never from a chapter read
// once elsewhere. No file under the Companion's folders may format `chapter.recordedSeconds` directly; `CompanionThisChapter` prints the `recordedSeconds` it is handed.
describe('the Companion prints its recorded length from the same read as its percent', () => {
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === 'side' || name === 'companion' || name === 'page' ? sources(path) : [];
      return /\.tsx?$/.test(name) && !/\.(test|stories)\./.test(name) ? [path] : [];
    });
  it('formats no chapter.recordedSeconds read on its own', () => {
    const offenders = sources(__dirname)
      .filter((path) => /Companion/.test(path))
      .filter((path) => /clock\([^)]*chapter\.recordedSeconds/.test(readFileSync(path, 'utf8')));
    expect(offenders).toEqual([]);
  });
});

// H1 (qa delta): a re-read that fails when a session ends must keep the lines it had, and a session starting must not re-read at all.
describe('the re-read when a session ends', () => {
  async function mount(reads: { fail: boolean; count: number }) {
    const base = createMockApi();
    const overview = await base.productionOverview();
    const row = { ...overview.chapters[0], id: 'c1', recordedSeconds: 760, status: 'editing' } as ProductionChapter;
    const api: NarrationApi = {
      ...base,
      productionOverview: async (): Promise<ProductionOverview> => {
        reads.count += 1;
        if (reads.fail && reads.count > 1) throw new Error('Production board unreadable');
        return { ...overview, chapters: [row] };
      },
    };
    const view = (active: boolean) => (
      <ApiProvider api={api}>
        <CompanionThisChapter chapterId="c1" sessionActive={active} />
      </ApiProvider>
    );
    const result = render(view(false));
    return { ...result, view };
  }

  it('a re-read that fails when a session ends keeps the lines it had', async () => {
    const reads = { fail: true, count: 0 };
    const { rerender, view } = await mount(reads);
    expect(await screen.findByText(/Recorded 12:40/)).toBeTruthy();
    rerender(view(true));
    rerender(view(false));
    await waitFor(() => expect(reads.count).toBe(2));
    expect(screen.getByText(/Recorded 12:40/)).toBeTruthy();
    expect(screen.queryByText('Nothing measured for this chapter yet.')).toBeNull();
  });

  it('reads again when a session ends and not when one starts', async () => {
    const reads = { fail: false, count: 0 };
    const { rerender, view } = await mount(reads);
    await screen.findByText(/Recorded 12:40/);
    rerender(view(true));
    expect(reads.count).toBe(1);
    rerender(view(false));
    await waitFor(() => expect(reads.count).toBe(2));
  });
});
