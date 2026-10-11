import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { ApiProvider } from '../../../api/ApiContext';
import { MOCK_ACX, mockCustomProfile } from '../../../api/deliveryProfilesMock';
import { createMockApi } from '../../../api/mockApi';
import type { DeliveryProfile, DeliveryProfilesApi } from '../../../types';
import { ProfileCard } from './ProfileCard';

const keyOf = (profile: DeliveryProfile) => (profile.builtIn ? `${profile.id}@${profile.version}` : `${profile.id}@r${profile.revision}`);

const host = (profile: DeliveryProfile, overrides: Partial<DeliveryProfilesApi> = {}) =>
  createMockApi({
    deliveryProfiles: async () => ({
      profiles: [MOCK_ACX, mockCustomProfile()],
      globalDefault: { id: MOCK_ACX.id },
      hasProject: true,
      projectChoice: null,
      projectProfile: keyOf(profile),
    }),
    ...overrides,
  });

const meta = {
  title: 'Delivery/ProfileCard',
  component: ProfileCard,
  decorators: [
    (Story, { parameters }) => (
      <ApiProvider api={parameters.api}>
        <div className="max-w-2xl">
          <Story />
        </div>
      </ApiProvider>
    ),
  ],
} satisfies Meta<typeof ProfileCard>;

export default meta;
type Story = StoryObj<typeof meta>;

// The mock's built-in profile: limits and files are text, the name is the "Built in" pill, and no input exists.
export const BuiltIn: Story = {
  parameters: { api: host(MOCK_ACX) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Built in')).toBeTruthy();
    await expect(canvas.queryByRole('textbox')).toBeNull();
  },
};

// A custom profile: a lowest and highest per check, "no lowest" where the rule has one bound, and the name as a box.
export const Custom: Story = {
  parameters: { api: host(mockCustomProfile()) },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('textbox', { name: 'Profile name' })).toBeTruthy();
  },
};

// The host refuses a save and the card says why, inline.
export const SaveRefused: Story = {
  parameters: {
    api: host(mockCustomProfile(), {
      deliverySaveProfile: async () => Promise.reject(new Error('a built-in profile cannot be changed; duplicate it to change its numbers')),
    }),
  },
  play: async ({ canvasElement }) => {
    const box = await within(canvasElement).findByRole('textbox', { name: 'RMS lowest' });
    box.focus();
    (box as HTMLInputElement).value = '-25';
  },
};
