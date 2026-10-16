import { Button } from '../primitives/Button';

/**
 * A read the page could not complete, said in a sentence with a way forward (the definition of done: a failed host call is never silent).
 * The page keeps working on what it has; Check again reads once more.
 */
export function ReadNotice({ what, effect, checkAgain }: { what: string; effect: string; checkAgain: () => void }) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-2 rounded px-3 py-1.5 text-xs"
      style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
    >
      <span>
        Could not read {what}. {effect}
      </span>
      <Button variant="secondary" size="sm" onClick={checkAgain}>
        Check again
      </Button>
    </div>
  );
}
