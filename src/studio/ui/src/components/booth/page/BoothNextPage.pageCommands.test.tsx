// @vitest-environment jsdom
// What the Booth offers the jump menu under "On this page": its chapters, the transport, and a pickup session's steps.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/hostWindow', () => ({ toggleFullscreen: vi.fn(async () => true), exitFullscreen: vi.fn(async () => {}) }));
vi.mock('../takeTone', async (original) => ({ ...(await original<typeof import('../takeTone')>()), playTakeTone: vi.fn(async () => {}) }));

import type { PickupItem, PickupList } from '../../../api/contracts/pickups';
import { defaultKeymap } from '../../../input/keymap';
import { COMMAND_CATALOG } from '../../../input/commands.catalog';
import { currentPageContext, type PageItem } from '../../../input/pageCommands';
import { OverlayHost } from '../../../overlay/OverlayHost';
import { createOverlayService } from '../../../overlay/overlayService';
import type { DawClient } from '../../../ports/daw';
import type { NarrationApi } from '../../../types';
import { openJumpMenu } from '../../layout/JumpMenu';
import { forgetAppTake, skipStartGuard } from '../record/useRecordControl';
import { BoothNextPage } from './BoothNextPage';
import { BoothHost, dawFor, newJournal, pageApi } from './testPage';
import type { DawSetupId } from '../../../fixtures/daw';

beforeEach(() => forgetAppTake());
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

let address = '';
function Address() {
  address = useLocation().search;
  return null;
}

function renderPage({ setup = 'reaper', daw, search, api = {} }: { setup?: DawSetupId; daw?: DawClient; search?: string; api?: Partial<NarrationApi> } = {}) {
  const client = daw ?? dawFor(setup);
  const recordStart = vi.spyOn(client, 'recordStart');
  const view = render(
    <BoothHost
      api={pageApi({ passageMapRecordRun: async () => {}, teleprompterStop: async () => {}, ...api } as Partial<NarrationApi>)}
      daw={client}
      journal={newJournal()}
      overlay={createOverlayService()}
      search={search}
    >
      <BoothNextPage hasManuscript navigate={vi.fn()} />
      <Address />
    </BoothHost>,
  );
  return { view, recordStart };
}

const items = (group?: string): readonly PageItem[] => (currentPageContext()?.items ?? []).filter((i) => group === undefined || i.group === group);
const item = (id: string): PageItem => {
  const found = items().find((i) => i.id === id);
  if (!found) throw new Error(`no page item ${id}; have ${items().map((i) => i.id)}`);
  return found;
};
const ready = async () => {
  await screen.findByText('Nobody', { exact: false });
  await waitFor(() => expect((screen.getByRole('button', { name: /^Record$/ }) as HTMLButtonElement).disabled).toBe(false));
};
const current = () => document.querySelector<HTMLElement>('[data-state="cur"]')?.dataset.unit;
const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))));
const run = async (id: string) => {
  skipStartGuard();
  act(() => item(id).run());
  await settle();
};

const pickup = (id: string, chapterId: string, paragraphId: string, script: string): PickupItem => ({
  id,
  chapterId,
  paragraphId,
  paragraph: null,
  time: 65,
  at: null,
  type: 'misread',
  script,
  context: '',
  source: 'you',
  confidence: null,
  confReason: '',
  included: true,
  done: false,
  waiting: false,
});
const pickupApi = (): Partial<NarrationApi> => {
  const answer = (): PickupList => ({
    pickups: [pickup('k1', 'c1', 'p3', 'She turned and walked away.'), pickup('k2', 'c2', 'q1', 'A new day began in the court.')],
    leftOut: [],
  });
  return { pickupsList: async () => answer(), pickupsSetDone: async () => answer() };
};

