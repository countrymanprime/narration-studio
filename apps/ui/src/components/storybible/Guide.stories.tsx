import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { CommandRouter } from '../../input/router';
import { OverlayProvider } from '../../overlay/OverlayProvider';
import { StudioProvider } from '../../studio/StudioProvider';
import { Guide } from './Guide';

// The Story Bible page as the Studio Next mock draws it (docs/research/mockups/studio-next/src/pages/Bible.tsx): kind chips over two-line
// rows, the search box over names and aliases, and the ask for a manuscript when there is none. The `/story-bible` route mounts it.

// One host for every story: a new one on each render would make the page read its entries again and again.
const api = createMockApi();

const meta = {
  title: 'Story Bible/Guide',
  component: Guide,
  decorators: [
    (Story) => {
      return (
        <MemoryRouter>
          <ApiProvider api={api}>
            <StudioProvider>
              <OverlayProvider>
                <CommandRouter>
                  <Story />
                </CommandRouter>
              </OverlayProvider>
            </StudioProvider>
          </ApiProvider>
        </MemoryRouter>
      );
    },
  ],
  args: { notify: fn(), goToManuscript: fn() },
} satisfies Meta<typeof Guide>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Kind chips over the list, a row of two lines for each entry with its type colour, and the open entry beside it. */
export const List: Story = {
  play: async ({ canvasElement }) => {
    const view = within(canvasElement);
    await expect(await view.findByRole('button', { name: 'Place' })).toBeTruthy();
    await expect(within(view.getByRole('list', { name: 'Story Bible entries' })).getAllByRole('button').length).toBeGreaterThan(3);
  },
};

/** A kind chip on: only the entries of that kind are listed. */
export const KindChipOn: Story = {
  play: async ({ canvasElement }) => {
    const view = within(canvasElement);
    await userEvent.click(await view.findByRole('button', { name: 'Place' }));
    await expect(view.getByRole('button', { name: 'Place' }).getAttribute('aria-pressed')).toBe('true');
  },
};

/** Nothing in the search box matches. */
export const NoMatch: Story = {
  play: async ({ canvasElement }) => {
    const view = within(canvasElement);
    await userEvent.type(await view.findByRole('textbox', { name: 'Search entries' }), 'zzzz');
    await expect(view.getByText('No entries match.')).toBeTruthy();
  },
};

/** No manuscript yet: the page asks for one. */
export const NeedsManuscript: Story = {
  args: { hasManuscript: false, onImport: fn() },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Import manuscript' })).toBeTruthy();
  },
};
