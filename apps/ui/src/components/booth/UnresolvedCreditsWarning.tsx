import { Button } from '../primitives/Button';
import { CREDITS_LABEL, type CreditsKind } from './readerModel';

/**
 * A token with no value is named and linked to Settings, and Start stays allowed (ADR 0150, owner decision
 * 2026-09-23). Shown in the Booth's credits mode.
 */
export function UnresolvedCreditsWarning({ kind, tokens, onFix }: { kind: CreditsKind; tokens: string[]; onFix?: () => void }) {
  const heading = `Some ${CREDITS_LABEL[kind].toLowerCase()} tokens have no value`;
  return (
    <div
      role="status"
      aria-label={heading}
      className="rounded-lg border px-4 py-3 text-sm"
      style={{ borderColor: 'var(--warn)', background: 'color-mix(in srgb, var(--warn) 10%, var(--surface))' }}
    >
      <p className="font-semibold" style={{ color: 'var(--warn-text)' }}>
        {heading}
      </p>
      <p className="mt-1">
        {tokens.join(', ')} will show as written, in brackets. You can still start reading; fill them in under Settings &gt; Credits first so the recording says
        the right thing.
      </p>
      {onFix && (
        <Button variant="secondary" className="mt-2" onClick={onFix}>
          Fill them in Settings
        </Button>
      )}
    </div>
  );
}
