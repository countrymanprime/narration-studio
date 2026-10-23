import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test';
import { ApiProvider } from '../../api/ApiContext';
import type { ChapterTrackMatch } from '../../api/contracts/chapterTrackMap';
import type { DawChoice } from '../../api/contracts/daw';
import { createMockApi } from '../../api/mockApi';
import { DAW_SETUPS } from '../../fixtures/daw';
import type { NarrationApi } from '../../types';
import { ConnectionResolveDialog, type ConnectionResolveDialogProps } from './ConnectionResolveDialog';

// The dialog that replaces the not-connected and not-linked banners: it names the problem in the host's words, offers the fix and a Check again,
// and the header X is the way out. Both variants are drawn over the page, as in the app; the stories open them already mounted.
const NEVER = new Promise<never>(() => {});
const track = (n: number, name = `Track ${n}`) => ({ guid: `{T-${n}}`, name, index: n - 1 });
const best = { trackGuid: '{T-2}', trackName: 'Chapter 3', trackIndex: 1, score: 1, source: 'track-name' as const, region: null };

const match = (over: Partial<ChapterTrackMatch> = {}): ChapterTrackMatch => ({
  chapterId: 'c3',
  chapterTitle: 'Chapter 3',
  projectFile: 'C:/Audio/Book.rpp',
  savedAt: '2026-10-20T10:00:00Z',
  status: 'matched',
  track: best,
  candidates: [best],
  warnings: [],
  tracks: [track(1, 'Chapter 2'), track(2, 'Chapter 3'), track(3, 'Chapter 4')],
  recordedEnd: null,
  ...over,
});

const choice = (over: Partial<DawChoice> = {}): DawChoice => ({
  hasProject: true,
  daw: 'REAPER',
  source: 'chosen',
  chosen: 'REAPER',
  state: 'linked',
  reachable: false,
  linkedFile: 'Book.rpp',
  foundFiles: [],
  launcherAutoStart: true,
  experimental: false,
  options: [],
  starting: null,
  bridge: null,
  ...over,
});

function Stage({ props, api }: { props: ConnectionResolveDialogProps; api?: Partial<NarrationApi> }) {
  return (
    <ApiProvider api={createMockApi(api)}>
      <ConnectionResolveDialog {...props} />
    </ApiProvider>
  );
}

const off = {
  variant: 'reaper-off',
  daw: 'REAPER',
  sentence: 'REAPER is not running.',
  stillWorks: 'You can look at takes, findings and effects. Changes wait until REAPER is running.',
  checkedAt: Date.now() - 12_000,
  onCheckAgain: fn(),
  onClose: fn(),
} as const;

const linking = {
  variant: 'chapter-unlinked',
  chapterId: 'c3',
  chapterName: 'Chapter 3',
  sentence: 'There is no audio to edit yet. The script is shown without what was heard.',
  dawName: 'REAPER',
  onLinked: fn(),
  onClose: fn(),
} as const;

const meta = {
  title: 'Connection/ConnectionResolveDialog',
  component: Stage,
  args: { props: off, api: { dawChoice: async () => choice() } },
} satisfies Meta<typeof Stage>;

export default meta;
type Story = StoryObj<typeof meta>;

const dialog = () => screen.findByRole('dialog');

/** REAPER is closed, or its bridge has not started: the project is linked, so Start opens it and connects. */
export const NotConnected: Story = {
  play: async () => {
    const open = await dialog();
    await expect(within(open).getByText('REAPER is not connected')).toBeVisible();
    await expect(await within(open).findByText(/closed, or its bridge has not started yet/)).toBeVisible();
    await expect(within(open).getByText(/Last checked \d+ s ago/)).toBeVisible();
    await userEvent.click(within(open).getByRole('button', { name: 'Close' }));
    await expect(off.onClose).toHaveBeenCalledOnce();
  },
};

/** REAPER connected before and stopped answering: the host's `not_running` state with a bridge. */
export const WentQuiet: Story = {
  args: { props: off, api: { dawChoice: async () => choice({ state: 'not_running' }) } },
  play: async () => {
    await expect(await within(await dialog()).findByText(/connected before and has stopped answering/)).toBeVisible();
  },
};

/** No project file is linked, so the host would refuse to start it: Start is off and the reason is on the page. */
export const NotLinked: Story = {
  args: { props: off, api: { dawChoice: async () => choice({ state: 'not_linked', linkedFile: null }) } },
  play: async () => {
    const open = await dialog();
    await within(open).findByText(/Link the project file first/);
    await expect(within(open).getByRole('button', { name: 'Start REAPER' })).toHaveAttribute('aria-disabled', 'true');
  },
};

/** Start was pressed and the host has not answered yet: the button is busy and the dialog stays open. */
export const Starting: Story = {
  args: { props: off, api: { dawChoice: async () => choice(), launchDaw: () => NEVER } },
  play: async () => {
    const open = await dialog();
    await userEvent.click(within(open).getByRole('button', { name: 'Start REAPER' }));
    await waitFor(() => expect(within(open).getByRole('button', { name: 'Start REAPER' })).toHaveAttribute('aria-busy', 'true'));
  },
};

