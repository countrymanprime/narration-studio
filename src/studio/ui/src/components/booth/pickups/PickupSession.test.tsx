// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PickupItem, PickupList } from '../../../api/contracts/pickups';
import { CommandScope } from '../../../input/router';
import { createOverlayService } from '../../../overlay/overlayService';
import { boothSections } from '../side/sections';
import { BoothSidePanel } from '../side/BoothSidePanel';
import { sideData } from '../side/fixture';
import { BoothHost, dawFor, newJournal, pageApi } from '../page/testPage';
import { boothUnits } from '../reading/boothUnits';
import { PickupSession, PickupSessionProvider, registerPickupSession } from './PickupSession';
import { usePickupSession, type PickupSessionModel, type StoppedTake } from './usePickupSession';

afterEach(cleanup);

const line = (id: string, chapterId: string, paragraphId: string, extra: Partial<PickupItem> = {}): PickupItem => ({
  id,
  chapterId,
  paragraphId,
  paragraph: null,
  time: 65,
  at: null,
  type: 'misread',
  script: `Line ${id}`,
  context: '',
  source: 'you',
  confidence: null,
  confReason: '',
  included: true,
  done: false,
  waiting: false,
  ...extra,
});

const PARAGRAPHS = ['p1', 'p2', 'p3', 'p4'].map((id) => ({ id, text: `Text of ${id}.` }));
const UNITS = boothUnits(PARAGRAPHS);

/** The host: one list, a done state that the DAW can change behind the app's back, and a refusal on demand. */
function host(initial: PickupItem[]) {
  let items = initial;
  const state = { refuse: null as string | null };
  const answer = (): PickupList => ({ pickups: items.map((item) => ({ ...item })), leftOut: [] });
  return {
    items: () => items,
    /** A marker renamed in the DAW. */
    inDaw: (id: string, done: boolean) => {
      items = items.map((item) => (item.id === id ? { ...item, done } : item));
    },
    refuse: (reason: string | null) => {
      state.refuse = reason;
    },
    api: {
      pickupsList: vi.fn(async () => answer()),
      pickupsSetDone: vi.fn(async (id: string, done: boolean) => {
        if (state.refuse) throw new Error(state.refuse);
        items = items.map((item) => (item.id === id ? { ...item, done } : item));
        return answer();
      }),
      pickupsRemove: vi.fn(async (id: string) => {
        items = items.filter((item) => item.id !== id);
        return answer();
      }),
    },
  };
}

const LIST = (): PickupItem[] => [line('a', 'c3', 'p1'), line('b', 'c3', 'p2'), line('c', 'c3', 'p4'), line('d', 'c5', 'q1')];

let model: PickupSessionModel;
let stop: (take: StoppedTake) => Promise<number>;
let overlay = createOverlayService();

function Session({ ids, recording = false, jumps }: { ids: string[]; recording?: boolean; jumps: (line: PickupItem) => void }) {
  const session = usePickupSession({ ids, chapterId: 'c3', units: UNITS, recording, onJump: jumps });
  model = session;
  stop = session.takeStopped;
  return (
    <>
      {PARAGRAPHS.map((paragraph) => {
        const bar = session.bars.find((item) => item.paragraphId === paragraph.id);
        return (
          <p key={paragraph.id} data-bar={bar ? (bar.done ? 'ok' : 'open') : undefined}>
            {paragraph.text}
          </p>
        );
      })}
      <PickupSession session={session} chapterLabel={(id) => `Ch ${id.slice(1)}`} />
    </>
  );
}

function mount(h: ReturnType<typeof host>, props: { ids: string[]; recording?: boolean }) {
  const jumps = vi.fn();
  const api = pageApi(h.api as never);
  const tree = (next: { ids: string[]; recording?: boolean }) => (
    <BoothHost api={api} daw={dawFor('reaper')} journal={newJournal()} overlay={overlay}>
      <CommandScope kind="booth">
        <Session {...next} jumps={jumps} />
      </CommandScope>
    </BoothHost>
  );
  const view = render(tree(props));
  return { jumps, rerender: (next: { ids: string[]; recording?: boolean }) => view.rerender(tree(next)), unmount: view.unmount };
}

const toasts = () => overlay.getSnapshot().toasts.map((toast) => toast.text);
const press = (key: string, init: KeyboardEventInit = {}) =>
  act(() => {
    fireEvent.keyDown(document.body, { key, code: key.toLowerCase() === 'n' ? 'KeyN' : key, ...init });
  });
