import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { fxChainsSource } from '../../../../fixtures/daw';
import type { WordFx } from '../../../../api/contracts/wordFx';
import { ContextMenu } from '../../../primitives/ContextMenu';
import { Dialog } from '../../../primitives/Dialog';
import { screen } from '../../../primitives/portalScreen';
import { marksDoc } from '../../script/scriptFixtures';
import type { RangePlan } from '../common/rangePlan';
import { locator } from '../cut/cutFixtures';
import { AddFxButton, FxMarker } from './FxButtons';
import { FxDialog } from './FxDialog';
import { fxMenuItems } from './fxMenu';
import { fxTitle } from './fxText';

type Acting = Exclude<RangePlan, { kind: 'refused' }>;

const doc = marksDoc();
const keys = ['p-1:3', 'p-1:4'];
const snap = (at: number) => Promise.resolve({ time: at + 0.0012, moved: 0.0012 });
const list = {
  source: fxChainsSource('REAPER'),
  choices: [
    { id: 'Podcast Voice.RfxChain', name: 'Podcast Voice.RfxChain' },
    { id: 'Vocal Chain/Warmth.RfxChain', name: 'Vocal Chain/Warmth.RfxChain' },
  ],
};

/** The question as the overlay draws it: the Dialog primitive with the dialog's own body and buttons. */
function Question({ plan, over = null }: { plan: Acting; over?: string | null }) {
  return (
    <Dialog dismissOnOutsidePress={false} title={fxTitle(2)} onClose={fn()} actions={null}>
      <FxDialog
        doc={doc}
        keys={keys}
        cuts={[]}
        plan={plan}
        list={list}
        chapterName="Chapter 1"
        locator={locator}
        snap={snap}
        overOf={() => (over ? { overlaps: [], cap: over, text: over } : null)}
        onCancel={fn()}
        onConfirm={fn()}
      />
    </Dialog>
  );
}

const meta = { title: 'Editing/FxDialog', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

// Choosing a chain in REAPER: the words, the snapped ends, the three pieces, the chain (changeable here) and REAPER's one undo step. Cancel has the focus.
export const Preview: Story = {
  render: () => <Question plan={{ kind: 'daw', dawName: 'REAPER' }} />,
  play: async () => {
    const dialog = await screen.findByRole('dialog', { name: 'Add FX to 2 words?' });
    await waitFor(() => expect(within(dialog).getByText(/moved 1\.2 ms to a zero crossing/)).toBeTruthy());
    await expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }));
    await expect(within(dialog).getByText(/one undo step in REAPER/)).toBeTruthy();
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Effect' }), 'Vocal Chain/Warmth.RfxChain');
    await expect(within(dialog).getByText(/Piece 2 · Vocal Chain\/Warmth\.RfxChain/)).toBeTruthy();
  },
};

// The effect would go on top of another or over the Effects tab's cap: the narrator is asked first and the button reads "Add anyway".
export const OverTheCap: Story = {
  render: () => <Question plan={{ kind: 'daw', dawName: 'REAPER' }} over="This takes effect coverage from 20% to 35%, over the 30% cap." />,
  play: async () => {
    const dialog = await screen.findByRole('dialog');
    await expect(await within(dialog).findByRole('button', { name: 'Add anyway' })).toBeTruthy();
    await expect(within(dialog).getByRole('alert').textContent).toMatch(/over the 30% cap/);
  },
};

// A DAW that changes the audio itself: it applies the effect to the selection after a backup.
export const Audacity: Story = {
  render: () => <Question plan={{ kind: 'backup-then-daw', dawName: 'Audacity', steps: 2 }} />,
  play: async () => {
    const dialog = await screen.findByRole('dialog');
    await expect(within(dialog).getByText(/backs up the stretch first/)).toBeTruthy();
  },
};

// The built-in recorder keeps an effect entry and asks no DAW.
export const Recorder: Story = {
  render: () => <Question plan={{ kind: 'recorder', dawName: 'the built-in recorder' }} />,
  play: async () => {
    const dialog = await screen.findByRole('dialog');
    await expect(within(dialog).getByText(/asks no DAW/)).toBeTruthy();
    await expect(await within(dialog).findByRole('button', { name: 'Add effect entry' })).toBeTruthy();
  },
};

const OFF = 'REAPER is not answering. Check that REAPER is open and the Narration Utils action is running, then try again.';

