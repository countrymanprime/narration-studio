// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { findToast } from '../../../overlay/toastTesting';
import { createMockApi } from '../../../api/mockApi';
import type { ExportJob, ManuscriptChapter, MeasureFileResult, MeasureJob, NarrationApi, PackageJob } from '../../../types';
import { chapterName } from '../../../chapterName';
import { failingTwo, passing, profile, waiting } from '../../masterqc/files/testFiles';
import { styledChapters, type HeadingStyle } from '../../script/page/chapters/chapterFixtures';
import { StudioProvider } from '../../../studio/StudioProvider';
import { DeliveryPage } from './DeliveryPage';

afterEach(cleanup);

const chapter = (index: number, title: string): ManuscriptChapter =>
  ({ id: `c${index}`, title, index, wordCount: 100, status: 'not_started' }) as unknown as ManuscriptChapter;
const CHAPTERS = [chapter(1, 'Chapter 01'), chapter(2, 'Chapter 02'), chapter(3, 'Chapter 03'), chapter(4, 'Chapter 04')];
const credits = (kind: 'opening' | 'closing'): ManuscriptChapter =>
  ({
    id: `credits-${kind}`,
    title: kind === 'opening' ? 'Opening credits' : 'Closing credits',
    index: -2,
    wordCount: 40,
    status: 'not_started',
    contentKind: 'narration',
    isCredits: true,
    paragraphIds: [],
  }) as unknown as ManuscriptChapter;
const PASSING = [passing('Chapter 01.wav'), passing('Chapter 02.wav'), passing('Chapter 03.wav'), passing('Chapter 04.wav')];
const BLOCKED = [passing('Chapter 01.wav'), passing('Chapter 02.wav'), waiting('Chapter 03.wav'), failingTwo('Chapter 04.wav')];

const measureJob = (files: MeasureFileResult[]) => ({ phase: 'success', files, profile, bookRules: [] }) as unknown as MeasureJob;
const exported = { phase: 'success', files: [{ status: 'done', kind: 'chapter', title: 'Chapter 01', encodedPath: 'C:/enc/01.mp3' }] } as unknown as ExportJob;
const PACKAGE_DONE = {
  id: 'p1',
  kind: 'render_package',
  phase: 'success',
  message: 'Built',
  // The host names the profile a package was built with by its key (deliveryprofile.Profile.Key).
  profile: 'acx@2026-09',
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
    measureState: async () => measureJob(files),
    exportState: async () => exported,
    packageState: async () => IDLE,
    ...overrides,
  });
  render(
    <ApiProvider api={api}>
      <StudioProvider>
        <DeliveryPage hasManuscript={props.hasManuscript ?? true} onOpenInMaster={props.onOpenInMaster ?? (() => undefined)} />
      </StudioProvider>
    </ApiProvider>,
  );
  return api;
}