const bars = () => [...document.querySelectorAll('p[data-bar]')].map((node) => `${node.textContent}:${node.getAttribute('data-bar')}`);

beforeEach(() => {
  overlay = createOverlayService();
});

describe('a pickup session in the Booth', () => {
  it('lines-are-marked-listed-and-counted: a bar in the text, a row in the panel, the open ones counted', async () => {
    mount(host(LIST()), { ids: ['a', 'b', 'c'] });
    expect(await screen.findByText('Pickups · 3 open')).toBeTruthy();
    expect(bars()).toEqual(['Text of p1.:open', 'Text of p2.:open', 'Text of p4.:open']);
    expect(document.querySelectorAll('[data-pj]')).toHaveLength(3);
    // The first line is the current one.
    expect(document.querySelector('[data-pj="a"]')?.getAttribute('aria-current')).toBe('true');
    expect(within(document.querySelector('[data-pj="a"]') as HTMLElement).getByText('Ch 3 · 1:05')).toBeTruthy();
  });

  it('n-goes-to-the-next-pickup-even-in-another-chapter: Shift+N back, wrapping', async () => {
    const { jumps } = mount(host(LIST()), { ids: ['a', 'c', 'd'] });
    await screen.findByText('Pickups · 3 open');
    press('n');
    expect(model.at).toBe('c');
    press('n');
    expect(model.at).toBe('d');
    expect(jumps).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'd', chapterId: 'c5' }));
    press('n');
    expect(model.at).toBe('a');
    press('N', { shiftKey: true });
    expect(model.at).toBe('d');
  });

  it('n-goes-to-the-next-pickup: N and Shift+N do nothing outside a session', async () => {
    const { jumps } = mount(host(LIST()), { ids: [] });
    press('n');
    press('N', { shiftKey: true });
    expect(jumps).not.toHaveBeenCalled();
    expect(model.at).toBeNull();
  });

  it('clicking-a-pickup-jumps-to-it-not-while-recording', async () => {
    const h = host(LIST());
    const { jumps, rerender } = mount(h, { ids: ['a', 'c'] });
    await userEvent.click(await screen.findByRole('button', { name: /Line c/ }));
    expect(model.at).toBe('c');
    expect(jumps).toHaveBeenCalledTimes(1);
    rerender({ ids: ['a', 'c'], recording: true });
    await userEvent.click(screen.getByRole('button', { name: /Line a/ }));
    press('n');
    expect(model.at).toBe('c');
    expect(jumps).toHaveBeenCalledTimes(1);
    expect(toasts()).toContain('Stop recording first.');
  });

  it('a-take-that-ran-over-a-line-marks-it-recorded-and-the-toast-can-undo', async () => {
    const h = host(LIST());
    mount(h, { ids: ['a', 'b', 'c'] });
    await screen.findByText('Pickups · 3 open');
    // Began on the first sentence, stopped on the third paragraph: the lines on p1 and p2 are read over, p4 is not.
    await act(async () => {
      await stop({ began: 0, stopped: 2 });
    });
    expect(h.api.pickupsSetDone.mock.calls).toEqual([
      ['a', true],
      ['b', true],
    ]);
    expect(await screen.findByText('Pickups · 1 open')).toBeTruthy();
    expect(bars()).toEqual(['Text of p1.:ok', 'Text of p2.:ok', 'Text of p4.:open']);
    expect(toasts()).toContain('Take saved · 2 pickups marked recorded');
    const toast = overlay.getSnapshot().toasts.find((item) => item.text.startsWith('Take saved'));
    await act(async () => {
      toast?.action?.onAction();
    });
    await waitFor(() => expect(h.items().filter((item) => item.done)).toEqual([]));
    expect(await screen.findByText('Pickups · 3 open')).toBeTruthy();
  });

  it('a-take-that-ran-over-a-line: one line reads as singular, and a take that stopped before the line leaves it open', async () => {
    const h = host(LIST());
    mount(h, { ids: ['a', 'c'] });
    await screen.findByText('Pickups · 2 open');
    await act(async () => {
      expect(await stop({ began: 0, stopped: 0 })).toBe(1);
    });
    expect(toasts()).toContain('Take saved · 1 pickup marked recorded');
    await act(async () => {
      expect(await stop({ began: 1, stopped: 2 })).toBe(0);
    });
    expect(h.api.pickupsSetDone).toHaveBeenCalledTimes(1);
  });

  it('a-take-that-ran-over-a-line: leaving mid-take marks recorded lines quietly', async () => {
    const h = host(LIST());
    mount(h, { ids: ['a'] });
    await screen.findByText('Pickups · 1 open');
    await act(async () => {
      await stop({ began: 0, stopped: 1, quiet: true });
    });
    expect(h.items()[0].done).toBe(true);
    expect(toasts()).toEqual([]);
  });

  it('done-writes-through-to-the-marker: both ways, and a refusal leaves the line open and says why', async () => {
    const h = host(LIST());
    mount(h, { ids: ['a'] });
    await screen.findByText('Pickups · 1 open');
    h.refuse('REAPER has no marker there.');
    await act(async () => {
      expect(await stop({ began: 0, stopped: 1 })).toBe(0);
    });
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0]).toContain('REAPER has no marker there.');
    expect(screen.getByText('Pickups · 1 open')).toBeTruthy();
    h.refuse(null);
    await act(async () => {
      await stop({ began: 0, stopped: 1 });
    });
    expect(h.api.pickupsSetDone).toHaveBeenLastCalledWith('a', true);
    const toast = overlay.getSnapshot().toasts.find((item) => item.text.startsWith('Take saved'));
    await act(async () => {
      toast?.action?.onAction();
    });
    await waitFor(() => expect(h.api.pickupsSetDone).toHaveBeenLastCalledWith('a', false));
  });

  it('the-booth-reconciles-with-the-daw-on-open: done in the DAW is done here, and a reopened one is open', async () => {
    const h = host(LIST());
    h.inDaw('a', true);
    const first = mount(h, { ids: ['a', 'b'] });
    expect(await screen.findByText('Pickups · 1 open')).toBeTruthy();
    expect(bars()[0]).toBe('Text of p1.:ok');
    expect(document.querySelector('[data-pj="a"]')?.textContent).toContain('✓');
    first.unmount();
    cleanup();
    h.inDaw('a', false);
    mount(h, { ids: ['a', 'b'] });
    expect(await screen.findByText('Pickups · 2 open')).toBeTruthy();
    expect(h.api.pickupsList).toHaveBeenCalledTimes(2);
  });

  it('the pickup list is empty outside a session', async () => {
    const h = host(LIST());
    mount(h, { ids: [] });
    expect(document.querySelectorAll('[data-pj]')).toHaveLength(0);
    expect(document.querySelector('p[data-bar]')).toBeNull();
    expect(h.api.pickupsList).not.toHaveBeenCalled();
  });

  it('suspected-lines-use-the-pickups-shape: a line from the speech check is marked Automatic and can be dismissed', async () => {
    const h = host([line('s', 'c3', 'p3', { source: 'speech', gap: 'missing', script: 'down the hole' }), ...LIST()]);
    mount(h, { ids: ['s', 'a'] });
    expect(await screen.findByText('Automatic')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Dismiss:/ })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss: down the hole' }));
    expect(h.api.pickupsRemove).toHaveBeenCalledWith('s');
    expect(await screen.findByText('Pickups · 1 open')).toBeTruthy();
    expect(screen.queryByText('Automatic')).toBeNull();
    expect(toasts()).toContain('Dismissed.');
  });
});

describe('the side panel section', () => {
  it('registers ahead of the panel’s other sections and reads the page’s session', async () => {
    registerPickupSession();
    expect(boothSections()[0].id).toBe('pickups');
    const h = host(LIST());
    function Panel() {
      const session = usePickupSession({ ids: ['a', 'b'], chapterId: 'c3', units: UNITS, recording: false, onJump: () => undefined });
      return (
        <PickupSessionProvider value={{ session }}>
          <BoothSidePanel data={sideData()} open drawer={false} onOpenChange={() => undefined} />
        </PickupSessionProvider>
      );
    }
    render(
      <BoothHost api={pageApi(h.api as never)} daw={dawFor('reaper')} journal={newJournal()} overlay={overlay}>
        <Panel />
      </BoothHost>,
    );
    const text = (await screen.findByRole('complementary', { name: 'Side panel' })).textContent ?? '';
    expect(text).toContain('Pickups · 2 open');
    expect(text.indexOf('Pickups')).toBeLessThan(text.indexOf('Voices in this scene'));
  });
});
