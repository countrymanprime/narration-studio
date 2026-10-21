import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useMemo } from 'react';
import { expect, within } from 'storybook/test';
import { COMMAND_CATALOG } from '../../input/commands.catalog';
import { defaultKeymap } from '../../input/keymap';
import { registerPageCommands, type PageItem, type PageRef } from '../../input/pageCommands';
import { OverlayHost } from '../../overlay/OverlayHost';
import { createOverlayService } from '../../overlay/overlayService';
import { registerSearchSource } from '../../registries/search';
import { openJumpMenu } from './JumpMenu';

// The jump menu on the context of each page (docs/architecture/studio-shell-and-registries.md#page-commands): the page's items come first under
// "On this page", then the global commands. The items here are fixed samples shaped like what each page registers; the pages' own tests
// pin the real ones. The menu is the shell's dialog, so each story opens it over its own overlay host.
type Args = {
  page: PageRef;
  items: PageItem[];
  term?: string;
  scope?: 'page';
  hits?: boolean;
};

const item = (id: string, label: string, group: string, over: Partial<PageItem> = {}): PageItem => ({ id, label, group, run: () => {}, ...over });
const chapters = (...names: string[]) => names.map((name, i) => item(`chapter.${i}`, name, 'Chapters', { icon: 'goToChapter' }));

function Menu({ page, items, term, scope, hits }: Args) {
  const service = useMemo(() => createOverlayService(), []);
  useEffect(() => {
    const offs = [registerPageCommands(page, () => items)];
    if (hits) {
      offs.push(
        registerSearchSource((typed) => [
          {
            group: 'In the script',
            title: `…and then ${typed} said nothing…`,
            sub: 'Chapter 2 · ¶ 4',
            snippet: { pre: '…and then ', hit: typed, post: ' said nothing…' },
            run: () => {},
          },
        ]),
      );
    }
    const close = openJumpMenu({ service, keymap: defaultKeymap(COMMAND_CATALOG, false), runCommand: () => {}, initialTerm: term, scope });
    return () => {
      close();
      offs.forEach((off) => off());
    };
  }, [service, page, items, term, scope, hits]);
  return <OverlayHost service={service} />;
}

const meta = {
  title: 'Layout/JumpMenu',
  component: Menu,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Menu>;
export default meta;
type Story = StoryObj<typeof meta>;

const open = async (canvasElement: HTMLElement) => within(canvasElement.ownerDocument.body).findByRole('combobox', { name: 'Jump menu' });

/** Nothing typed: the page's groups under "On this page" before the global groups. */
export const Script: Story = {
  args: {
    page: { id: 'script', label: 'Script', supersedes: ['Chapters'] },
    items: [
      ...chapters('Chapter 1: Down the Rabbit-Hole', 'Chapter 2: The Pool of Tears'),
      item('entry.1', 'White Rabbit', 'Story Bible', { hint: 'Character', icon: 'locate' }),
      item('mark.1', 'Mark the selection as Tone', 'Mark types', { icon: 'markText', disabledReason: 'Select some text in the reader first' }),
    ],
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await open(canvasElement);
    await expect(await body.findByRole('option', { name: /^Chapters/ })).toBeVisible();
    await expect(body.getByRole('option', { name: /^Story Bible/ })).toBeVisible();
  },
};

/** Ctrl+F: only the page is searched and the matches in the text are marked. */
export const ScriptSearch: Story = {
  args: { ...Script.args, term: 'alice', scope: 'page', hits: true },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const field = await open(canvasElement);
    await expect(field).toHaveAccessibleDescription(/Script page. Searching this page only/);
    await expect(await body.findByRole('option', { name: /said nothing/ })).toBeVisible();
  },
};

/** Cut, effect, check recording and link track are listed off, each with its reason, until their conditions hold. */
export const EditingSelectionOff: Story = {
  args: {
    page: { id: 'editing', label: 'Editing', supersedes: ['Chapters'] },
    items: [
      ...chapters('Chapter 1', 'Chapter 2'),
      item('cut', 'Cut the selected words', 'Selection', { disabledReason: 'Select some words first' }),
      item('fx', 'Add an effect to the selection', 'Selection', { disabledReason: 'Select some words first' }),
      item('check', 'Check the recording', 'Selection', { icon: 'checkRecordings' }),
      item('link', 'Link the track', 'Selection', { disabledReason: 'This chapter is already linked' }),
    ],
    term: 'selection',
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await open(canvasElement);
    const cut = await body.findByRole('option', { name: /Cut the selected words/ });
    await expect(cut).toHaveAttribute('aria-disabled', 'true');
    await expect(cut).toHaveTextContent('Select some words first');
  },
};

export const Booth: Story = {
  args: {
    page: { id: 'booth', label: 'Booth', supersedes: ['Chapters'] },
    items: [
      ...chapters('Chapter 1', 'Chapter 2'),
      item('record', 'Start recording', 'Transport', { icon: 'record' }),
      item('stop', 'Stop', 'Transport', { icon: 'stop', disabledReason: 'Not recording' }),
    ],
  },
};

export const Production: Story = {
  args: {
    page: { id: 'production', label: 'Production' },
    items: [item('check.1', 'Check the manuscript', 'Checks', { icon: 'checkRecordings' }), ...chapters('Chapter 1')],
  },
};

export const Proof: Story = {
  args: {
    page: { id: 'proof', label: 'Proof', supersedes: ['Chapters'] },
    items: [...chapters('Chapter 1', 'Chapter 2'), item('waive', 'Waive the note', 'Selected note', { disabledReason: 'Select a note first' })],
  },
};

export const Pickups: Story = {
  args: {
    page: { id: 'pickups', label: 'Pickups' },
    items: [
      item('line.1', 'She turned and walked away.', 'Pickups', { hint: 'Chapter 1' }),
      item('line.2', 'A new day began.', 'Pickups', { hint: 'Chapter 2' }),
    ],
  },
};

/** Every category and every setting row by its label, a row that cannot be changed now listed off with the reason. */
export const Settings: Story = {
  args: {
    page: { id: 'settings', label: 'Settings' },
    items: [
      item('cat.rec', 'Recording & DAW', 'Categories'),
      item('row.mic', 'Microphone', 'Recording & DAW', { hint: 'Which input the Booth records from' }),
      item('row.out', 'Voice sample output', 'Recording & DAW', { disabledReason: 'REAPER’s own audio device is not changed' }),
    ],
    term: 'mic',
  },
};