/** The Add FX menu as a right click opens it. */
function Menu({ items }: { items: ReturnType<typeof fxMenuItems> }) {
  return (
    <main className="min-h-[18rem] bg-[var(--surface)] p-3 text-[var(--text)]">
      <ContextMenu items={items} className="block min-h-[14rem] rounded border border-dashed border-[var(--border)] p-3">
        <span data-menu-anchor>Right-click here</span>
      </ContextMenu>
    </main>
  );
}
/** Closes the open menu: while one is showing, Base UI's invisible focus guards trip axe's aria-hidden-focus, and the atlas runs axe after play(). */
const closeMenu = async (canvasElement: HTMLElement) => {
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(within(canvasElement.ownerDocument.body).queryByRole('menu')).toBeNull());
};
const open = async (canvasElement: HTMLElement) => {
  await userEvent.pointer({ keys: '[MouseRight]', target: canvasElement.querySelector('[data-menu-anchor]')! });
  return within(canvasElement.ownerDocument.body);
};

// The DAW's own list under its source line, and a disabled "Manage in REAPER…".
export const Menu_: Story = {
  name: 'Menu',
  render: () => <Menu items={fxMenuItems({ list, listWhy: '', refusal: '', dawName: 'REAPER', onPick: fn() })} />,
  play: async ({ canvasElement }) => {
    const menu = await open(canvasElement);
    await expect(await menu.findByRole('menuitem', { name: 'Podcast Voice.RfxChain' })).toBeTruthy();
    await expect(menu.getByRole('menuitem', { name: /Manage in REAPER…/ }).getAttribute('aria-disabled')).toBe('true');
    await closeMenu(canvasElement);
  },
};

// The DAW cannot add now: each item stays, disabled, with the DAW's own sentence; the button does the same.
export const Refused: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 bg-[var(--surface)] p-3 text-[var(--text)]">
        <AddFxButton reason={OFF} onClick={fn()} />
      </div>
      <Menu items={fxMenuItems({ list, listWhy: '', refusal: OFF, dawName: 'REAPER', onPick: fn() })} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Add FX' }).getAttribute('aria-description')).toBe(`Add FX (F) — ${OFF}`);
    const menu = await open(canvasElement);
    const item = await menu.findByRole('menuitem', { name: new RegExp(`Podcast Voice.RfxChain`) });
    await expect(item.getAttribute('aria-disabled')).toBe('true');
    await expect(item.textContent).toContain(OFF);
    await closeMenu(canvasElement);
  },
};

// The DAW lists none: the menu says where it looks.
export const NoChains: Story = {
  render: () => <Menu items={fxMenuItems({ list: { source: list.source, choices: [] }, listWhy: '', refusal: '', dawName: 'REAPER', onPick: fn() })} />,
  play: async ({ canvasElement }) => {
    const menu = await open(canvasElement);
    await expect((await menu.findByRole('menuitem', { name: /No effects listed/ })).textContent).toContain('lists no effects yet');
    await closeMenu(canvasElement);
  },
};

const effect: WordFx = {
  id: 'fx1',
  chapterId: 'chapter-1',
  pid: 'p-1',
  keys,
  text: 'tired of',
  a: 1,
  b: 2,
  off0: 1,
  off1: 2,
  chainId: 'Podcast Voice.RfxChain',
  chainName: 'Podcast Voice.RfxChain',
  source: list.source,
  fadeMs: 8,
  daw: 'REAPER',
  guid: 'g',
  words: ['tired', 'of'],
  at: '2026-10-12T00:00:00Z',
  paragraph: 0,
  stale: false,
  bypassed: false,
};

// The marker after the words an effect is on: its control selects the words or takes the effect off.
export const Marker: Story = {
  render: () => (
    <p className="m-0 bg-[var(--surface)] p-4 font-serif text-lg text-[var(--text)]">
      Alice was <span className="shadow-[inset_0_-3px_0_var(--accent-strong)]">tired of</span>
      <FxMarker fx={effect} onSelect={fn()} onRemove={fn()} /> sitting
    </p>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Podcast Voice.RfxChain on tired of. Options' }));
    const menu = within(canvasElement.ownerDocument.body);
    await expect(await menu.findByRole('menuitem', { name: 'Remove the effect' })).toBeTruthy();
    await expect(menu.getByRole('menuitem', { name: 'Select the words' })).toBeTruthy();
    await closeMenu(canvasElement);
  },
};
