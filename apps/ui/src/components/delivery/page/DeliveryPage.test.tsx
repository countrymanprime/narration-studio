// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import type { ExportJob, ManuscriptChapter, MeasureFileResult, MeasureJob, NarrationApi, PackageJob } from '../../../types';
import { chapterName } from '../../../chapterName';
import { failingTwo, passing, profile, waiting } from '../../masterqc/files/testFiles';
import { styledChapters, type HeadingStyle } from '../../script/page/chapters/chapterFixtures';
import { DeliveryPage } from './DeliveryPage';

afterEach(cleanup);

const chapter = (index: number, title: string): ManuscriptChapter =>
  ({ id: `c${index}`, title, index, wordCount: 100, status: 'ready' }) as unknown as ManuscriptChapter;
const CHAPTERS = [chapter(1, 'Chapter 01'), chapter(2, 'Chapter 02'), chapter(3, 'Chapter 03'), chapter(4, 'Chapter 04')];
const PASSING = [passing('Chapter 01.wav'), passing('Chapter 02.wav'), passing('Chapter 03.wav'), passing('Chapter 04.wav')];
const BLOCKED = [passing('Chapter 01.wav'), passing('Chapter 02.wav'), waiting('Chapter 03.wav'), failingTwo('Chapter 04.wav')];

const measureJob = (files: MeasureFileResult[]) => ({ phase: 'success', files, profile, bookRules: [] }) as unknown as MeasureJob;
const exported = { phase: 'success', files: [{ status: 'done', kind: 'chapter', title: 'Chapter 01', encodedPath: 'C:/enc/01.mp3' }] } as unknown as ExportJob;
const PACKAGE_DONE = {
  id: 'p1',
  kind: 'render_package',
  phase: 'success',
  message: 'Built',
  profile: 'ACX',
  outputDir: 'C:/Deliver/ACX',
  files: [1, 2, 3, 4].map((n) => ({ kind: 'chapter', name: `0${n}.mp3`, destPath: `C:/Deliver/ACX/0${n}.mp3`, tagged: true })),
  checklist: [],
  elapsed: 1,
} as unknown as PackageJob;
const IDLE = { ...PACKAGE_DONE, id: null, phase: 'idle', files: [], outputDir: '' } as PackageJob;

function mount(
  files: MeasureFileResult[],
  overrides: Partial<NarrationApi> = {},
  props: { hasManuscript?: boolean; onOpenInMaster?: (id: string) => void } = {},
) {
  const api = createMockApi({
    manuscriptChapters: async () => CHAPTERS,
    // No credits templates unless a test brings them: the rows below are the chapters'.
    creditsTemplates: async () => [],
    measureState: async () => measureJob(files),
    exportState: async () => exported,
    packageState: async () => IDLE,
    ...overrides,
  });
  render(
    <ApiProvider api={api}>
      <DeliveryPage hasManuscript={props.hasManuscript ?? true} onOpenInMaster={props.onOpenInMaster ?? (() => undefined)} />
    </ApiProvider>,
  );
  return api;
}