/** The host said no (no project open, no file linked, REAPER not found): nothing started, and the sentence is in the dialog. */
export const Refused: Story = {
  args: {
    props: off,
    api: { dawChoice: async () => choice(), launchDaw: async () => Promise.reject(new Error('Link a REAPER project file before starting REAPER.')) },
  },
  play: async () => {
    const open = await dialog();
    await userEvent.click(within(open).getByRole('button', { name: 'Start REAPER' }));
    await expect((await within(open).findByRole('alert')).textContent).toContain('Link a REAPER project file before starting REAPER.');
  },
};

/** The host started REAPER and it never answered in time: the dialog says so and keeps Check again. */
export const Failed: Story = {
  args: {
    props: { ...off, pollMs: 10, polls: 2 },
    api: {
      dawChoice: async () => choice(),
      dawCapabilities: async () => structuredClone(DAW_SETUPS['reaper-off']),
      launchDaw: async () => ({ launched: true, path: 'C:/REAPER/reaper.exe', source: 'file_association' }),
    },
  },
  play: async () => {
    const open = await dialog();
    await userEvent.click(within(open).getByRole('button', { name: 'Start REAPER' }));
    await expect((await within(open).findByRole('alert')).textContent).toContain('was started and has not answered yet');
  },
};

/** The last read of the DAW failed: "can't tell", and when it was last heard, never the last answer as a fact. */
export const ReadFailed: Story = {
  args: { props: { ...off, readFailed: true, heardAt: Date.now() - 45_000 } },
  play: async () => {
    const open = await dialog();
    await expect(within(open).getByText(/Can't tell whether REAPER is answering/)).toBeVisible();
    await expect(within(open).getByText(/Last heard \d+ s ago/)).toBeVisible();
  },
};

/** A long sentence from the host wraps inside the dialog. */
export const LongSentence: Story = {
  args: { props: { ...off, sentence: `Audacity is not answering. ${'Open the Audacity chip at the top for the steps. '.repeat(6)}` } },
};

/** The chapter has no linked track: the matcher's best match is preselected among every track the host found, best first. */
export const ChapterSeveralTracks: Story = {
  args: { props: linking, api: { chapterTrackMatch: async () => match(), chapterTrackMapList: async () => ({ documentId: 'd', mappings: [] }) } },
  play: async () => {
    const open = await dialog();
    const select = await within(open).findByRole('combobox', { name: 'Track for Chapter 3' });
    await expect(select).toHaveValue('{T-2}');
    await expect(within(select).getByRole('group', { name: 'Best match' })).toBeInTheDocument();
    await expect(linking.onLinked).not.toHaveBeenCalled();
  },
};

export const ChapterLoading: Story = {
  args: { props: linking, api: { chapterTrackMatch: () => NEVER } },
  play: async () => {
    await expect(await within(await dialog()).findByText('Reading the REAPER tracks…')).toBeVisible();
  },
};

export const ChapterReadFailed: Story = {
  args: { props: linking, api: { chapterTrackMatch: async () => Promise.reject(new Error('The project file could not be read.')) } },
  play: async () => {
    const open = await dialog();
    await expect((await within(open).findByRole('alert')).textContent).toContain('The project file could not be read.');
    // Nothing to pick from: creating the track in the DAW (which needs no saved project) is the primary action.
    await expect(within(open).queryByRole('button', { name: 'Link track' })).toBeNull();
    await expect(within(open).getByRole('button', { name: 'Create a new track' })).not.toHaveAttribute('aria-disabled');
  },
};

/** The saved project has no tracks: there is nothing to pick, so creating one named after the chapter is the primary action. */
export const ChapterNoTracks: Story = {
  args: { props: linking, api: { chapterTrackMatch: async () => match({ tracks: [], track: null, candidates: [], status: 'none' }) } },
  play: async () => {
    const open = await dialog();
    await expect(await within(open).findByText(/has no tracks yet/)).toBeVisible();
    await expect(within(open).getByRole('button', { name: 'Create a new track' })).toBeVisible();
  },
};

const created = {
  outcome: 'created' as const,
  documentId: 'doc',
  link: { trackGuid: '{NEW}', chapterId: 'c3', chapterTitle: 'Chapter 3', confirmedAt: '2026-10-23T10:00:00Z', origin: 'manual' as const, match: null },
  displaced: null,
  mappings: [],
  track: { guid: '{NEW}', name: 'Chapter 3', index: 3 },
};

/** Create a new track beside the list: the DAW adds one named after the chapter, it is linked, and the page is told which track. */
export const ChapterCreateTrack: Story = {
  args: { props: { ...linking, onLinked: fn() }, api: { chapterTrackMatch: async () => match(), chapterTrackCreate: async () => created } },
  play: async ({ args }) => {
    const open = await dialog();
    await within(open).findByRole('combobox');
    await expect(within(open).getByText(/Or have REAPER add a new track for this chapter/)).toBeVisible();
    await userEvent.click(within(open).getByRole('button', { name: 'Create a new track' }));
    const props = args.props as typeof linking;
    await waitFor(() => expect(props.onLinked).toHaveBeenCalledWith(created, created.track));
  },
};

/** The DAW cannot add the track now (it is recording): its sentence is in the dialog and nothing is linked. */
export const ChapterCreateRefused: Story = {
  args: {
    props: linking,
    api: {
      chapterTrackMatch: async () => match({ tracks: [], track: null, candidates: [], status: 'none' }),
      chapterTrackCreate: async () => ({
        outcome: 'refused' as const,
        reason: 'recording' as const,
        message: 'REAPER is recording. Stop the take, then create the track.',
      }),
    },
  },
  play: async () => {
    const open = await dialog();
    await userEvent.click(await within(open).findByRole('button', { name: 'Create a new track' }));
    await expect((await within(open).findByRole('alert')).textContent).toBe('REAPER is recording. Stop the take, then create the track.');
  },
};

/** An engine that cannot add a track from this app (its capability says so): the button is off and the sentence says what to do in the DAW. */
export const ChapterCreateUnavailable: Story = {
  args: {
    props: {
      ...linking,
      dawName: 'Audacity',
      create: {
        available: false,
        message: 'Audacity cannot add a track for a chapter from this app. Add a track named “Chapter 3” in Audacity, then link it.',
      },
    },
    api: { chapterTrackMatch: async () => match({ tracks: [], track: null, candidates: [], status: 'none' }) },
  },
  play: async () => {
    const open = await dialog();
    await expect(await within(open).findByText(/cannot add a track for a chapter from this app/)).toBeVisible();
    await expect(await within(open).findByRole('button', { name: 'Create a new track' })).toHaveAttribute('aria-disabled', 'true');
  },
};

/** A tie is not a best match: nothing is preselected and Link track stays off until the narrator picks. */
export const ChapterNoBestMatch: Story = {
  args: { props: linking, api: { chapterTrackMatch: async () => match({ status: 'ambiguous', track: null, candidates: [best] }) } },
  play: async () => {
    const open = await dialog();
    const select = await within(open).findByRole('combobox');
    await expect(select).toHaveValue('\u0000placeholder');
    await expect(within(open).getByRole('button', { name: 'Link track' })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.selectOptions(select, '{T-1}');
    await waitFor(() => expect(within(open).getByRole('button', { name: 'Link track' })).not.toHaveAttribute('aria-disabled'));
  },
};

/** The host refuses the link: the sentence is in the dialog and the dialog stays. */
export const ChapterLinkRefused: Story = {
  args: {
    props: linking,
    api: { chapterTrackMatch: async () => match(), chapterTrackSet: async () => Promise.reject(new Error('That chapter is not in the manuscript.')) },
  },
  play: async () => {
    const open = await dialog();
    await within(open).findByRole('combobox');
    await userEvent.click(within(open).getByRole('button', { name: 'Link track' }));
    await expect((await within(open).findByRole('alert')).textContent).toContain('That chapter is not in the manuscript.');
  },
};

/** The best track already belongs to another chapter: the card says linking moves it. */
export const ChapterTrackLinkedElsewhere: Story = {
  args: {
    props: linking,
    api: {
      chapterTrackMatch: async () => match(),
      chapterTrackMapList: async () => ({
        documentId: 'd',
        mappings: [{ trackGuid: '{T-2}', chapterId: 'c9', chapterTitle: 'Chapter 9', confirmedAt: '2026-10-01T10:00:00Z' }],
      }),
    },
  },
  play: async () => {
    await expect(await within(await dialog()).findByText('Chapter 3 is linked to Chapter 9. Linking it here moves it.')).toBeVisible();
  },
};

/** The link was to a track the saved project no longer has. */
export const ChapterTrackMissing: Story = {
  args: { props: { ...linking, missing: true }, api: { chapterTrackMatch: async () => match() } },
  play: async () => {
    await expect(await within(await dialog()).findByText('Chapter 3’s track is not in the project')).toBeVisible();
  },
};

const LONG = 'The Very Long Title of a Chapter That Goes On and On and Never Seems to Stop: Part One of Many Parts, Recorded Twice, Take Seven (final-final)';
/** Long chapter and track names, an RTL name and emoji wrap inside the dialog, and many tracks scroll in its body. */
export const ChapterLongNames: Story = {
  args: {
    props: { ...linking, chapterName: LONG, sentence: 'There is no audio to edit yet. The script is shown without what was heard.' },
    api: {
      chapterTrackMatch: async () =>
        match({
          track: null,
          candidates: [],
          status: 'none',
          tracks: [track(1, LONG), track(2, 'الفصل الأول 🎙️'), ...Array.from({ length: 30 }, (_, i) => track(i + 3, `Chapter ${i + 3} — narration`))],
        }),
    },
  },
};
