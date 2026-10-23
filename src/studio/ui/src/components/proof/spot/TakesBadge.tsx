import { StatusBadge } from '../../primitives/StatusBadge';

/** "N takes" after a note's heard text, only where its spot has several. A word, never a colour alone. */
export function TakesBadge({ count }: { count: number }) {
  if (count < 2) return null;
  return (
    <span role="img" aria-label={`${count} takes at this spot`} className="ml-1.5 inline-flex align-middle">
      <StatusBadge tone="neutral" shape="tag" label={`${count} takes`} />
    </span>
  );
}
