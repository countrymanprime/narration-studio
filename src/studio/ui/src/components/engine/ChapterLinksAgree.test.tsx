// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { EnginePanel, type EngineLinkState } from './EnginePanel';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_CHAPTERS, WIRE_TRACKS_PROJECT } from '../../api/mockFixtures';
import { headingName } from '../../chapterHeading';
import { chapterName } from '../../chapterName';
import type { NarrationApi } from '../../types';

afterEach(cleanup);

const LINK: EngineLinkState = {
  dawFileLinked: true,
  dawReachable: false,
  dawProjectMatches: false,
  checkedAt: null,
  onCheckAgain: () => {},
  onLinkDawFile: () => {},
  linkingDawFile: false,
};
const TRACKS = WIRE_TRACKS_PROJECT.tracks;

function renderEngine(api: NarrationApi) {
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <EnginePanel open onClose={() => {}} notify={() => {}} link={LINK} />
      </ApiProvider>
    </MemoryRouter>,
  );
}

// The Chapter links section, row by row: chapter name -> what it says about the link ('Not linked', or the track's name).
async function sectionState(): Promise<Map<string, string>> {
  const table = await screen.findByRole('table', { name: 'Chapter links', hidden: true });
  const state = new Map<string, string>();
  for (const row of within(table).getAllByRole('row', { hidden: true }).slice(1)) {
    const cells = within(row).getAllByRole('cell', { hidden: true });
    const badge = cells[1].textContent ?? '';
    state.set(cells[0].textContent ?? '', badge === 'Linked' ? (cells[2].textContent ?? '') : badge);
  }
  return state;
}

// The modal, row by row: chapter name -> the track its picker holds ('Not linked' when empty).
function modalState(): Map<string, string> {
  const dialog = screen.getByRole('dialog', { name: 'Link chapters to REAPER' });
  const table = within(dialog).getByRole('table', { name: 'Chapter to track mapping' });
  const state = new Map<string, string>();
  for (const row of within(table).getAllByRole('row').slice(1)) {
    const select = within(row).getByRole('combobox') as HTMLSelectElement;
    state.set(within(row).getAllByRole('cell')[0].textContent ?? '', select.selectedOptions[0]?.textContent ?? '');
  }
  return state;
}

async function openModal() {
  await userEvent.setup().click(await screen.findByRole('button', { name: 'Link chapters…' }));
  await screen.findByRole('dialog', { name: 'Link chapters to REAPER' });
}

describe('Chapter links section and the Link chapters modal read one mapping', () => {
  // Owner bug: the modal opened saying none of the chapters were linked while the Chapter links section said they were.
  it('opens with the chapters the section already shows as linked', async () => {
    renderEngine(createMockApi({}, { chapterSync: 'activity' }));
    await waitFor(async () => expect((await sectionState()).get(headingName(WIRE_CHAPTERS[0]))).toBe(TRACKS[0].name));

    await openModal();
    await waitFor(() => expect(modalState().get(headingName(WIRE_CHAPTERS[0]))).toBe(TRACKS[0].name));
  });

  // Class-wide guard: whatever the project holds (some linked, some not, the credits linked), both surfaces say the same per chapter.
  it('agrees per chapter and in count with linked, unlinked and credits rows', async () => {
    const api = createMockApi({}, { chapterSync: 'activity' });
    await api.chapterTrackSet('credits-opening', TRACKS[2].guid);
    renderEngine(api);

    await waitFor(async () => expect((await sectionState()).get('Opening credits')).toBe(TRACKS[2].name));
    const section = await sectionState();
    await openModal();
    await waitFor(() => expect(modalState().size).toBe(section.size));
    const modal = modalState();

    expect([...modal.entries()].sort()).toEqual([...section.entries()].sort());
    const linked = (state: Map<string, string>) => [...state.values()].filter((value) => value !== 'Not linked').length;
    expect(linked(modal)).toBe(linked(section));
    expect(modal.get('Opening credits')).toBe(TRACKS[2].name);
    expect([...modal.values()]).toContain('Not linked');
  });

  it('a link made in the modal shows in the section, and a clear in the modal clears it, at once', async () => {
    const user = userEvent.setup();
    const api = createMockApi({}, { chapterSync: 'activity' });
    renderEngine(api);
    const target = WIRE_CHAPTERS[2];
    await waitFor(async () => expect((await sectionState()).get(headingName(target))).toBe('Not linked'));
    await openModal();

    const dialog = screen.getByRole('dialog', { name: 'Link chapters to REAPER' });
    const picker = () => within(dialog).getByRole('combobox', { name: `Track for ${chapterName(target, 'short')}` });
    await user.selectOptions(picker(), TRACKS[2].guid);
    expect((await api.chapterTrackMapList()).mappings.some((mapping) => mapping.chapterId === target.id && mapping.trackGuid === TRACKS[2].guid)).toBe(true);
    await waitFor(() => expect(modalState().get(headingName(target))).toBe(TRACKS[2].name));
    expect((await sectionState()).get(headingName(target))).toBe(TRACKS[2].name);

    await user.selectOptions(picker(), '');
    await waitFor(async () => expect((await api.chapterTrackMapList()).mappings.some((mapping) => mapping.chapterId === target.id)).toBe(false));
    await waitFor(() => expect(modalState().get(headingName(target))).toBe('Not linked'));
    expect((await sectionState()).get(headingName(target))).toBe('Not linked');
  });

  // A link whose track left the project reads the same on both surfaces, not "Not linked" in one of them.
  it('shows a link to a track that is gone as "Track missing" in both', async () => {
    const api = createMockApi({}, { chapterSync: 'activity' });
    await api.chapterTrackMapConfirm('gone-track-guid', WIRE_CHAPTERS[2].id);
    renderEngine(api);

    await waitFor(async () => expect((await sectionState()).get(headingName(WIRE_CHAPTERS[2]))).toBe('Track missing'));
    await openModal();
    await waitFor(() => expect(modalState().get(headingName(WIRE_CHAPTERS[2]))).toBe('Track missing'));
  });
});
