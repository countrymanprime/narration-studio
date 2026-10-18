import { Drawer } from '@base-ui/react/drawer';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { useEffect, type ReactNode } from 'react';
import { useReturnFocusTarget } from './focusReturn';
import { IconButton } from './IconButton';

// The navigation drawer of the narrow layout (AppShell's hamburger), on Base UI's Drawer: a modal panel
// from the left edge with the app's scrim, so the page behind is hidden and unreachable, Tab loops inside, Escape, the
// scrim and the Close button close it, and focus returns to the menu button. It was inline markup in AppShell with none of
// that. The suite captures no phone viewport but the Settings states at 390 px, where the drawer only opens to navigate, so the atlas stories are its visual record.
export function NavDrawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const finalFocus = useReturnFocusTarget(open);
  // The drawer exists only in the narrow layout (below 860 px, 53.75rem: where the mock's rail turns into a tab bar). If the window grows past it while the drawer
  // is open, close it: the desktop navigation is already on screen and the menu button that opened it is gone.
  useEffect(() => {
    if (!open || typeof window.matchMedia !== 'function') return;
    const wide = window.matchMedia('(min-width: 53.75rem)');
    const closeWhenWide = () => {
      if (wide.matches) onClose();
    };
    wide.addEventListener('change', closeWhenWide);
    return () => wide.removeEventListener('change', closeWhenWide);
  }, [open, onClose]);
  return (
    <Drawer.Root
      open={open}
      modal
      swipeDirection="left"
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Drawer.Portal>
        <Drawer.Backdrop
          data-nav-drawer-backdrop
          className="fixed inset-0 z-[var(--z-dialog)] bg-[var(--backdrop)] data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-ok:transition-opacity motion-ok:duration-(--motion-base) motion-ok:ease-(--ease-enter)"
        />
        <Drawer.Viewport className="fixed inset-0 z-[var(--z-dialog)] flex items-stretch justify-start">
          <Drawer.Popup
            finalFocus={finalFocus}
            className="relative flex h-full w-[min(17rem,86vw)] [transform:translateX(var(--drawer-swipe-movement-x,0px))] flex-col overflow-y-auto bg-[var(--surface)] shadow-[var(--shadow-lg)] outline-none data-[ending-style]:[transform:translateX(-100%)] data-[starting-style]:[transform:translateX(-100%)] data-[swiping]:duration-0 motion-ok:transition-transform motion-ok:duration-(--motion-base) motion-ok:ease-(--ease-enter)"
          >
            <Drawer.Title className="sr-only">Navigation</Drawer.Title>
            <IconButton label="Close navigation" onClick={onClose} className="absolute top-3 right-3">
              <FontAwesomeIcon icon={faXmark} />
            </IconButton>
            {children}
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