describe('Booth page commands', () => {
  it('registers-as-Booth-and-replaces-the-global-chapter-rows', async () => {
    renderPage();
    await ready();
    expect(currentPageContext()).toMatchObject({ id: 'booth', label: 'Booth', supersedes: ['Chapters'] });
  });

  it('lists-the-chapters-and-choosing-one-opens-it-in-the-Booth', async () => {
    renderPage();
    await ready();
    expect(items('Chapters').map((i) => i.id)).toEqual(['chapter.c1', 'chapter.c2']);
    expect(item('chapter.c1').hint).toBe('Open now');
    expect(item('chapter.c2').hint).toBeUndefined();
    await run('chapter.c2');
    await waitFor(() => expect(address).toContain('chapter=c2'));
    await waitFor(() => expect(document.body.textContent).toContain('A new day began in the court.'));
    await waitFor(() => expect(item('chapter.c2').hint).toBe('Open now'));
  });

  it('offers-the-transport-and-the-roll-before-a-take-runs', async () => {
    renderPage();
    await ready();
    const record = item('transport.record');
    expect(record).toMatchObject({ label: 'Record', group: 'Transport', icon: 'record' });
    expect(record.disabledReason).toBeUndefined();
    expect(item('transport.roll').disabledReason).toBeUndefined();
    expect(item('transport.next').disabledReason).toBeUndefined();
    expect(item('transport.prev').disabledReason).toBeUndefined();
  });

  it('Record-starts-a-take-and-the-items-follow-it', async () => {
    const page = renderPage();
    await ready();
    await run('transport.record');
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
    expect(page.recordStart).toHaveBeenCalledTimes(1);
    expect(item('transport.record')).toMatchObject({ label: 'Stop recording', icon: 'stop' });
    expect(item('transport.record').disabledReason).toBeUndefined();
    expect(item('transport.roll').disabledReason).toBeUndefined();
    // The chapter cannot change during a take, as the picker says.
    expect(item('chapter.c2').disabledReason).toMatch(/Stop the take first/);
    await run('transport.record');
    await waitFor(() => expect(item('transport.record').label).toBe('Record'));
    expect(item('chapter.c2').disabledReason).toBeUndefined();
  });

  // The item stays runnable: a press that cannot start a take says why in front of the narrator (a dialog or a message), never by a greyed item.
  it('a-DAW-that-is-not-answering-turns-Record-off-with-the-Booths-own-sentence', async () => {
    const page = renderPage({ setup: 'reaper-off' });
    await screen.findByText('Nobody', { exact: false });
    await waitFor(() => expect(screen.getByRole('button', { name: /^Record$/ }).getAttribute('aria-disabled')).toBe('true'));
    expect(item('transport.record').disabledReason).toBeUndefined();
    await run('transport.record');
    expect(page.recordStart).not.toHaveBeenCalled();
  });

  it('Next-and-Previous-phrase-move-the-reading', async () => {
    renderPage();
    await ready();
    const before = current();
    await run('transport.next');
    await waitFor(() => expect(current()).not.toBe(before));
    const moved = current();
    await run('transport.prev');
    await waitFor(() => expect(current()).toBe(before));
    expect(moved).not.toBe(before);
  });

  it('a-pickup-session-adds-its-steps-and-no-session-adds-none', async () => {
    renderPage();
    await ready();
    expect(items('Pickups')).toEqual([]);
    cleanup();
    renderPage({ search: '?chapter=c1&pickups=k1,k2', api: pickupApi() });
    await ready();
    await waitFor(() => expect(items('Pickups').map((i) => i.id)).toEqual(['pickups.next', 'pickups.prev']));
    await waitFor(() => expect(item('pickups.next').disabledReason).toBeUndefined());
    await run('pickups.next');
    await waitFor(() => expect(address).toContain('chapter=c2'));
  });

  it('leaves-the-Booth-from-the-menu', async () => {
    renderPage();
    await ready();
    expect(item('booth.exit')).toMatchObject({ label: 'Leave the Booth', hint: 'Escape' });
  });

  it('the-menu-draws-them-under-On-this-page', async () => {
    renderPage();
    await ready();
    const service = createOverlayService();
    render(<OverlayHost service={service} />);
    act(() => void openJumpMenu({ service, keymap: defaultKeymap(COMMAND_CATALOG, false), runCommand: () => {} }));
    const heads = Array.from(document.querySelectorAll('[role="listbox"] [role="presentation"]')).map((n) => n.textContent);
    expect(heads[0]).toBe('On this page');
    const rows = screen.getAllByRole('option').map((o) => o.textContent ?? '');
    expect(rows.slice(0, 2).join('|')).toMatch(/Chapters.*Transport/);
  });

  it('has-no-host-load-so-opening-the-menu-waits-on-nothing', async () => {
    renderPage();
    await ready();
    expect(currentPageContext()?.load).toBeUndefined();
  });

  it('unmounting-the-page-takes-its-items-away', async () => {
    const { view } = renderPage();
    await ready();
    expect(currentPageContext()).not.toBeNull();
    view.unmount();
    expect(currentPageContext()).toBeNull();
  });

  it('a-project-with-no-manuscript-offers-nothing', () => {
    render(
      <BoothHost api={pageApi()} daw={dawFor('reaper')} journal={newJournal()} overlay={createOverlayService()}>
        <BoothNextPage hasManuscript={false} navigate={vi.fn()} />
      </BoothHost>,
    );
    expect(currentPageContext()).toBeNull();
  });
});
