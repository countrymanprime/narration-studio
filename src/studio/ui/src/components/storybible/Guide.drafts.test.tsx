// @vitest-environment jsdom
// The list menu's commands with an entry edit held (#3457, qa-breaker on #3457): a command waits for the answer to the question about leaving the entry being edited, and
// the entry already open takes its own command with no question about leaving it.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { CommandRouter } from '../../input/router';
import { OverlayProvider } from '../../overlay/OverlayProvider';
import { contextItemsFor } from '../../registries/context';
import { StudioProvider } from '../../studio/StudioProvider';
import { UnsavedDraftsProvider, useUnsavedDrafts } from '../../studio/drafts/unsavedDrafts';
import { entryRows, rowName } from './entryTableTestKit';
import { Guide } from './Guide';

afterEach(cleanup);

let asked: Array<() => void>;
function Shell() {
  const registry = useUnsavedDrafts();
  registry.setShell({ ask: (run) => (registry.heldNow().length > 0 ? void asked.push(run) : run()), go: () => {} });
  return null;
}

async function mount() {
  window.localStorage.clear();
  asked = [];
  const api = createMockApi();
  render(
    <MemoryRouter initialEntries={['/story-bible']}>
      <ApiProvider api={api}>
        <StudioProvider>
          <OverlayProvider>
            <UnsavedDraftsProvider>
              <CommandRouter>
                <Shell />
                <Guide notify={vi.fn()} goToManuscript={vi.fn()} />
              </CommandRouter>
            </UnsavedDraftsProvider>
          </OverlayProvider>
        </StudioProvider>
      </ApiProvider>
    </MemoryRouter>,
  );
  await screen.findAllByText('Alice');
  return api;
}
const row = (name: string) => entryRows().find((entryRow) => rowName(entryRow) === name)!;
const item = (name: string, label: string) => contextItemsFor(row(name))!.find((entry) => entry.label === label)!;

async function holdAnEditOn(name: string) {
  act(() => item(name, 'Open').onSelect());
  fireEvent.click(await screen.findByRole('button', { name: 'Edit this entry' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: `${name} typed` } });
}

describe('a list command with an entry edit held', () => {
  it('Delete entry on another entry waits for the answer, and Cancel does not leave it queued', async () => {
    await mount();
    await holdAnEditOn('Alice');
    act(() => item('Hatter', 'Delete entry').onSelect());
    expect(asked).toHaveLength(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    // Cancel: the asked move never runs. Opening Hatter later must not bring the delete confirm with it.
    asked.length = 0;
    act(() => item('Hatter', 'Open').onSelect());
    expect(asked).toHaveLength(1);
    act(() => asked[0]!());
    await screen.findByRole('heading', { name: 'Hatter' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('answering the question runs the command after the move', async () => {
    await mount();
    await holdAnEditOn('Alice');
    act(() => item('Hatter', 'Delete entry').onSelect());
    act(() => asked[0]!());
    expect(await screen.findByRole('alertdialog')).toBeTruthy();
  });

  it('Delete entry on the entry being edited opens its own confirm and asks nothing else', async () => {
    await mount();
    await holdAnEditOn('Alice');
    act(() => item('Alice', 'Delete entry').onSelect());
    expect(await screen.findByRole('alertdialog')).toBeTruthy();
    expect(asked).toHaveLength(0);
  });
});
