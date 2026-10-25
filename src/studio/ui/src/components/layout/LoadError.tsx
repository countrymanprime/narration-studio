import { useEffect, type MouseEvent } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRotate } from '@fortawesome/free-solid-svg-icons';
import { Button } from '../primitives/Button';
import { Heading } from '../primitives/Heading';
import { Panel } from '../primitives/Panel';
import { ARRIVE_CLASSES } from '../primitives/changeHighlight';
import { useOverlay } from '../../overlay/OverlayProvider';

/**
 * Retry swaps the error for the page's skeleton, so the button that was pressed unmounts and focus would fall to the document body, losing
 * the keyboard and screen-reader place. The page's `<main>` (the shell's focusable landmark) keeps it: the next Tab continues from the page
 * and the error that may come back is announced as the alert it is.
 */
function retryAndKeepFocus(retry: () => void) {
  return (event: MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.closest('main')?.focus({ preventScroll: true });
    retry();
  };
}

// The pages whose loaded title is `Heading size="hero"` (Heading: only Production draws it).
const HERO_TITLES: ReadonlySet<string> = new Set(['Production']);

/** A way off a failed page, for a page with no navigation around it (the Booth fills the window): its label and what it does. */
export type LoadErrorExit = { label: string; onClick: () => void };

/**
 * The panel of a failed read: the sentence as an alert and Retry. A page puts it under its own title (`LoadError`); a tab or section
 * inside a page that already has one uses it alone. It takes away an error toast that says the same sentence.
 */
export function LoadErrorPanel({ message, retry, exit }: { message: string; retry: () => void; exit?: LoadErrorExit }) {
  // The panel says the sentence in place, so an error toast saying the same one (raised by the page the narrator came from, which read the
  // same data) goes: the sentence is not said twice (alignment audit R3PF-4).
  const overlay = useOverlay();
  useEffect(() => {
    for (const toast of overlay.getSnapshot().toasts) if (toast.tone === 'error' && toast.text === message) overlay.dismissToast(toast.id);
  }, [overlay, message]);
  return (
    <Panel title="This page could not be loaded" className={ARRIVE_CLASSES}>
      <p role="alert" className="text-sm" style={{ color: 'var(--text-muted)' }}>
        {message}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" onClick={retryAndKeepFocus(retry)}>
          <FontAwesomeIcon icon={faRotate} />
          Retry
        </Button>
        {exit && (
          <Button variant="secondary" onClick={exit.onClick}>
            {exit.label}
          </Button>
        )}
      </div>
    </Panel>
  );
}

/**
 * What a page shows when the data it loads on opening could not be read (failure class "page data"): the page keeps its
 * title, says what happened in plain words and offers Retry, and the navigation around it keeps working. The technical text is
 * in the host log.
 */
export function LoadError({ title, message, retry, exit }: { title: string; message: string; retry: () => void; exit?: LoadErrorExit }) {
  return (
    // At the page gutter like the loaded page, so the title does not jump between the loading, failed and loaded frames (alignment audit cause J),
    // and at the loaded page's size: Production's title is the hero one (XPR2-42).
    <div className="max-w-3xl space-y-4">
      <Heading title={title} size={HERO_TITLES.has(title) ? 'hero' : 'page'} />
      <LoadErrorPanel message={message} retry={retry} exit={exit} />
    </div>
  );
}
