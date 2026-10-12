import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, within } from 'storybook/test';
import { MOCK_ACX, mockCustomProfile } from '../../../api/deliveryProfilesMock';
import type { DeliveryProfilesState } from '../../../types';
import { deliveryProfileKey } from '../../master/deliveryProfile';
import { DeliveryProfileFieldView, type DeliveryProfileFieldViewProps } from './DeliveryProfileField';

const custom = mockCustomProfile();
const STATE: DeliveryProfilesState = {
  profiles: [MOCK_ACX, custom],
  globalDefault: { id: MOCK_ACX.id, version: MOCK_ACX.version },
  hasProject: true,
  projectChoice: null,
  projectProfile: deliveryProfileKey(MOCK_ACX),
};

// The choice is held here, as DeliveryProfileField holds the host's answer.
function Choosing(props: DeliveryProfileFieldViewProps) {
  const [state, setState] = useState(props.state);
  return (
    <DeliveryProfileFieldView
      {...props}
      state={state}
      onChoose={(profile) => {
        props.onChoose(profile);
        setState((current) => current && { ...current, projectProfile: deliveryProfileKey(profile) });
      }}
    />
  );
}

const meta = {
  title: 'Settings/Page/DeliveryProfileField',
  component: DeliveryProfileFieldView,
  args: { state: STATE, onChoose: fn() },
  render: (args) => <Choosing {...args} />,
  decorators: [
    (Story) => (
      <div className="max-w-[860px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DeliveryProfileFieldView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BuiltInChosen: Story = {};

export const ChoosesAnother: Story = {
  play: async ({ canvasElement, args }) => {
    const select = within(canvasElement).getByRole<HTMLSelectElement>('combobox', { name: 'Delivery profile' });
    select.value = deliveryProfileKey(custom);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await expect(args.onChoose).toHaveBeenCalledWith(custom);
  },
};

export const Reading: Story = { args: { state: undefined } };

export const Refused: Story = { args: { error: 'no project is open' } };
