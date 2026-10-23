import { useEffect } from 'react';
import { Button } from '../components/primitives/Button';
import { TIPS, type TipId } from './tips.catalog';
import { useFirstUseTip } from './useFirstUseTip';

/**
 * A first-use tip over the page: a small card near the top of the nearest positioned ancestor, with the tip's sentence and "Got it".
 * It takes no room in the layout and shows once per narrator (`useFirstUseTip`). `used` dismisses it when the narrator does what it
 * explains, so a narrator who already knows is not asked to press a button for it.
 */
export function FirstUseTip({ id, used = false }: { id: TipId; used?: boolean }) {
  const { visible, dismiss } = useFirstUseTip(id);
  useEffect(() => {
    if (visible && used) dismiss();
  }, [visible, used, dismiss]);
  if (!visible || used) return null;
  return (
    <aside
      aria-label="Tip"
      data-first-use-tip={id}
      className="absolute inset-x-3 top-[3.75rem] z-[5] mx-auto flex max-w-[26rem] items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[0.88rem] shadow-md"
    >
      <p className="m-0 flex-1">{TIPS[id].text}</p>
      <Button size="sm" variant="secondary" onClick={dismiss}>
        Got it
      </Button>
    </aside>
  );
}
