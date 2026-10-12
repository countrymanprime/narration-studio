import type { PronunciationLookupSource } from '../../../../../api/contracts/pronunciationLookup';
import { Button } from '../../../../primitives/Button';

const LINKS: readonly { source: PronunciationLookupSource; label: string }[] = [
  { source: 'merriam_webster', label: 'Definition' },
  { source: 'forvo', label: 'Forvo' },
  { source: 'youglish', label: 'YouGlish' },
];

/** "Look up on the web": a button each for the fixed look-up pages. The page passes a source id and the word; the host builds the address. */
export function ExternalLinks({ word, open }: { word: string; open: (source: PronunciationLookupSource, word: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {LINKS.map((link) => (
        <Button key={link.source} variant="secondary" size="sm" aria-label={link.label} onClick={() => open(link.source, word)}>
          {link.label}
        </Button>
      ))}
    </div>
  );
}
