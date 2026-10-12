import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_ENTITIES } from '../../api/mockFixtures';
import { GuideDetail } from './GuideDetail';

const alice = {
  ...WIRE_ENTITIES[0],
  properties: [
    { key: 'Age', value: 'Seven' },
    { key: 'says', value: 'Quick, polite, and a little too curious.' },
    { key: 'does', value: 'Asks first and thinks after.' },
    { key: 'knows', value: 'Nothing about the Queen yet.' },
  ],
};
const place = WIRE_ENTITIES.find((row) => row.category === 'Place') ?? WIRE_ENTITIES[0];

const meta = {
  title: 'Story Bible/GuideDetail',
  component: GuideDetail,
  decorators: [
    (Story) => (
      <ApiProvider api={createMockApi()}>
        <Story />
      </ApiProvider>
    ),
  ],
  args: { entity: alice, entities: WIRE_ENTITIES, reload: async () => {}, notify: () => {}, goToManuscript: () => {} },
} satisfies Meta<typeof GuideDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Opens read-only under the name as a heading; a character shows how they talk, act and know as text. */
export const ReadOnlyCharacter: Story = {
  play: async ({ canvasElement }) => {
    const view = within(canvasElement);
    await expect(view.getByRole('heading', { name: 'Alice' })).toBeTruthy();
    await expect(view.getByText('How they talk')).toBeTruthy();
    await expect(view.queryByRole('textbox', { name: 'Name' })).toBeNull();
  },
};

/** Edit turns the name and the three fields into text boxes. */
export const EditingCharacter: Story = {
  play: async ({ canvasElement }) => {
    const view = within(canvasElement);
    await userEvent.click(view.getByRole('button', { name: 'Edit this entry' }));
    await expect(view.getByRole('textbox', { name: 'Name' })).toBeTruthy();
    await expect(view.getByRole('textbox', { name: 'How they talk' })).toBeTruthy();
  },
};

/** A place has no talk, act or know rows. */
export const ReadOnlyPlace: Story = {
  args: { entity: place },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByText('How they talk')).toBeNull();
  },
};
