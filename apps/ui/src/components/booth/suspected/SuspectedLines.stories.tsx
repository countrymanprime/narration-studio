import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useRef, useState } from 'react';
import { expect, within } from 'storybook/test';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import type { TeleprompterFlagFinding, TeleprompterFlagSave } from '../../../api/contracts/teleprompter';
import { OverlayProvider } from '../../../overlay/OverlayProvider';
import { createOverlayService } from '../../../overlay/overlayService';
import { SuspectedLines } from './SuspectedLines';
import type { SuspectedFlag } from './suspectedLines';
import { useSuspectedPickups } from './useSuspectedPickups';

const skipped: SuspectedFlag = {
  chapterId: 'c8',
  paragraphId: 'p9',
  kind: 'skipped',
  wordStart: 2,
  wordEnd: 5,
  scriptStart: 40,
  scriptEnd: 43,
  script: 'down the hole',
  heard: '',
};
const again: SuspectedFlag = {
  chapterId: 'c8',
  paragraphId: 'p12',
  kind: 'restart',
  wordStart: 0,
  wordEnd: 3,
  scriptStart: 90,
  scriptEnd: 93,
  script: 'Alice was beginning',
  heard: 'Alice was be Alice was beginning',
};

// A host that answers each flag with its stored decision; `closed` names the paragraphs already dismissed.
const hostWith = (closed: string[]) => ({
  ...createMockApi(),
  teleprompterSaveFlags: async (_chapter: string, flags: TeleprompterFlagSave[]) =>
    flags.map(
      (f) =>
        ({
          id: `c8:${f.paragraphId}`,
          evidence_version: 'v1',
          review: { status: closed.includes(f.paragraphId) ? 'dismissed' : 'unreviewed' },
        }) as unknown as TeleprompterFlagFinding,
    ),
  findingsReview: async (request: { id: string; status: string }) => ({ id: request.id, evidence_version: 'v2', review: { status: request.status } }) as never,
});

const meta = {
  title: 'Booth/SuspectedLines',
  component: SuspectedLines,
  args: { chapterId: 'c8', flags: [skipped, again] },
  decorators: [
    (Story, context) => (
      <ApiProvider api={hostWith((context.parameters.closed as string[] | undefined) ?? [])}>
        <div className="w-80 max-w-full bg-[var(--surface)] p-3">
          <Story />
        </div>
      </ApiProvider>
    ),
  ],
} satisfies Meta<typeof SuspectedLines>;

export default meta;
type Story = StoryObj<typeof meta>;

export const None: Story = { args: { flags: [] } };

export const TwoOpen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Suspected · 2')).toBeTruthy();
    await expect(canvas.getByRole('button', { name: 'Dismiss: down the hole' })).toBeTruthy();
  },
};

export const OneDismissed: Story = {
  parameters: { closed: ['p9'] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Dismissed')).toBeTruthy();
    await expect(canvas.getByText('Suspected · 1')).toBeTruthy();
  },
};

// A take stopped after reading the paragraph of a suspected line: the line joins Pickups and the toast offers Undo.
function TakeStopped({ flags }: { flags: SuspectedFlag[] }) {
  const { takeStopped } = useSuspectedPickups({ chapterId: 'c8', flags });
  const stopped = useRef(false);
  useEffect(() => {
    if (stopped.current) return;
    stopped.current = true;
    void takeStopped({ paragraphIds: new Set(['p9']) });
  }, [takeStopped]);
  return <SuspectedLines chapterId="c8" flags={flags} />;
}

function WithToasts({ flags }: { flags: SuspectedFlag[] }) {
  const [service] = useState(createOverlayService);
  return (
    <OverlayProvider service={service}>
      <TakeStopped flags={flags} />
    </OverlayProvider>
  );
}

export const AddedToPickups: Story = {
  render: (args) => <WithToasts flags={[...args.flags]} />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByText('Take saved · 1 suspected line added to Pickups')).toBeTruthy();
    await expect(body.getByRole('button', { name: 'Undo' })).toBeTruthy();
  },
};