describe('DeliveryPage', () => {
  it('blocks-the-build-while-chapters-fail-or-are-not-ready-and-says-how-many', async () => {
    mount(BLOCKED);
    const button = await screen.findByRole('button', { name: /Build .* package/ });
    await screen.findByText('1 failing, 1 not ready');
    expect(button).toHaveProperty('disabled', true);
    expect(screen.getByText('2 of 4')).toBeTruthy();
    expect(screen.getByText('Fails 2 checks')).toBeTruthy();
    expect(screen.getByText('Not mastered')).toBeTruthy();
  });

  it('builds-when-everything-passes-lists-what-was-written-and-opens-the-folder: runs the package job and lists the files', async () => {
    const packageStart = vi.fn(async () => PACKAGE_DONE);
    mount(PASSING, { packageStart });
    await screen.findByText('Every chapter passes.');
    await userEvent.click(screen.getByRole('button', { name: /Build .* package/ }));
    expect(packageStart).toHaveBeenCalledOnce();
    expect(await screen.findByText('4 files')).toBeTruthy();
    expect(screen.getByText('in C:/Deliver/ACX')).toBeTruthy();
    expect(screen.getAllByText('Written')).toHaveLength(4);
  });

  it('opens the folder after a build', async () => {
    const deliveryOpenPackageFolder = vi.fn(async () => ({ folder: 'C:/Deliver/ACX' }));
    mount(PASSING, { packageStart: async () => PACKAGE_DONE, deliveryOpenPackageFolder });
    await screen.findByText('Every chapter passes.');
    // Before a build there is no button.
    expect(screen.queryByRole('button', { name: 'Open the folder' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Build .* package/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Open the folder' }));
    expect(deliveryOpenPackageFolder).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says why the folder could not be opened', async () => {
    mount(PASSING, {
      packageState: async () => PACKAGE_DONE,
      deliveryOpenPackageFolder: async () => {
        throw new Error('the package folder C:/Deliver/ACX is no longer there; build the package again');
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Open the folder' }));
    expect((await screen.findByRole('alert')).textContent).toContain('no longer there');
  });

  it('names every chapter from its data in each heading style', async () => {
    for (const style of ['gutenberg', 'numbered', 'colon'] as HeadingStyle[]) {
      cleanup();
      const chapters = styledChapters(style, 40);
      mount([], { manuscriptChapters: async () => chapters });
      await screen.findByText('0 of 40');
      const rows = screen.getAllByRole('button', { name: /Open in Master & QC/ });
      expect(rows, style).toHaveLength(40);
      chapters.forEach((chapter, i) => {
        const name = chapterName(chapter);
        expect(rows[i]!.textContent, `${style} ${i + 1}`).toContain(name);
        expect(rows[i]!.getAttribute('aria-label'), `${style} ${i + 1}`).toBe(`${name}: Not mastered. Open in Master & QC`);
      });
    }
  });

  // Issue 1705: the credits are deliverable files, listed with the chapters and counted in "n of N" as the mock does.
  describe('the credits rows', () => {
    const TEMPLATES = [
      { id: 'o', kind: 'opening', name: 'Standard opening', body: 'x' },
      { id: 'c', kind: 'closing', name: 'Standard closing', body: 'x' },
    ];
    const rowNames = () => screen.getAllByRole('button', { name: /Open in Master & QC/ }).map((row) => row.getAttribute('aria-label')?.split(':')[0]);

    it('lists the opening credits first and the closing credits last, and counts them', async () => {
      mount([...PASSING, passing('Opening credits.wav')], { creditsTemplates: async () => TEMPLATES });
      await screen.findByText('5 of 6');
      expect(rowNames()).toEqual(['Opening credits', 'Chapter 01', 'Chapter 02', 'Chapter 03', 'Chapter 04', 'Closing credits']);
      expect(screen.getByRole('button', { name: 'Opening credits: Pass. Open in Master & QC' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Closing credits: Not mastered. Open in Master & QC' })).toBeTruthy();
    });

    it('holds the build until the credits files pass too', async () => {
      mount(PASSING, { creditsTemplates: async () => TEMPLATES });
      await screen.findByText('4 of 6');
      expect(await screen.findByText('0 failing, 2 not ready')).toBeTruthy();
      expect(screen.getByRole('button', { name: /Build .* package/ })).toHaveProperty('disabled', true);
    });

    it('draws a kind the library has no template for as no row', async () => {
      mount(PASSING, { creditsTemplates: async () => [TEMPLATES[1]!] });
      await screen.findByText('4 of 5');
      expect(rowNames().at(-1)).toBe('Closing credits');
      expect(rowNames()[0]).toBe('Chapter 01');
    });
  });

  it('shows a failed package build', async () => {
    mount(PASSING, { packageStart: async () => ({ ...PACKAGE_DONE, phase: 'error', error: 'The folder is not writable.', files: [] }) });
    await userEvent.click(await screen.findByRole('button', { name: /Build .* package/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('The folder is not writable.');
  });

  it('the-built-list-goes-away-if-the-chapters-stop-passing', async () => {
    mount(BLOCKED, { packageState: async () => PACKAGE_DONE });
    await screen.findByText('1 failing, 1 not ready');
    expect(screen.queryByText('4 files')).toBeNull();
  });

  it('keeps-the-output-folder: the folder is the one the host built into, read again on a new visit', async () => {
    mount(PASSING, { packageState: async () => PACKAGE_DONE });
    expect(await screen.findByText('C:/Deliver/ACX')).toBeTruthy();
  });

  it('each-chapter-links-to-master-and-qc', async () => {
    const onOpenInMaster = vi.fn();
    mount(PASSING, {}, { onOpenInMaster });
    await userEvent.click(await screen.findByRole('button', { name: /Chapter 02: Pass/ }));
    expect(onOpenInMaster).toHaveBeenCalledWith('c2');
  });

  it('asks-for-the-manuscript-first', () => {
    mount(PASSING, {}, { hasManuscript: false });
    expect(screen.getByText('This project has no manuscript yet. Import one to begin.')).toBeTruthy();
    expect(screen.queryByText('Before you build')).toBeNull();
  });

  it('the-profile-card-leads-the-page, and a profile change clears the built list', async () => {
    mount(PASSING, { packageState: async () => PACKAGE_DONE });
    const card = await screen.findByRole('region', { name: 'Delivery profile' });
    const regions = screen.getAllByRole('region');
    expect(regions[0]).toBe(card);
    expect(await screen.findByText('4 files')).toBeTruthy();
  });

  it('the-build-is-judged-by-the-host: a file whose rules are all met passes whatever its numbers', async () => {
    mount([passing('Chapter 01.wav')]);
    const row = await screen.findByRole('button', { name: /Chapter 01: Pass/ });
    expect(within(row).getByText('Pass')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('1 of 4')).toBeTruthy());
  });
});
