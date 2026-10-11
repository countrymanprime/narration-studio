import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useRef, type ReactNode } from 'react';
import { expect, waitFor, within } from 'storybook/test';
import { EditingPageProvider, useEditingPage } from '../script/EditingPageState';
import type { PageAction } from '../script/scriptState';
import { marksDoc } from '../script/scriptFixtures';
import { SelectionActionButton } from './SelectionActionButton';
import { SelectionBar } from './SelectionBar';
import { SelToolbar } from './SelToolbar';
import { registerSelectionAction } from './selectionActions';
import type { ScriptPlayback } from './useScriptPlayback';

const doc = marksDoc({ cuts: [{ id: 'c1', a: 0, b: 0.3, mode: 'gap', keys: ['p-1:0', 'p-1:1'], off0: 0, off1: 0.6 }] });

const idle: ScriptPlayback = {
  playing: false,
  follow: true,
  setFollow: () => {},
  toggle: () => {},
  playFrom: () => {},
  playSelection: () => {},
  skip: () => {},
  stop: () => {},
};

/** The slots the other slices will fill, drawn here so the strip shows what the bar looks like with actions in it. */
function Slots() {
  useEffect(() => {
    const none = () => {};
    const removers = [
      registerSelectionAction({
        id: 'story-restore',
        order: 5,
        where: 'both',
        render: ({ allCut }) => (allCut ? <SelectionActionButton icon="undo" label="Restore these words" onClick={none} /> : null),
      }),
      registerSelectionAction({
        id: 'story-mute',
        order: 20,
        where: 'both',
        render: ({ allCut }) =>
          allCut ? null : (
            <SelectionActionButton
              icon="hideExample"
              label="Mute, keep the audio"
              hint="Mute, keep the audio (M)"
              reason="REAPER cannot do this."
              onClick={none}
            />
          ),
      }),
      registerSelectionAction({
        id: 'story-delete',
        order: 30,
        where: 'both',
        render: ({ allCut }) => (allCut ? null : <SelectionActionButton icon="delete" label="Delete words and audio" onClick={none} />),
      }),
    ];
    return () => removers.forEach((r) => r());
  }, []);
  return null;
}

function Setup({ actions, children }: { actions: PageAction[]; children: ReactNode }) {
  const { dispatch } = useEditingPage();
  useEffect(() => {
    actions.forEach(dispatch);
  }, [actions, dispatch]);
  return <>{children}</>;
}

const frame = (actions: PageAction[], playing: boolean, toolbar = false) => (
  <div className="relative flex h-48 flex-col justify-end bg-[var(--surface)] text-[var(--text)]">
    <EditingPageProvider doc={doc}>
      <Slots />
      <Setup actions={actions}>
        <Host toolbar={toolbar} playing={playing} />
      </Setup>
    </EditingPageProvider>
  </div>
);

function Host({ toolbar, playing }: { toolbar: boolean; playing: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const playback = { ...idle, playing };
  return (
    <>
      <div ref={ref} className="relative flex-1 p-4">
        {doc.items.slice(0, 12).map((i) => (
          <span key={i.key} data-k={i.key} className="mr-1">
            {i.text}
          </span>
        ))}
        {toolbar ? <SelToolbar host={ref} playback={playback} /> : null}
      </div>
      <SelectionBar playback={playback} end={843} />
    </>
  );
}

const meta = { title: 'Editing/Bar', component: SelectionBar, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof SelectionBar>;
export default meta;
type Story = StoryObj<typeof meta>;

const nothing: PageAction[] = [{ type: 'place', key: 'p-1:2' }];
const selection: PageAction[] = [{ type: 'select', anchor: 'p-1:3', head: 'p-1:5' }];

// Nothing selected: the transport and the line that says how to select.
export const NothingSelected: Story = {
  args: { playback: idle, end: 843 },
  render: () => frame(nothing, false),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('toolbar', { name: 'Playback and selection' })).toBeTruthy();
    await expect(canvasElement.textContent).toMatch(/Click a word to place the cursor/);
  },
};

// A selection: the words, the span, the pill, and the slots (Mute drawn disabled with its reason).
export const Selection: Story = {
  args: { playback: idle, end: 843 },
  render: () => frame(selection, false, true),
  play: async ({ canvasElement }) => {
    // The selection is dispatched after the first paint, and the floating toolbar is placed once the words have a position.
    await waitFor(() => expect(within(canvasElement).getAllByRole('toolbar')).toHaveLength(2));
    await expect(canvasElement.textContent).toMatch(/3 words/);
  },
};

// Playing: Pause, and no floating toolbar.
export const Playing: Story = {
  args: { playback: idle, end: 843 },
  render: () => frame(selection, true, true),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Pause' })).toBeTruthy();
    await expect(within(canvasElement).queryByRole('toolbar', { name: 'Selection' })).toBeNull();
  },
};

// Every selected word is cut: Restore takes the place of the other actions.
export const AllCut: Story = {
  args: { playback: idle, end: 843 },
  render: () => frame([{ type: 'select', anchor: 'p-1:0', head: 'p-1:1' }], false, true),
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(within(canvasElement).getAllByRole('button', { name: 'Restore these words' }).length).toBeGreaterThan(0));
    await expect(canvasElement.textContent).toMatch(/Cut/);
  },
};
