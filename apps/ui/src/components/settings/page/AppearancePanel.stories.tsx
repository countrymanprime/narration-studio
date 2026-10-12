import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';
import type { ThemePreference } from '../../../theme/theme';
import { AppearanceView } from './AppearancePanel';

// The choice is held here, as the theme context holds it; the story's own theme stays the toolbar's.
function Choosing({ value, onChange }: { value: ThemePreference; onChange: (next: ThemePreference) => void }) {
  const [current, setCurrent] = useState(value);
  return (
    <AppearanceView
      value={current}
      onChange={(next) => {
        onChange(next);
        setCurrent(next);
      }}
    />
  );
}

const meta = {
  title: 'Settings/Page/AppearancePanel',
  component: AppearanceView,
  args: { value: 'system', onChange: fn() },
  render: (args) => <Choosing {...args} />,
  decorators: [
    (Story) => (
      <div className="max-w-[860px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AppearanceView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MatchMySystem: Story = {};

export const DarkChosen: Story = { args: { value: 'dark' } };
