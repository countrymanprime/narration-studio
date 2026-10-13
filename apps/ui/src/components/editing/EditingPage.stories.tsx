import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fireEvent, userEvent, waitFor, within } from 'storybook/test';
import type { DawSetupId } from '../../fixtures/daw';
import { EditingPage, type EditingPageProps } from './EditingPage';
import { dawFor, EditingHost, newJournal, noAudioApi, pageApi } from './page/testPage';

// The Editing page (docs/research/mockups/studio-next/src/pages/Editing.tsx) over the mock api with a small chapter that was heard, and the
// mock's DAW setups. No route yet: SN-E9 mounts it. Each story drives the page to one state.
type Args = Omit<EditingPageProps, 'hasManuscript'> & { setup: DawSetupId; heard: boolean; hasManuscript: boolean; noAudio?: 'unlinked' | 'missing' | 'empty' };

function Page({ setup, heard, noAudio, ...props }: Args) {
  const [host] = useState(() => ({ api: pageApi({ heard, ...(noAudio ? noAudioApi(noAudio) : {}) }), daw: dawFor(setup), journal: newJournal() }));
  return (
    <div className="h-[calc(100vh-2rem)]">
      <EditingHost {...host}>
        <EditingPage {...props} />
      </EditingHost>
    </div>
  );
}

const meta = {
  title: 'Editing/Page',
  component: Page,
  args: { setup: 'reaper', heard: true, hasManuscript: true },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Page>;

export default meta;
type Story = StoryObj<typeof meta>;

const script = (canvasElement: HTMLElement) => within(canvasElement).findByRole('textbox', { name: 'Script with what was heard' }, { timeout: 4000 });
const word = (canvasElement: HTMLElement, key: string) => canvasElement.querySelector<HTMLElement>(`[data-k="${key}"]`)!;

// The script: the chapter step, the legend, the text with its marks, the bar and the key hints; no drawer or strip until asked.
export const Default: Story = {
  play: async ({ canvasElement }) => {
    await script(canvasElement);
    await expect(canvasElement.querySelector('#drawer')).toBeNull();
  },
};

// Words selected: the bar says how many and offers the slices' actions; the toolbar floats under the last word.
export const Selection: Story = {
  play: async ({ canvasElement }) => {
    await script(canvasElement);
    fireEvent.mouseDown(word(canvasElement, 'p1:1'), { button: 0 });
    fireEvent.mouseDown(word(canvasElement, 'p1:3'), { button: 0, shiftKey: true });
    await within(within(canvasElement).getByRole('toolbar', { name: 'Playback and selection' })).findByText(/^\d+ words$/);
  },
};

// Opened at a passage from another page: the cursor on its first word and its takes open under the line.
export const TakesOpen: Story = {
  args: { passageId: 'ps-1' },
  play: async ({ canvasElement }) => {
    await script(canvasElement);
    await waitFor(() => expect(canvasElement.querySelectorAll('[data-takes="p1"] [data-take]').length).toBe(2), { timeout: 4000 });
  },
};

// The drawer on Clean up: the Found list and the findings by operation.
export const DrawerCleanUp: Story = {
  play: async ({ canvasElement }) => {
    await script(canvasElement);
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Clean up and effects' }));
    await within(canvasElement).findByRole('region', { name: 'Clean up findings' });
  },
};

// The drawer on Effects, with words selected to put an effect on.
export const DrawerEffects: Story = {
  play: async ({ canvasElement }) => {
    await script(canvasElement);
    fireEvent.mouseDown(word(canvasElement, 'p2:1'), { button: 0, detail: 2 });
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Clean up and effects' }));
    await userEvent.click(await within(canvasElement).findByRole('tab', { name: /^Effects/ }));
    await within(canvasElement).findByRole('region', { name: 'Effects' });
  },
};

// The drawer on Backups, where the DAW keeps them (Audacity with backups).
export const DrawerBackups: Story = {
  args: { setup: 'audacity-backups' },
  play: async ({ canvasElement }) => {
    await script(canvasElement);
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Clean up and effects' }));
    await userEvent.click(await within(canvasElement).findByRole('tab', { name: /^Backups/ }, { timeout: 4000 }));
    await within(canvasElement).findByRole('region', { name: 'Backups' });
  },
};

// The DAW is not answering: the banner with the capability's own sentence and Retry; the edits wait, playback goes on.
export const DawOff: Story = {
  args: { setup: 'reaper-off' },
  play: async ({ canvasElement }) => {
    await script(canvasElement);
    await within(canvasElement).findByRole('button', { name: 'Retry' });
  },
};

// The built-in recorder: no banner; the app's own takes.
export const BuiltIn: Story = { args: { setup: 'builtin' } };

// Nothing transcribed yet: the "Not transcribed yet" pill where the legend goes, and the text plain.
export const NotTranscribed: Story = { args: { heard: false } };

// A chapter with no audio to edit: the banner says why and offers the audio engine panel; the script reads plain, nothing boxed "not read".
export const NoAudioUnlinked: Story = {
  args: { noAudio: 'unlinked' },
  play: async ({ canvasElement }) => {
    await script(canvasElement);
    await within(canvasElement).findByRole('button', { name: 'Open the audio engine panel' });
    await expect(canvasElement.querySelectorAll('[data-mark="miss"]')).toHaveLength(0);
  },
};

// The chapter's linked track is not in the saved project.
export const NoAudioTrackMissing: Story = { args: { noAudio: 'missing' } };

// The chapter's track has nothing on it.
export const NoAudioTrackEmpty: Story = { args: { noAudio: 'empty' } };

// The built-in recorder has no track to link: the banner points at recording.
export const NoAudioBuiltIn: Story = { args: { noAudio: 'unlinked', setup: 'builtin' } };

// A chapter with no text.
export const NoText: Story = { args: { chapterId: 'c2' } };

// No manuscript: the page asks for one and draws nothing else.
export const NoManuscript: Story = { args: { hasManuscript: false } };
