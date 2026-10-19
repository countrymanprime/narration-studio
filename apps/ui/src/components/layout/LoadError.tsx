import type { MouseEvent } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRotate } from '@fortawesome/free-solid-svg-icons';
import { Button } from '../primitives/Button';
import { Heading } from '../primitives/Heading';
import { Panel } from '../primitives/Panel';
import { ARRIVE_CLASSES } from '../primitives/changeHighlight';

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

/**
 * The panel of a failed read: the sentence as an alert and Retry. A page puts it under its own title (`LoadError`); a tab or section
 * inside a page that already has one uses it alone.
 */
export function LoadErrorPanel({ message, retry }: { message: string; retry: () => void }) {
  return (
    <Panel title="This page could not be loaded" className={ARRIVE_CLASSES}>
      <p role="alert" className="text-sm" style={{ color: 'var(--text-muted)' }}>
        {message}
      </p>
      <Button variant="primary" className="mt-4" onClick={retryAndKeepFocus(retry)}>
        <FontAwesomeIcon icon={faRotate} />
        Retry
      </Button>
    </Panel>
  );
}

/**
 * What a page shows when the data it loads on opening could not be read (failure class "page data"): the page keeps its
 * title, says what happened in plain words and offers Retry, and the navigation around it keeps working. The technical text is
 * in the host log.
 */
export function LoadError({ title, message, retry }: { title: string; message: string; retry: () => void }) {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <Heading title={title} />
      <LoadErrorPanel message={message} retry={retry} />
    </div>
  );
}
