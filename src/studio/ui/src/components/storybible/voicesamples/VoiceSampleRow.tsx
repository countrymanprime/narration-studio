import type { VoiceSample } from '../../../api/contracts/voiceSamples';
import { Button } from '../../primitives/Button';
import { Icon } from '../../primitives/Icon';
import { IconButton } from '../../primitives/IconButton';
import { InsetCard } from '../../primitives/InsetCard';
import { Menu, type MenuItem } from '../../primitives/Menu';
import { StatusBadge } from '../../primitives/StatusBadge';
import { SamplePlayButton } from '../../voicesamples/SamplePlayButton';
import type { SamplePlayerStatus } from '../../voicesamples/samplePlayerStore';
import { clipProblem, passageBadge, sampleLength, sampleName } from './voiceSampleModel';

/** The DOM id of a sample's row, so focus can move to it after a delete. */
export const voiceSampleRowId = (id: string): string => `voice-sample-${id}`;

/** What the page says before it takes the narrator to Editing for a sample whose words moved. */
export const PASSAGE_MOVED_NOTICE = 'The words in this chapter changed since the sample was marked, so the marked words may have moved.';

export type VoiceSampleRowProps = {
  sample: VoiceSample;
  /** The name of the sample's character, for a sample with no label of its own. */
  characterName: string;
  status: SamplePlayerStatus;
  progress: number;
  onPlay: () => void;
  onStop: () => void;
  /** Rename and Make primary work on a read-only entry; Move and Delete are offered only when this is true (after Edit). */
  canManage: boolean;
  onRename: () => void;
  onMakePrimary: () => void;
  onMove?: () => void;
  onDelete: () => void;
  /** Takes the narrator to the sample's chapter in Editing; absent where the page has no router (a story), and then no link is drawn. */
  onOpenEditing?: () => void;
  /** Said when the narrator goes to Editing for a sample whose words changed. */
  onNotice: (text: string) => void;
  /** A sample whose character is gone is listed with a way to move it; its source line has no character to name. */
  orphan?: boolean;
};

/**
 * One voice sample (the approved mock's row): a play control, its label, length and primary star, where it came from with a way into Editing,
 * and a ⋯ menu. A clip that is missing or changed cannot play and says so; a passage that changed still plays and says that too.
 */
export function VoiceSampleRow({
  sample,
  characterName,
  status,
  progress,
  onPlay,
  onStop,
  canManage,
  onRename,
  onMakePrimary,
  onMove,
  onDelete,
  onOpenEditing,
  onNotice,
  orphan,
}: VoiceSampleRowProps) {
  const problem = clipProblem(sample);
  const passage = passageBadge(sample);
  const name = sampleName(sample, characterName);
  const chapterThere = sample.source.state !== 'chapter_missing';
  // Marking again is offered only while the words are as they were: otherwise the range would be found in text that moved.
  const markAgain = sample.source.state === 'ok' && Boolean(onOpenEditing);
  const items: MenuItem[] = [
    { key: 'rename', label: 'Rename…', onSelect: onRename },
    ...(sample.primary ? [] : [{ key: 'primary', label: 'Make primary', onSelect: onMakePrimary }]),
    ...(canManage && onMove ? [{ key: 'move', label: 'Move to a character…', onSelect: onMove }] : []),
    ...(canManage ? [{ key: 'delete', label: 'Delete…', onSelect: onDelete }] : []),
  ];
  const editingLink = (text: string) => (
    <Button
      variant="link"
      onClick={() => {
        if (sample.source.state === 'text_changed') onNotice(PASSAGE_MOVED_NOTICE);
        onOpenEditing?.();
      }}
    >
      {text}
    </Button>
  );

  return (
    <InsetCard as="li" tone={problem ? 'danger' : 'neutral'} className="@container flex items-start gap-2.5" id={voiceSampleRowId(sample.id)}>
      <SamplePlayButton
        label={name}
        durationMs={sample.durationMs}
        status={problem ? 'idle' : status}
        progress={progress}
        disabledReason={problem?.sentence}
        onPlay={onPlay}
        onStop={onStop}
      />
      <div className="min-w-0 flex-1">
        {/* The title line is as tall as the play and menu buttons, so the three share one middle (R3SB2-10); the star has a slot in every
            row, blank when the sample is not primary, so every title starts at one x (SBX-15). */}
        <div className="flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
          <span className="inline-flex w-4 flex-none justify-center text-[var(--accent-strong)]">
            {sample.primary ? (
              <span title="Primary: plays from the Booth">
                <Icon name="primarySample" />
                <span className="sr-only">Primary</span>
              </span>
            ) : null}
          </span>
          <span className="max-w-full min-w-0 truncate" dir="auto" title={name}>
            {name}
          </span>
          <span className="font-mono text-sm font-normal text-[var(--text-muted)]">{sampleLength(sample.durationMs)}</span>
          {status !== 'idle' && !problem ? <StatusBadge tone="neutral" label="Playing" /> : null}
          {passage ? (
            <span title={passage.hint}>
              <StatusBadge tone="warning" label={passage.badge} />
            </span>
          ) : null}
          {problem ? <StatusBadge tone="danger" label={problem.badge} /> : null}
        </div>
        <div className={`${UNDER_TITLE} text-sm text-[var(--text-muted)]`}>
          {problem ? (
            <>
              {problem.sentence}{' '}
              {markAgain ? (
                <>
                  {editingLink('Mark again in Editing')}
                  {canManage ? ' or delete it.' : ' or delete it in Voice data.'}
                </>
              ) : canManage ? (
                'Delete it.'
              ) : (
                // Not "press Edit": a locked entry has no Edit, and Voice data deletes on any entry (R3SB2-10).
                'Delete it in Voice data.'
              )}
            </>
          ) : (
            <>
              {sample.source.chapterTitle || (orphan ? 'A chapter' : 'A chapter that is no longer in the manuscript')}
              {sample.source.text ? (
                <>
                  {' · '}
                  <q dir="auto" title={sample.source.text}>
                    {truncate(sample.source.text)}
                  </q>
                </>
              ) : null}
              {chapterThere && onOpenEditing ? <> · {editingLink('Open in Editing')}</> : null}
            </>
          )}
        </div>
        {sample.note ? (
          <div className={`${UNDER_TITLE} mt-0.5 text-sm whitespace-pre-line`} dir="auto">
            {sample.note}
          </div>
        ) : null}
      </div>
      <Menu render={<IconButton action="moreActions" label={`More about ${name}`} />} items={items}>
        {null}
      </Menu>
    </InsetCard>
  );
}

const WORDS_SHOWN = 80;

/**
 * The lines under the title start where the title does (after the star's slot). In a narrow card (the Voice data drawer) they run from
 * under the play button instead, so the source does not wrap into a thin column (SBX-15).
 */
const UNDER_TITLE = 'pl-6 @max-[22rem]:-ml-[2.875rem] @max-[22rem]:pl-0';

/** The marked words cut at a length a row can hold; the full text is the hint. */
function truncate(text: string): string {
  const chars = [...text];
  return chars.length <= WORDS_SHOWN ? text : `${chars.slice(0, WORDS_SHOWN).join('')}…`;
}
