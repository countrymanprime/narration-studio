import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { CATALOG, iconNamed, tooltipFor, type IconName } from '../../icons.catalog';
import { Icon } from './Icon';

const meta = {
  title: 'Primitives/Icon',
  component: Icon,
  args: { name: 'play' },
} satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

// An outline icon is off, a solid one is on (icon-audit.md rule 3).
export const Flipped: Story = { args: { name: 'goTo', flip: true } };

const iconKeys = Object.entries(CATALOG)
  .filter(([, row]) => row.icon !== null)
  .map(([key]) => key as IconName);

// Every catalogue key with an icon, named by its action. The atlas draws it in light and dark (ADR 0761, SNF-3), so a new row shows up
// here without a story of its own.
export const Catalogue: Story = {
  render: () => (
    <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2 p-0 text-[var(--text-muted)]">
      {iconKeys.map((key) => (
        <li key={key} className="flex items-center gap-2 text-[length:var(--font-size-sm,0.8125rem)]" title={tooltipFor(key)}>
          <span className="text-[var(--text)]">
            <Icon name={key} />
          </span>
          <code>{key}</code>
        </li>
      ))}
    </ul>
  ),
  play: async ({ canvasElement }) => {
    const items = within(canvasElement).getAllByRole('listitem');
    await expect(items).toHaveLength(iconKeys.length);
    // Each icon is decoration beside its key name.
    for (const item of items) await expect(item.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  },
};

// A name from data that is not a key draws the neutral icon.
export const UnknownNameFallsBack: Story = { args: { name: iconNamed('not-an-action') } };
