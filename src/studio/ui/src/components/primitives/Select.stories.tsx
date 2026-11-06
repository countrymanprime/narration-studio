import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type ComponentProps } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Select } from './Select';

const STATUS_OPTIONS = [
  { value: 'not-started', label: 'Not started' },
  { value: 'recorded', label: 'Recorded' },
  { value: 'edited', label: 'Edited' },
  { value: 'finalized', label: 'Finalized' },
];

function ControlledSelect(props: ComponentProps<typeof Select>) {
  const [value, setValue] = useState(props.value);
  return (
    <div className="max-w-sm">
      <Select
        {...props}
        value={value}
        onChange={(next) => {
          setValue(next);
          props.onChange(next);
        }}
      />
    </div>
  );
}

/** The select as a direct child of its container, the way a flex row or a form column holds it (ControlledSelect wraps it in a box of its own). */
function BareSelect(props: ComponentProps<typeof Select>) {
  const [value, setValue] = useState(props.value);
  return <Select {...props} value={value} onChange={setValue} />;
}

const meta = {
  title: 'Primitives/Select',
  component: Select,
  args: { label: 'Chapter 1 status', value: 'not-started', options: STATUS_OPTIONS, onChange: fn() },
  render: (args) => <ControlledSelect {...args} />,
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const FullWidth: Story = { args: { fullWidth: true } };
// Options with a `group` sit under an `<optgroup>` heading (the voice sample dialog's "In this chapter" and "All characters"); one with none stays outside.
export const Grouped: Story = {
  args: {
    label: 'Character',
    value: 'queen',
    options: [
      { value: 'queen', label: 'The Queen of Hearts', group: 'In this chapter' },
      { value: 'alice', label: 'Alice', group: 'In this chapter' },
      { value: 'hatter', label: 'The Hatter', group: 'All characters' },
      { value: 'narration', label: 'Narration' },
    ],
  },
  play: async ({ canvasElement }) => {
    const groups = within(canvasElement).getAllByRole('group');
    await expect(groups.map((group) => group.getAttribute('label'))).toEqual(['In this chapter', 'All characters']);
  },
};
// A name far longer than its box (a microphone's driver name): the closed box ends it in an ellipsis inside its container and its tooltip holds the whole name (#2898).
export const LongName: Story = {
  args: {
    label: 'Microphone',
    fullWidth: true,
    value: 'long',
    options: [
      { value: 'long', label: `Microphone Array (Realtek(R) Audio) ${'with a driver name that goes on and on '.repeat(6)}` },
      { value: 'short', label: 'Line In' },
    ],
  },
  render: (args) => (
    <div style={{ width: '16rem' }}>
      <ControlledSelect {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const select = within(canvasElement).getByRole('combobox', { name: 'Microphone' });
    // `truncate` is Tailwind's overflow-hidden, text-ellipsis and whitespace-nowrap (the unit run has no stylesheet, so the class is what it can see).
    await expect(select.classList.contains('truncate')).toBe(true);
    // With layout (a browser, the atlas) the box really ends in an ellipsis; the unit run has none and skips this.
    if (select.clientWidth > 0) await expect(getComputedStyle(select).textOverflow).toBe('ellipsis');
    await expect(select.getBoundingClientRect().right).toBeLessThanOrEqual(canvasElement.getBoundingClientRect().right);
    await expect(select.getAttribute('title')).toMatch(/goes on and on/);
  },
};
const LONG_OPTIONS = [
  { value: 'long', label: `W${'W'.repeat(300)}` },
  { value: 'short', label: 'Line In' },
];
// The shapes the QA pass broke it in (#2898): a select in a flex row beside a label and a button, and one whose caller gives it its own width cap. A 300-letter
// name must stay inside the row, and inside the caller's cap (the stylesheet puts `max-w-full` after `max-w-[16rem]`, so the default cap must not be added beside theirs).
export const LongNameInFlexRow: Story = {
  args: { label: 'Speaker colour', value: 'long', options: LONG_OPTIONS },
  render: (args) => (
    <div data-row style={{ width: '20rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <span>Colour</span>
      <BareSelect {...args} />
      <button type="button">Go</button>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const row = canvasElement.querySelector<HTMLElement>('[data-row]')!;
    const select = within(canvasElement).getByRole('combobox', { name: 'Speaker colour' });
    if (row.clientWidth === 0) return;
    await expect(select.getBoundingClientRect().right).toBeLessThanOrEqual(row.getBoundingClientRect().right + 0.5);
    await expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth + 1);
  },
};
export const LongNameWithOwnMaxWidth: Story = {
  args: { label: 'Delivery profile', value: 'long', options: LONG_OPTIONS, className: 'max-w-[16rem]' },
  render: (args) => (
    <div style={{ width: '40rem' }}>
      <ControlledSelect {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const select = within(canvasElement).getByRole('combobox', { name: 'Delivery profile' });
    if (select.clientWidth === 0) return;
    await expect(select.getBoundingClientRect().width).toBeLessThanOrEqual(16 * parseFloat(getComputedStyle(document.documentElement).fontSize) + 1);
  },
};
export const Disabled: Story = { args: { disabled: true, value: 'finalized' } };
export const WithPlaceholderOption: Story = {
  args: {
    label: 'Related entry',
    value: '',
    options: [
      { value: '', label: 'Choose entry…' },
      { value: 'hatter', label: 'Hatter' },
    ],
  },
};

// `value` is not among the options, so the placeholder shows; picking an option removes it.
export const WithPlaceholder: Story = {
  args: { label: 'Chapter status', value: '', placeholder: 'Choose a status…' },
  play: async ({ args, canvasElement }) => {
    const select = within(canvasElement).getByRole('combobox', { name: 'Chapter status' }) as HTMLSelectElement;
    await expect(select.selectedOptions[0]).toHaveTextContent('Choose a status…');
    await userEvent.selectOptions(select, 'recorded');
    await expect(args.onChange).toHaveBeenLastCalledWith('recorded');
    await expect(select.options).toHaveLength(STATUS_OPTIONS.length);
  },
};

// It is the native select: named by its label, and choosing an option reports the value (not the event).
export const ChoosingReportsTheValue: Story = {
  play: async ({ args, canvasElement }) => {
    const select = within(canvasElement).getByRole('combobox', { name: 'Chapter 1 status' });
    await userEvent.selectOptions(select, 'edited');
    await expect(args.onChange).toHaveBeenLastCalledWith('edited');
    await expect(select).toHaveValue('edited');
  },
};

// The keyboard reaches it (choosing with the arrow keys is the browser's own behaviour, which jsdom does not implement).
export const KeyboardReachesIt: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    await expect(within(canvasElement).getByRole('combobox', { name: 'Chapter 1 status' })).toHaveFocus();
  },
};
