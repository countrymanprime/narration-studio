import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { REFUSALS, setupCapabilities } from './fixtures';
import { RecordControl } from './RecordControl';
import { recordCheck } from './recordCheck';
import { SetupChip } from './SetupChip';

// The footer's Record control beside the reason the footer draws as `#brec-why`, and the top bar's setup chip: the two parts of the mock's
// record control, on the narrow strip a small window gives them as on the wide one.
type Args = { setup: 'reaper' | 'reaper-off' | 'builtin'; tracks: 'one' | 'none'; recording: boolean; refused?: string };

function Strip({ setup, tracks, recording, refused }: Args) {
  const capabilities = setupCapabilities(setup);
  const reason = recordCheck(capabilities, { tracks, message: REFUSALS.none })?.reason ?? refused ?? '';
  const control = { recording, disabled: !recording && !!recordCheck(capabilities, { tracks, message: REFUSALS.none }), reason, toggle: fn(async () => {}) };
  return (
    <div className="flex max-w-full flex-wrap items-center gap-3 border-t border-[var(--border)] bg-[var(--surface)] px-5 py-2.5">
      <SetupChip capabilities={capabilities} standaloneName="Recorder" />
      <RecordControl control={control} />
      {reason ? (
        <span id="brec-why" className="text-sm text-[var(--text-muted)]">
          {reason}
        </span>
      ) : null}
    </div>
  );
}

const meta = {
  title: 'Booth/RecordControl',
  component: Strip,
  args: { setup: 'reaper', tracks: 'one', recording: false },
} satisfies Meta<typeof Strip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Record' })).toBeEnabled();
  },
};
export const Recording: Story = { args: { recording: true } };
// One chapter is one track: the host's sentence stays on the disabled control for assistive technology.
export const Refused: Story = {
  args: { tracks: 'none' },
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Record' });
    await expect(button).toBeDisabled();
    await expect(button).toHaveAccessibleDescription(REFUSALS.none);
    await userEvent.click(button);
  },
};
export const NoDaw: Story = { args: { setup: 'reaper-off' } };
export const OwnRecorder: Story = { args: { setup: 'builtin', tracks: 'none' } };
