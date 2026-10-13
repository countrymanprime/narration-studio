import { useSyncExternalStore } from 'react';
import { ConfirmDialog } from '../components/primitives/ConfirmDialog';
import { Dialog } from '../components/primitives/Dialog';
import { SlideOver } from '../components/primitives/SlideOver';
import { ToastRegion } from '../components/primitives/Toast';
import { overlay, type DialogEntry, type OverlayService } from './overlayService';

function Layer({ entry }: { entry: DialogEntry }) {
  if (entry.kind === 'confirm') {
    const { title, body, confirmLabel, confirmVariant } = entry.spec;
    return (
      <ConfirmDialog
        title={title}
        body={body}
        confirmLabel={confirmLabel}
        confirmVariant={confirmVariant}
        confirm={() => entry.answer(true)}
        cancel={() => entry.answer(false)}
      />
    );
  }
  const { title, render, headerless, dismissOnOutsidePress } = entry.spec;
  const content = render({ close: entry.close });
  if (entry.kind === 'slideOver')
    return (
      <SlideOver open title={title} onClose={entry.close}>
        {content}
      </SlideOver>
    );
  return (
    <Dialog title={title} headerless={headerless} dismissOnOutsidePress={dismissOnOutsidePress} onClose={entry.close} actions={null}>
      {content}
    </Dialog>
  );
}

/**
 * Draws what the service holds in the existing primitives. Mount it once, at the root. The live region for `announce` is rendered here
 * with `aria-live`, outside any dialog, so Base UI keeps it audible while a modal hides the rest of the page (ADR 0048).
 */
export function OverlayHost({ service = overlay }: { service?: OverlayService }) {
  const { dialogs, toasts, announcement } = useSyncExternalStore(service.subscribe, service.getSnapshot);
  return (
    <>
      {dialogs.map((entry) => (
        <Layer key={entry.id} entry={entry} />
      ))}
      <ToastRegion messages={toasts} dismiss={service.dismissToast} />
      <div data-overlay-announcer role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
    </>
  );
}
