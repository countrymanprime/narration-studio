import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { TakeChip } from './TakeChip';
import { TakeLines } from './TakeLines';
import { measuredPassage, partlyMeasuredPassage, unevenPassage } from './takeFixtures';
import type { LinePassage, TakesGate } from './types';

const none = () => {};
const ok: TakesGate = { ok: true };

function Frame({
  passage,
  narrow = false,
  keptId = null,
  onTake = null,
  gate = ok,
}: {
  passage: LinePassage;
  narrow?: boolean;
  keptId?: string | null;
  onTake?: string | null;
  gate?: TakesGate;
}) {
  return (
    <div className={`flex flex-col gap-2 bg-[var(--surface)] p-4 text-[var(--text)] ${narrow ? 'max-w-[360px]' : 'max-w-[760px]'}`}>
      <p className="m-0">{passage.script}</p>
      <div>
        <TakeChip passage={passage} open keptId={keptId} controls={`takes-${passage.id}`} onToggle={none} />
      </div>
      <TakeLines passage={passage} onTake={onTake} keptId={keptId} playingId={null} gate={gate} onKeep={none} onPlay={none} />
    </div>
  );
}

const meta = { title: 'Editing/Takes', component: Frame, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Frame>;
export default meta;
type Story = StoryObj<typeof meta>;

// Every take measured, at one level: the suggestion has a number and its evidence is on the take.
export const Measured: Story = {
  args: { passage: measuredPassage() },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('group', { name: /Takes of this line, 3/ })).toBeTruthy();
    await expect(canvasElement.querySelector('[data-suggested]')?.textContent).toMatch(/Suggested: T-7/);
  },
};

// One take measured, one with reasons for its figures, one not aligned and not usable.
export const PartlyMeasured: Story = {
  args: { passage: partlyMeasuredPassage() },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.textContent).toMatch(/Pause: The file is not on this machine/);
  },
};

// Recorded at different levels: no confidence, and the step that would make it surer.
export const NotComparable: Story = {
  args: { passage: unevenPassage() },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.textContent).toMatch(/Not comparable yet/);
    await expect(canvasElement.querySelector('[data-step="normalise"]')).toBeTruthy();
  },
};

// The narrow column, the keys on the second take and one take kept.
export const NarrowKept: Story = {
  args: { passage: measuredPassage(), narrow: true, keptId: 't-8', onTake: 't-8' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-tchip]')?.textContent).toMatch(/Kept/);
    await expect(within(canvasElement).queryByRole('button', { name: 'Keep T-8' })).toBeNull();
  },
};

// The DAW cannot choose a take: Keep is off and the DAW's own sentence is its reason.
export const DawCannot: Story = {
  args: { passage: measuredPassage(), gate: { ok: false, reason: 'REAPER is not running.' } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Keep T-8' }).getAttribute('aria-disabled')).toBe('true');
  },
};
