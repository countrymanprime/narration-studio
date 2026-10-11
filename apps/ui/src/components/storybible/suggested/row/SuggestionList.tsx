import type { ExtractionSuggestion } from '../../../../api/contracts/extraction';
import { SectionLabel } from '../../../primitives/SectionLabel';
import { SuggestionRow, type SuggestionRowProps } from './SuggestionRow';

type ListProps = Omit<SuggestionRowProps, 'suggestion' | 'context'> & {
  title: string;
  suggestions: readonly ExtractionSuggestion[];
  /** What the page knows about the entry a suggestion belongs to. */
  contextOf?: (suggestion: ExtractionSuggestion) => SuggestionRowProps['context'];
};

/** A list of suggestions with a heading and a count; nothing is drawn for an empty list. */
export function SuggestionList({ title, suggestions, contextOf, ...row }: ListProps) {
  if (!suggestions.length) return null;
  return (
    <div className="flex flex-col gap-1.5" data-suggested>
      <SectionLabel>
        {title} · {suggestions.length}
      </SectionLabel>
      <ul>
        {suggestions.map((suggestion) => (
          <SuggestionRow key={suggestion.id} suggestion={suggestion} context={contextOf?.(suggestion)} {...row} />
        ))}
      </ul>
    </div>
  );
}
