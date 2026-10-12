import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { DefinitionSource } from '../../../api/contracts/system';
import { DefinitionsView } from './DefinitionsPanel';

// The chosen source is held here, as the panel holds the host's answer.
function Choosing(props: Parameters<typeof DefinitionsView>[0]) {
  const [source, setSource] = useState<DefinitionSource>(props.source);
  return (
    <DefinitionsView
      {...props}
      source={source}
      onSource={(next) => {
        props.onSource(next);
        setSource(next);
      }}
    />
  );
}

const meta = {
  title: 'Settings/Page/DefinitionsPanel',
  component: DefinitionsView,
  args: {
    source: 'web',
    onSource: fn(),
    dictionary: 'installed',
    busy: false,
    onDownload: fn(),
    onRemove: fn(),
    service: 'online',
  },
  render: (args) => <Choosing {...args} />,
} satisfies Meta<typeof DefinitionsView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The mock's default: the web page chosen, the local dictionary installed, the online service online. A pick saves it. */
export const Installed: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: /^Local dictionary/ }));
    await expect(args.onSource).toHaveBeenCalledWith('local');
    await userEvent.click(canvas.getByRole('button', { name: 'Remove' }));
    await expect(args.onRemove).toHaveBeenCalled();
  },
};

/** The local dictionary not downloaded, and the computer offline. */
export const NotInstalledOffline: Story = {
  args: { source: 'local', dictionary: 'not_installed', service: 'offline' },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Download' }));
    await expect(args.onDownload).toHaveBeenCalled();
  },
};

/** A download running, with its real percent. */
export const Downloading: Story = {
  args: { source: 'local', dictionary: 'downloading', percent: 42, service: 'online' },
};

/** The online service chosen with no key saved for it, and a refused save's sentence. */
export const NoKeyRefused: Story = {
  args: { source: 'api', service: 'no_key', error: 'The definition source could not be saved: the settings file is read-only.' },
};
