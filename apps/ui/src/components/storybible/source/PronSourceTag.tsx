import type { PronunciationSource } from '../../../api/contracts/pronunciationSources';
import { Button } from '../../primitives/Button';
import { Icon } from '../../primitives/Icon';
import { badgeClass, badgeStyle, toneColors } from '../../primitives/StatusBadge';
import { SourceMenu, type KeptAlternate } from './SourceMenu';
import { sourceIcon } from './sourceIcons';

/**
 * Where a pronunciation came from: the source's icon and name. Read-only it is a neutral pill. With `onPick` it is a button
 * that opens the menu of every source in `sources`, and `word` names what it is for. A source the list does not have shows as "Source".
 */
export function PronSourceTag({
  src,
  sources,
  word,
  onPick,
  alternate,
  pending,
  disabled,
}: {
  src: string;
  sources: readonly PronunciationSource[];
  word?: string;
  onPick?: (id: string) => void;
  alternate?: KeptAlternate;
  pending?: boolean;
  disabled?: boolean;
}) {
  const name = sources.find((source) => source.id === src)?.label ?? 'Source';
  const inner = (
    <>
      <Icon name={sourceIcon(src)} />
      <span>{name}</span>
    </>
  );
  if (!onPick) {
    return (
      <span className={badgeClass('pill')} style={badgeStyle(toneColors('neutral'))} aria-label={`Source: ${name}`}>
        {inner}
      </span>
    );
  }
  return (
    <SourceMenu
      sources={sources}
      current={src}
      onPick={onPick}
      alternate={alternate}
      trigger={
        <Button variant="secondary" size="sm" disabled={disabled} pending={pending} aria-label={`Pronunciation source${word ? ` for ${word}` : ''}: ${name}`}>
          {inner}
          <Icon name="openMenu" />
        </Button>
      }
    />
  );
}
