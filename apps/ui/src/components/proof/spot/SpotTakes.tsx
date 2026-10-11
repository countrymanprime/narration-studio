import { useApi } from '../../../api/ApiContext';
import { IconButton } from '../../primitives/IconButton';
import { SectionLabel } from '../../primitives/SectionLabel';
import { StatusBadge } from '../../primitives/StatusBadge';
import { useRangePlayer } from '../../engine/useRangePlayer';
import { parseMarkup, type MarkupNode } from '../inspector/evidenceQuotes';
import { heardMarkup, type Spot, type SpotTake } from './spot';

// A raw play is the take's own range and nothing around it.
const NO_ROLL = { pre: 0, post: 0 };

function Markup({ nodes }: { nodes: MarkupNode[] }) {
  return nodes.map((node, index) => {
    if (typeof node === 'string') return node;
    const Tag = node.tag;
    return (
      <Tag key={index} className={node.tag === 'del' || node.tag === 'ins' ? 'font-semibold' : undefined}>
        <Markup nodes={node.children} />
      </Tag>
    );
  });
}

const seconds = (value: number) => `${value.toFixed(1)} s`;

/**
 * The Inspector's "Takes at this spot · N" (Studio Next mock `SpotTakes`), for its `spot` slot. Read-only: each take has a play button
 * for its raw audio range (through the app's range player, never the DAW; a second press stops it), its length and a Kept pill, and
 * what the check heard, the kept take's against the script. Choosing, keeping or hiding a take is Editing's, one icon away.
 */
export function SpotTakes({
  spot,
  refusal,
  onOpenInEditing,
}: {
  spot: Spot | null;
  /** The host's sentence when it refused to list the takes. */
  refusal?: string;
  onOpenInEditing: (chapterId: string, passageId: string) => void;
}) {
  const api = useApi();
  const player = useRangePlayer(api.mediaUrl, NO_ROLL);
  if (!spot) return refusal ? <p className="text-sm text-[var(--text-muted)]">{refusal}</p> : null;

  const playing = (take: SpotTake) =>
    player.isPlaying && player.activeRange?.sourceFile === take.sourceFile && player.activeRange.rangeStart === take.sourceStart;
  const press = (take: SpotTake) => {
    if (playing(take)) player.stop();
    else player.play({ sourceFile: take.sourceFile, rangeStart: take.sourceStart, rangeEnd: take.sourceStart + take.sourceLength });
  };

  return (
    <section aria-label="Takes at this spot" className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <SectionLabel as="h3">{`Takes at this spot · ${spot.takes.length}`}</SectionLabel>
        <span className="flex-1" />
        <IconButton size="sm" action="manageTakes" label="Manage takes in Editing" onClick={() => onOpenInEditing(spot.chapterId, spot.passageId)} />
      </div>
      <ul className="flex flex-col gap-1.5">
        {spot.takes.map((take) => {
          const unplayable =
            take.sourceFile === ''
              ? (take.reason ?? 'This take has no source audio.')
              : take.hidden
                ? (take.reason ?? 'This take cannot be heard.')
                : undefined;
          const on = playing(take);
          return (
            <li key={take.id} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2 text-sm">
                <IconButton
                  size="sm"
                  action={on ? 'stop' : 'play'}
                  label={`${on ? 'Stop' : 'Play'} ${take.label}`}
                  disabledReason={unplayable}
                  onClick={() => press(take)}
                />
                <span className="font-semibold">{take.label}</span>
                <span className="text-[var(--text-muted)]">{seconds(take.sourceLength)}</span>
                {take.kept ? <StatusBadge tone="success" label="✓ Kept" /> : take.active ? <StatusBadge tone="info" label="✓ Active" /> : null}
              </div>
              {unplayable && <p className="text-xs text-[var(--text-muted)]">{unplayable}</p>}
              {take.heard !== undefined && (
                <p data-heard={take.id} className="text-sm [overflow-wrap:anywhere]">
                  <span className="sr-only">Heard: </span>
                  {take.kept ? <Markup nodes={parseMarkup(heardMarkup(spot.script, take.heard))} /> : take.heard}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
