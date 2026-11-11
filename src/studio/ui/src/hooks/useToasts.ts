import { logUi } from '../api/uiLog';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { useCallback } from 'react';
import { overlay as appOverlay, type OverlayService } from '../overlay/overlayService';
import type { Notify, ToastAction, ToastTone } from '../components/primitives/Toast';

/**
 * The app's `notify`: a message goes to the overlay service, whose host draws the one toast region, so no second region draws it.
 * `notify` keeps its identity for the life of the app, so a page effect that lists it never re-runs.
 */
export function useToasts(service: OverlayService = appOverlay): { notify: Notify } {
  const notify = useCallback(
    (text: string, tone: ToastTone = 'info', action?: ToastAction, icon?: IconDefinition, durationMs?: number, topic?: string) => {
      if (!text) return;
      logUi(`ui.toast.${tone}`, text);
      service.toast(text, { tone, action, icon, durationMs, topic });
    },
    [service],
  );
  return { notify };
}
