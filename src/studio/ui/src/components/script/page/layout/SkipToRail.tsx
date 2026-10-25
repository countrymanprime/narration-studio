// A keyboard shortcut past the chapter cards: the reader holds a prep control and a Record button per chapter, so reaching the side panel
// from the text settings took one press per control. It sits under the reader's header, is seen only while it has focus, and moves focus to
// the open tab of the side panel. Where the rail is a drawer (1280 px and below) and is closed, it opens the drawer, which takes focus itself.

import { Button } from '../../../primitives/Button';

/** The open tab of the side panel, or its first tab. */
function railTab(): HTMLElement | null {
  const rail = document.querySelector<HTMLElement>('[data-panel="rail"]');
  return rail?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ?? rail?.querySelector<HTMLElement>('[role="tab"]') ?? null;
}

export function SkipToRail({ onOpenRail }: { onOpenRail?: () => void }) {
  const skip = () => {
    const rail = document.querySelector<HTMLElement>('[data-panel="rail"]');
    // A closed drawer is `visibility: hidden`, so its tab cannot take focus until the drawer is open.
    if (rail && getComputedStyle(rail).visibility === 'hidden') onOpenRail?.();
    else railTab()?.focus();
  };
  return (
    // No height of its own, so the text does not move when it gains focus; its button is drawn over the top of the text.
    <div className="relative z-[var(--z-panel)] h-0">
      <Button
        variant="secondary"
        size="sm" // `not-sr-only` resets padding to 0, so the button's own padding is put back (XSC-35).
        className="sr-only focus:not-sr-only focus:absolute focus:top-1 focus:right-6 focus:px-3! focus:py-1!"
        onClick={skip}
      >
        Skip to the side panel
      </Button>
    </div>
  );
}
