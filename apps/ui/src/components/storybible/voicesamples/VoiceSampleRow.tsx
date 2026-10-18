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
    <InsetCard as="li" tone={problem ? 'danger' : 'neutral'} className="flex items-start gap-2.5" id={voiceSampleRowId(sample.id)}>
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
        <div className="flex flex-wrap items-center gap-2 font-semibold">
          {sample.primary ? (
            <span title="Primary: plays from the Booth" className="text-[var(--accent-strong)]">
              <Icon name="primarySample" />
              <span className="sr-only">Primary</span>
            </span>
          ) : null}
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
        <div className="text-sm text-[var(--text-muted)]">
          {problem ? (
            <>
              {problem.sentence}{' '}
              {markAgain ? (
                <>
                  {editingLink('Mark again in Editing')}
                  {canManage ? ' or delete it.' : ' or press Edit to delete it.'}
                </>
              ) : canManage ? (
                'Delete it.'
              ) : (
                'Press Edit to delete it.'
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
          <div className="mt-0.5 text-sm whitespace-pre-line" dir="auto">
            {sample.note}
          </div>
        ) : null}
      </div>
      <Menu render={<IconButton action="moreActions" label={`More about ${name}`} size="sm" />} items={items}>
        {null}
      </Menu>
    </InsetCard>
  );
}

const WORDS_SHOWN = 80;

/** The marked words cut at a length a row can hold; the full text is the hint. */
function truncate(text: string): string {
  const chars = [...text];
  return chars.length <= WORDS_SHOWN ? text : `${chars.slice(0, WORDS_SHOWN).join('')}…`;
}