describe('DeliveryPage', () => {
  it('blocks-the-build-while-chapters-fail-or-are-not-ready-and-says-how-many', async () => {
    mount(BLOCKED);
    const button = await screen.findByRole('button', { name: /Build .* package/ });
    await screen.findByText('1 failing, 1 not ready');
    expect(button).toHaveProperty('disabled', false);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('2 of 4')).toBeTruthy();
    expect(screen.getByText('Fails 2 checks')).toBeTruthy();
    expect(screen.getByText('Not mastered')).toBeTruthy();
  });

  it('keeps a blocked Build focusable, described by its reason, and says why a press builds nothing', async () => {
    const packageStart = vi.fn(async () => PACKAGE_DONE);
    mount(BLOCKED, { packageStart });
    const button = await screen.findByRole('button', { name: /Build .* package/ });
    await screen.findByText('1 failing, 1 not ready');
    expect(button).toHaveProperty('disabled', false);
    const why = document.getElementById(button.getAttribute('aria-describedby') ?? '');
    expect(why?.textContent).toBe('1 failing, 1 not ready');
    await userEvent.tab();
    await userEvent.tab();
    button.focus();
    expect(document.activeElement).toBe(button);
    expect(screen.queryByRole('status')).toBeNull();
    await userEvent.click(button);
    expect(packageStart).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe('Nothing was built: 1 failing, 1 not ready');
  });

  it('says nothing is mastered as the reason when no chapter has been measured, and drops the note once every chapter passes', async () => {
    mount([]);
    const button = await screen.findByRole('button', { name: /Build .* package/ });
    await screen.findByText('0 failing, 4 not ready');
    expect(document.getElementById(button.getAttribute('aria-describedby') ?? '')?.textContent).toBe('0 failing, 4 not ready');
    cleanup();
    mount(PASSING);
    const ready = await screen.findByRole('button', { name: /Build .* package/ });
    await screen.findByText('Every chapter passes.');
    expect(ready.getAttribute('aria-disabled')).toBeNull();
    expect(ready.getAttribute('aria-describedby')).toBeNull();
  });

  it('names the first failing chapter, the rule, its value and its limit beside the disabled Build, and names none when nothing fails', async () => {
    mount(BLOCKED);
    expect((await screen.findByText(/^Chapter 04: noise floor/)).textContent).toBe('Chapter 04: noise floor −57.8 dBFS (limit ≤ −60 dBFS), and 1 more rule.');
    cleanup();
    mount(PASSING);
    await screen.findByText('Every chapter passes.');
    expect(screen.queryByText(/limit/)).toBeNull();
  });

  it('names the first not-ready chapter and why beside the disabled Build when nothing fails, and nothing when nothing was measured', async () => {
    mount([passing('Chapter 01.wav'), passing('Chapter 02.wav')]);
    expect((await screen.findByText('Chapter 03: no measured file yet.')).textContent).toBe('Chapter 03: no measured file yet.');
    expect(screen.getByRole('button', { name: /Build .* package/ }).getAttribute('aria-disabled')).toBe('true');
    cleanup();
    mount([]);
    await screen.findByText('0 failing, 4 not ready');
    expect(screen.queryByText(/no measured file yet/)).toBeNull();
  });

  it('lists the first hundred chapters of a very long book and the rest on request, counting all of them', async () => {
    const many = Array.from({ length: 150 }, (_, n) => chapter(n + 1, `Part ${n + 1} of the long book`));
    mount([], { manuscriptChapters: async () => many });
    expect(await screen.findByText('0 of 150')).toBeTruthy();
    expect(screen.getAllByText('Not mastered')).toHaveLength(100);
    await userEvent.click(screen.getByRole('button', { name: 'Show the other 50 chapters' }));
    expect(screen.getAllByText('Not mastered')).toHaveLength(150);
    expect(screen.queryByRole('button', { name: /Show the other/ })).toBeNull();
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
    expect((await findToast('no longer there')).text).toContain('no longer there');
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

  // The credits are chapters of the host's list: the opening first, the closing last, each judged by its measured file and counted in "n of N".
  describe('the credits rows', () => {
    const rowNames = () => screen.getAllByRole('button', { name: /Open in Master & QC/ }).map((row) => row.getAttribute('aria-label')?.split(':')[0]);
    const both = { manuscriptChapters: async () => [credits('opening'), ...CHAPTERS, credits('closing')] };

    it('lists the opening credits first and the closing credits last, and counts them', async () => {
      mount([...PASSING, passing('Opening credits.wav')], both);
      await screen.findByText('5 of 6');
      expect(rowNames()).toEqual(['Opening credits', 'Chapter 01', 'Chapter 02', 'Chapter 03', 'Chapter 04', 'Closing credits']);
      expect(screen.getByRole('button', { name: 'Opening credits: Pass. Open in Master & QC' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Closing credits: Not mastered. Open in Master & QC' })).toBeTruthy();
    });

    it('holds the build until the credits files pass too', async () => {
      mount(PASSING, both);
      await screen.findByText('4 of 6');
      expect(await screen.findByText('0 failing, 2 not ready')).toBeTruthy();
      expect(screen.getByRole('button', { name: /Build .* package/ }).getAttribute('aria-disabled')).toBe('true');
    });

    it('draws a kind the list lacks as no row', async () => {
      mount(PASSING, { manuscriptChapters: async () => [...CHAPTERS, credits('closing')] });
      await screen.findByText('4 of 5');
      expect(rowNames().at(-1)).toBe('Closing credits');
      expect(rowNames()[0]).toBe('Chapter 01');
    });
  });

  it('shows a failed package build', async () => {
    mount(PASSING, { packageStart: async () => ({ ...PACKAGE_DONE, phase: 'error', error: 'The folder is not writable.', files: [] }) });
    await userEvent.click(await screen.findByRole('button', { name: /Build .* package/ }));
    expect((await findToast('The folder is not writable.')).text).toContain('The folder is not writable.');
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
