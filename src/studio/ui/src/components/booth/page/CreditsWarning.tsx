import { HeaderChip } from '../../primitives/HeaderChip';
import { TooltipTarget } from '../../primitives/Tooltip';

/**
 * The credits' unresolved-token warning in the top bar's resume slot: the tokens with no value read as written, in brackets, and
 * recording is still allowed. The chip opens Settings > Project > Credits through the Booth's leave guard.
 */
export function CreditsWarning({ tokens, onFix }: { tokens: readonly string[]; onFix: () => void }) {
  if (tokens.length === 0) return null;
  const label = tokens.length === 1 ? '1 token has no value' : `${tokens.length} tokens have no value`;
  const text = `${tokens.join(', ')} ${tokens.length === 1 ? 'has' : 'have'} no value and will be read as written. Fill them in under Settings > Project > Credits.`;
  return (
    <TooltipTarget text={text}>
      {/* The name starts with the words the chip draws: axe fails a name that leaves them out. */}
      <HeaderChip tone="warning" aria-label={`${label}: ${tokens.join(', ')}. Fill them in Settings`} onClick={onFix}>
        {label}
      </HeaderChip>
    </TooltipTarget>
  );
}
