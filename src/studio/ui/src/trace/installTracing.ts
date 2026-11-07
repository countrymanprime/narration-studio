import { overlay } from '../overlay/overlayService';
import type { NarrationApi } from '../types';
import { flushTrace, setTraceSink, trace, traceId } from '../api/tracing';

/**
 * Starts the page's side of the activity trace on the real host: the batch call, the window's error handlers (no message is read, only
 * that one happened and which kind), the overlay service (a dialog or a toast opening or closing, by kind) and a flush when the page is
 * hidden. Returns the function that stops it. Called once from main.tsx; the mock host does not trace.
 */
export function installTracing(api: Pick<NarrationApi, 'systemTraceBatch'>): () => void {
  setTraceSink(async (batch) => {
    await api.systemTraceBatch(batch);
  });
  const onError = () => trace('ui.error', { source: 'window_error' });
  const onRejection = () => trace('ui.error', { source: 'unhandled_rejection' });
  const onHidden = () => {
    if (document.visibilityState === 'hidden') void flushTrace();
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  document.addEventListener('visibilitychange', onHidden);

  let dialogs = new Set<number>();
  let toasts = new Set<number>();
  const unsubscribe = overlay.subscribe(() => {
    const snapshot = overlay.getSnapshot();
    const nextDialogs = new Set(snapshot.dialogs.map((entry) => entry.id));
    const nextToasts = new Set(snapshot.toasts.map((message) => message.id));
    for (const entry of snapshot.dialogs) if (!dialogs.has(entry.id)) trace('ui.overlay', { kind: 'dialog', action: 'open', id: traceId(entry.kind) });
    for (const id of dialogs) if (!nextDialogs.has(id)) trace('ui.overlay', { kind: 'dialog', action: 'close', id: 'dialog' });
    for (const message of snapshot.toasts)
      if (!toasts.has(message.id)) trace('ui.overlay', { kind: 'toast', action: 'open', id: message.tone === 'error' ? 'error' : 'info' });
    dialogs = nextDialogs;
    toasts = nextToasts;
  });
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    document.removeEventListener('visibilitychange', onHidden);
    unsubscribe();
    setTraceSink(undefined);
  };
}
