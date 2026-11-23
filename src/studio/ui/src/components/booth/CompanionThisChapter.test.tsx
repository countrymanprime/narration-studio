// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import type { ChapterStatus } from '../../api/contracts/manuscript';
import type { ProductionChapter, ProductionOverview } from '../../api/contracts/production';
import type { NarrationApi } from '../../types';
import { CompanionThisChapter } from './CompanionThisChapter';

afterEach(cleanup);

type Read = { status: ChapterStatus; recordedSeconds: number | null };

/** The chapter as the shared list gave it (`chapter`), and the overview that supplies only the readiness reason (`readiness`: undefined leaves the chapter out of it). */
async function renderWith(chapter: Read | null | undefined, readiness?: ProductionChapter['readiness'], overviewFails = false) {
  const base = createMockApi();
  const overview = await base.productionOverview();
  const row = readiness !== undefined && ({ ...overview.chapters[0], id: 'c1', readiness } as ProductionChapter);
  const api: NarrationApi = {
    ...base,
    productionOverview: async (): Promise<ProductionOverview> => {
      if (overviewFails) throw new Error('Production board unreadable');
      return { ...overview, chapters: row ? [row] : [] };
    },
  };
  render(
    <ApiProvider api={api}>
      <CompanionThisChapter chapterId="c1" chapter={chapter} />
    </ApiProvider>,
  );
}

describe('CompanionThisChapter (mock 07: "Recorded 12:40 · ..." and the QC line)', () => {
  it("shows the chapter's measured recorded length and its stage with the reason that holds it back", async () => {
    await renderWith({ recordedSeconds: 760, status: 'editing' }, { verdict: 'not_ready', reason: 'Head room tone is 0.3 s' });
    expect(await screen.findByText(/Recorded 12:40/)).toBeTruthy();
    expect(screen.getByText(/Editing/)).toBeTruthy();
    expect(await screen.findByText(/Head room tone is 0\.3 s/)).toBeTruthy();
  });

  it('says so when the length was not measured', async () => {
    await renderWith({ recordedSeconds: null, status: 'not_started' }, null);
    expect(await screen.findByText('Recorded length not measured')).toBeTruthy();
  });

  it('draws nothing but an honest empty line for a chapter the list does not have', async () => {
    await renderWith(null);
    expect(await screen.findByText('Nothing measured for this chapter yet.')).toBeTruthy();
  });

  it('draws nothing while the list is still read', async () => {
    await renderWith(undefined);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(document.body.textContent).toBe('');
  });

  // The overview only adds the reason: a chapter it lacks, or an overview that cannot be read, still shows the length and the stage the list gave.
  it('draws the length and the stage with no reason when the overview lacks the chapter', async () => {
    await renderWith({ recordedSeconds: 760, status: 'editing' });
    expect(await screen.findByText(/Recorded 12:40/)).toBeTruthy();
    expect(screen.getByText('Editing')).toBeTruthy();
  });

  it('draws the length and the stage with no reason when the overview cannot be read', async () => {
    await renderWith({ recordedSeconds: 760, status: 'editing' }, undefined, true);
    expect(await screen.findByText(/Recorded 12:40/)).toBeTruthy();
    expect(screen.getByText('Editing')).toBeTruthy();
    expect(screen.queryByText('Nothing measured for this chapter yet.')).toBeNull();
  });
});

// G1 class guard: a Companion line that prints a recorded length must take it from the read that gave the resume notice's percent (`useRecordedThrough`), never from a chapter read
// once elsewhere. No file under the Companion's folders may format `chapter.recordedSeconds` directly; `CompanionThisChapter` prints the `chapter.recordedSeconds` of the list read it is handed.
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
    const row = { ...overview.chapters[0], id: 'c1', readiness: { verdict: 'not_ready', reason: 'Head room tone is 0.3 s' } } as ProductionChapter;
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
        <CompanionThisChapter chapterId="c1" chapter={{ recordedSeconds: 760, status: 'editing' }} sessionActive={active} />
      </ApiProvider>
    );
    const result = render(view(false));
    return { ...result, view };
  }

  it('a re-read that fails when a session ends keeps the lines it had, and the reason it had', async () => {
    const reads = { fail: true, count: 0 };
    const { rerender, view } = await mount(reads);
    expect(await screen.findByText(/Recorded 12:40/)).toBeTruthy();
    expect(await screen.findByText(/Head room tone is 0\.3 s/)).toBeTruthy();
    rerender(view(true));
    rerender(view(false));
    await waitFor(() => expect(reads.count).toBe(2));
    expect(screen.getByText(/Recorded 12:40/)).toBeTruthy();
    expect(screen.getByText(/Head room tone is 0\.3 s/)).toBeTruthy();
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
