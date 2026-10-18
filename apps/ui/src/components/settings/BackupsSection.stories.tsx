import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type ReactNode } from 'react';
import { expect, fn, within } from 'storybook/test';
import { DAW_SETUPS } from '../../fixtures/daw';
import type { ScopedSettingField } from '../../types';
import { BackupsView, type BackupsRow, type BackupsViewProps } from './BackupsSection';

// Settings draws its sections on the panel surface; axe measures the text against it.
function OnSurface({ children }: { children: ReactNode }) {
  return <div className="max-w-[860px] rounded-lg bg-[var(--surface)] p-4 text-sm">{children}</div>;
}

// The two DAW rows as the host sends them (tests/fixtures/contracts/settings-global.json), unset at the default.
const number = (key: string, label: string, effectiveValue: string, range: ScopedSettingField['number']): ScopedSettingField => ({
  key,
  label,
  kind: 'number',
  choices: [],
  value: '',
  isSet: false,
  effectiveValue,
  effectiveSource: 'repo_default',
  number: range,
});
const ROWS: BackupsRow[] = [
  {
    field: number('backups.window_seconds', 'Audio kept either side of a punch or an edit (s)', '120', { min: 10, max: 300, step: 10, unit: 's' }),
    scope: 'global',
  },
  { field: number('backups.retention_days', 'Keep backups for (days)', '7', { min: 1, max: 365, step: 1, unit: 'days' }), scope: 'global' },
];

// The edits are held here, as BackupsSection holds them.
function Editable(props: BackupsViewProps) {
  const [drafts, setDrafts] = useState(props.drafts);
  return <BackupsView {...props} drafts={drafts} onChange={(key, value) => setDrafts((current) => ({ ...current, [key]: value }))} />;
}

const meta = {
  title: 'Settings/BackupsSection',
  component: BackupsView,
  args: {
    daw: DAW_SETUPS['audacity-backups'].daw,
    rows: ROWS,
    drafts: {},
    onChange: fn(),
    onCommit: fn(),
    onClearOverride: fn(),
  },
  render: (args) => <Editable {...args} />,
  decorators: [
    (Story) => (
      <OnSurface>
        <Story />
      </OnSurface>
    ),
  ],
} satisfies Meta<typeof BackupsView>;

export default meta;
type Story = StoryObj<typeof meta>;

// Audacity with backups (the mock's Editing > Backups inspector): the window and the retention at their defaults, two minutes and
// seven days, with the help worded from the report's DAW name and the values.
export const Shown: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Backups' })).toBeTruthy();
    await expect(canvas.getByText(/Audacity keeps a copy of the audio around an edit, about 2 minutes either side, for 7 days/)).toBeTruthy();
    await expect(canvas.getByRole('textbox', { name: 'Keep backups for (days)' })).toBeTruthy();
  },
};

// A project override is edited at the project layer, with its Reset; a window past the store's range shows the store's sentence.
export const ProjectOverrideAndOutOfRange: Story = {
  args: {
    rows: [ROWS[0], { field: { ...ROWS[1].field, value: '14', isSet: true, effectiveValue: '14', effectiveSource: 'project' }, scope: 'project' }],
    drafts: { 'backups.window_seconds': '600' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Enter a value from 10 to 300 s.')).toBeTruthy();
    await expect(canvas.getByRole('button', { name: 'Reset' })).toBeTruthy();
  },
};

// Audacity with backups turned off: the capability's own sentence stands in for the rows.
export const HiddenReason: Story = {
  args: { reason: DAW_SETUPS.audacity.capabilities.backups?.message, rows: [] },
};

// The report or the settings could not be read.
export const LoadError: Story = {
  args: { loadError: 'the DAW did not answer', onRetry: fn(), rows: [] },
};

// A refused save keeps the edit and says why in the host's words.
export const SaveRefused: Story = {
  args: { drafts: { 'backups.window_seconds': '60' }, saveError: 'the settings file is read-only' },
};
