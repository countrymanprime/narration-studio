import { Kbd, type KbdSize } from './Kbd';
import { KeyChord, glyphOf, keyName } from './KeyCap';

// A key cap with its action spelled out beside it (mock 03's command bar): the cap, 10 px, then the action in Plex Sans,
// muted. A chord of text keys is the `Kbd` of ADR 0620; a chord with a glyph key (arrows, Enter, Esc, Tab, Backspace, Space,
// right-click) draws it through `KeyCap` (ADR 0761) and is one image named by every key. `spokenLabel` overrides that name
// for a symbol key whose glyph alone would read as a stray character.
export function KeyHint({
  keys,
  action,
  spokenLabel,
  size = 'sm',
  className = '',
}: {
  keys: string[];
  // The visible label naming what the key does (mock 03: "Play", "Record", ...).
  action: string;
  // Overrides the cap's own spoken name; see `Kbd`'s `label`.
  spokenLabel?: string;
  size?: KbdSize;
  className?: string;
}) {
  const hasGlyph = keys.some((key) => glyphOf(key));
  return (
    <span className={`inline-flex items-center gap-[0.625rem] ${className}`}>
      {hasGlyph ? (
        <span role="img" aria-label={spokenLabel ?? keys.map(keyName).join(' + ')}>
          <KeyChord keys={keys} size={size} />
        </span>
      ) : (
        <Kbd keys={keys} label={spokenLabel} size={size} />
      )}
      <span className="font-['IBM_Plex_Sans',ui-sans-serif,sans-serif] text-[0.8125rem] text-[var(--text-muted)]">{action}</span>
    </span>
  );
}
