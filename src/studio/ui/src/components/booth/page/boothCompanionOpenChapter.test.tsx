// @vitest-environment jsdom
// #4087, one rule: the Booth and the Companion open on the same chapter when none is asked. The order lives once (running session, `keptChapterIn`, the DAW's
// chapter through `useFollowDawOnOpen`, then `firstTextChapter`), so a DAW that names no chapter, whatever the reader state says, gives both the same one.
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const spies = vi.hoisted(() => ({ shellProps: vi.fn() }));

vi.mock('../../../api/hostWindow', () => ({ toggleFullscreen: vi.fn(async () => true), exitFullscreen: vi.fn(async () => {}) }));
vi.mock('../takeTone', async (original) => ({ ...(await original<typeof import('../takeTone')>()), playTakeTone: vi.fn(async () => {}) }));
vi.mock('../CompanionShell', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../CompanionShell')>();
  return {
    CompanionShell: (props: Parameters<typeof actual.CompanionShell>[0]) => {
      spies.shellProps(props);
      return <actual.CompanionShell {...props} />;
    },
  };
});
vi.mock('../ResumePrompt', () => ({ ResumePrompt: () => null }));

import { createOverlayService } from '../../../overlay/overlayService';
import { forgetAppTake } from '../record/useRecordControl';
import { CompanionPage } from '../companion/CompanionPage';
import { BoothNextPage } from './BoothNextPage';
import { BoothHost, dawFor, newJournal, pageApi } from './testPage';
import { saveLastPlace } from './lastPlace';
import type { NarrationApi } from '../../../types';

beforeEach(() => forgetAppTake());
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

/** The reader state names chapter two, as a narrator who read it last would leave it. */
const READER_ON_TWO = async () => ({ ...(await pageApi().readerState()), activeChapter: 'Chapter Two' });
const place = (chapterId: string, word = 0) => ({ ok: true, message: '', chapterId, selected: chapterId === '' ? 0 : 1, cursor: word });

const CASES: [string, NarrationApi['dawPlace']][] = [
  ['no chapter selected in the DAW', async () => place('')],
  ['a chapter the book does not have', async () => place('nowhere')],
  ['a refusal (no DAW linked)', async () => ({ ok: false, message: 'No DAW is linked.', chapterId: '', selected: 0, cursor: 0 })],
  [
    'a read that throws',
    async () => {
      throw new Error('no answer');
    },
  ],
];

const wrap = (api: NarrationApi, children: React.ReactNode, search = '') => (
  <BoothHost api={api} daw={dawFor('reaper')} journal={newJournal()} overlay={createOverlayService()} search={search}>
    {children}
  </BoothHost>
);

async function boothOpensOn(overrides: Partial<NarrationApi>): Promise<string> {
  render(wrap(pageApi(overrides), <BoothNextPage hasManuscript navigate={vi.fn()} projectFolder="/proj" />));
  await waitFor(() => expect(document.body.textContent).toMatch(/The Garden was quiet|A new day began in the court\./));
  return document.body.textContent?.includes('A new day began in the court.') ? 'c2' : 'c1';
}

async function companionOpensOn(overrides: Partial<NarrationApi>): Promise<string> {
  spies.shellProps.mockClear();
  render(wrap(pageApi(overrides), <CompanionPage projectFolder="/proj" />));
  await waitFor(() => expect(spies.shellProps).toHaveBeenCalled());
  return spies.shellProps.mock.calls.at(-1)![0].chapterId as string;
}

describe('the Booth and the Companion open on the same chapter (#4087)', () => {
  it.each(CASES)('%s, nothing remembered, the reader state on chapter two: both open the first chapter', async (_name, dawPlace) => {
    const overrides = { dawPlace, readerState: READER_ON_TWO };
    const booth = await boothOpensOn(overrides);
    cleanup();
    const companion = await companionOpensOn(overrides);
    expect(booth).toBe('c1');
    expect(companion).toBe(booth);
  });

  it('the DAW on chapter two, nothing remembered: both open chapter two', async () => {
    const overrides = { dawPlace: async () => place('c2'), readerState: async () => ({ ...(await pageApi().readerState()), activeChapter: 'Chapter One' }) };
    const booth = await boothOpensOn(overrides);
    cleanup();
    expect(await companionOpensOn(overrides)).toBe(booth);
    expect(booth).toBe('c2');
  });

  it('a remembered chapter wins over the DAW in both', async () => {
    saveLastPlace('/proj', { chapterId: 'c1', paragraphId: 'p3', word: 1 });
    const overrides = { dawPlace: async () => place('c2') };
    const booth = await boothOpensOn(overrides);
    cleanup();
    expect(await companionOpensOn(overrides)).toBe(booth);
    expect(booth).toBe('c1');
  });
});
