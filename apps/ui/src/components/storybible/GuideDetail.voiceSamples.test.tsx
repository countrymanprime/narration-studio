// @vitest-environment jsdom
// An entry's Voice samples section: where it sits, and what the entry's own state allows (the PRD's open question 8: playing, renaming and
// Make primary work on a read-only entry; Move and Delete appear only after Edit; a locked entry never reaches Edit). The section's own
// states are voicesamples/voiceSamples.test.tsx.
//
//   empty, one, many   an entry with none says how to mark one (Alice); the Hatter has one; the Queen has four
//   read-only          'a read-only entry\'s menu has Rename and Make primary, not Move or Delete'
//   edit mode          'Edit brings Move and Delete in, and Cancel takes them out again'
//   locked             'a locked entry plays, renames and sets primary, and has no Edit to bring Move or Delete in'
//   not a speaker      'a place has no Voice samples section'
//   new draft          not tested: a draft has no id the host knows, and the section is not drawn for it (isNewDraft)
//   reference clips    'sits above Reference clips, and a reference clip has no Play stub any more'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_ENTITIES } from '../../api/mockFixtures';
import { GuideDetail } from './GuideDetail';

afterEach(cleanup);

function open(id: string) {
  const entity = WIRE_ENTITIES.find((row) => row.id === id)!;
  render(
    <ApiProvider api={createMockApi({}, { voiceSamples: 'bible' })}>
      <MemoryRouter>
        <GuideDetail entity={entity} entities={WIRE_ENTITIES} reload={vi.fn().mockResolvedValue(undefined)} notify={vi.fn()} goToManuscript={vi.fn()} />
      </MemoryRouter>
    </ApiProvider>,
  );
}

const section = () => screen.findByRole('region', { name: 'Voice samples' });
const menuItems = async (user: ReturnType<typeof userEvent.setup>, trigger: HTMLElement) => {
  await user.click(trigger);
  return (await screen.findAllByRole('menuitem')).map((item) => item.textContent);
};

describe('the Voice samples section of an entry', () => {
  it("lists the entry's samples, an entry with none says how to mark one, and a place has no section", async () => {
    open('mad-hatter');
    const hatter = await section();
    await within(hatter).findByText('Tea party, quick');
    expect(within(hatter).getAllByRole('listitem')).toHaveLength(1);
    cleanup();

    open('alice');
    expect(await within(await section()).findByText(/No voice samples yet/)).toBeTruthy();
    cleanup();

    open('queens-garden');
    expect(screen.queryByRole('region', { name: 'Voice samples' })).toBeNull();
  });

  it('sits above Reference clips, and a reference clip has no Play stub any more', async () => {
    open('mad-hatter');
    const samples = await section();
    const references = await screen.findByText('Reference clips');
    expect(samples.compareDocumentPosition(references) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await screen.findByText('Hatter ref A');
    expect(screen.queryByRole('button', { name: /^Play Hatter ref A/ })).toBeNull();
    expect(document.body.textContent).not.toContain('future integration');
  });

  it("a read-only entry's menu has Rename and Make primary, not Move or Delete", async () => {
    const user = userEvent.setup();
    open('mad-hatter');
    await screen.findByText('Tea party, quick');
    // The Hatter's one sample is its primary: Rename only.
    expect(await menuItems(user, screen.getByRole('button', { name: 'More about Tea party, quick' }))).toEqual(['Rename…']);
  });

  it('Edit brings Move and Delete in, and Cancel takes them out again', async () => {
    const user = userEvent.setup();
    open('mad-hatter');
    await screen.findByText('Tea party, quick');
    fireEvent.click(screen.getByRole('button', { name: 'Edit this entry' }));
    const more = screen.getByRole('button', { name: 'More about Tea party, quick' });
    expect(await menuItems(user, more)).toEqual(['Rename…', 'Move to a character…', 'Delete…']);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel editing' }));
    expect(await menuItems(user, screen.getByRole('button', { name: 'More about Tea party, quick' }))).toEqual(['Rename…']);
  });

  it('a locked entry plays, renames and sets primary, and has no Edit to bring Move or Delete in', async () => {
    const user = userEvent.setup();
    open('queen-of-hearts');
    await screen.findByText('Sulking');
    expect(screen.queryByRole('button', { name: 'Edit this entry' })).toBeNull();
    // A sample that is not the primary offers Make primary; none offers Move or Delete.
    expect(await menuItems(user, screen.getByRole('button', { name: 'More about Sulking' }))).toEqual(['Rename…', 'Make primary']);
    expect(screen.getAllByRole('button', { name: /^Play voice sample: / }).length).toBeGreaterThan(0);
  });
});
