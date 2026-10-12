import { HeaderChip } from '../../primitives/HeaderChip';
import { TooltipTarget } from '../../primitives/Tooltip';

/**
 * The credits' unresolved-token warning in the top bar's resume slot: the tokens with no value read as written, in brackets, and
 * recording is still allowed (ADR 0150). The chip opens Settings > Credits through the Booth's leave guard.
 */
export function CreditsWarning({ tokens, onFix }: { tokens: readonly string[]; onFix: () => void }) {
  if (tokens.length === 0) return null;
  const text = `${tokens.join(', ')} ${tokens.length === 1 ? 'has' : 'have'} no value and will be read as written. Fill them in under Settings > Credits.`;
  return (
    <TooltipTarget text={text}>
      <HeaderChip tone="warning" aria-label={`Credits tokens with no value: ${tokens.join(', ')}. Fill them in Settings`} onClick={onFix}>
        {tokens.length === 1 ? '1 token has no value' : `${tokens.length} tokens have no value`}
      </HeaderChip>
    </TooltipTarget>
  );
}
