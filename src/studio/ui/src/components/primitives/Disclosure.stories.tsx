import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Disclosure } from './Disclosure';
import { Tooltip } from './Tooltip';

function Group({ startOpen = false, withAside = false }: { startOpen?: boolean; withAside?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <Disclosure
      title="Reference material"
      summary="2 sections"
      open={open}
      onOpenChange={setOpen}
      className="w-80 border-t border-[var(--border)]"
      aside={
        withAside ? (
          <Tooltip label="About reference material" text="Excluded from audiobook totals and Proofing. Still readable in the manuscript." />
        ) : undefined
      }
    >
      <ul className="space-y-1 pb-2 pl-5 text-sm">
        <li>Glossary</li>
        <li>Characters</li>
      </ul>
    </Disclosure>
  );
}

const meta = {
  title: 'Primitives/Disclosure',
  component: Disclosure,
  args: { title: 'Reference material', open: false, onOpenChange: fn(), children: null },
  render: () => <Group />,
} satisfies Meta<typeof Disclosure>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Collapsed: Story = {};
export const Expanded: Story = { render: () => <Group startOpen /> };
export const WithInfoIcon: Story = { render: () => <Group startOpen withAside /> };

// A panel taller than its box fades its last line while more lies below, and draws plain at the end (#2656).
export const ScrollCue: Story = {
  render: () => (
    <Disclosure
      title="Chapters"
      summary="8 chapters"
      open
      onOpenChange={() => {}}
      className="w-80"
      panelClassName="h-24 overflow-y-auto"
      panelFocusable
      scrollCue
    >
      <ul className="space-y-1 pb-2 pl-5 text-sm">
        {['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'].map((name) => (
          <li key={name}>Chapter {name}</li>
        ))}
      </ul>
    </Disclosure>
  ),
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement).getByText('Chapter One').closest('div.overflow-y-auto') as HTMLElement;
    // The unit run is jsdom, which lays nothing out (no scroll height), so the cue cannot show there; Disclosure.test.tsx pins the logic with set
    // metrics, and the atlas, a real browser, runs the assertions below.
    if (panel.clientHeight === 0) return;
    await waitFor(() => expect(panel).toHaveAttribute('data-more-below'));
    panel.scrollTop = panel.scrollHeight;
    await waitFor(() => expect(panel).not.toHaveAttribute('data-more-below'));
  },
};

// The whole row is the button: Enter opens it, its name carries the summary, and the panel is not in the page while it is closed.
export const OpensAndClosesWithTheKeyboard: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText('Glossary')).toBeNull();
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    const button = canvas.getByRole('button', { name: 'Reference material 2 sections' });
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(canvas.getByText('Glossary')).toBeVisible();
    await userEvent.keyboard('{Enter}');
    await expect(canvas.queryByText('Glossary')).toBeNull();
  },
};
