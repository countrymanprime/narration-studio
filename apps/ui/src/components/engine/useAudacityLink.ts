import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudacityLink } from '../../api/contracts/daw';
import { apiErrorMessage } from '../../api/errorMessage';
import { usePort } from '../../ports/usePort';

export type AudacityLinkView = {
  /** The host's last answer; undefined until the first read, or when it failed. */
  link?: AudacityLink;
  /** Why the state could not be read, in a sentence. */
  error?: string;
  /** When the answer arrived: the clock "last heard N s ago" counts from, so a quiet host shows its age instead of a stale fact. */
  receivedAt?: number;
  /** Asks Audacity now (the Check again button) and resolves once the answer is in. */
  check: () => Promise<void>;
  /** Adopts an answer a binding returned (a link or an unlink), without another read. */
  adopt: (next: AudacityLink) => void;
};

/**
 * The Audacity link state: read once on mount, pushed by the host's audacity_link_changed event, and read again when the window gets focus
 * back. The host asks Audacity every 2 s while the project records with it; nothing here polls. A project that does not record with
 * Audacity answers `chosen: false` and nothing else is read from Audacity.
 */
export function useAudacityLink(): AudacityLinkView {
  const port = usePort('audacityLink');
  const [link, setLink] = useState<AudacityLink>();
  const [error, setError] = useState<string>();
  const [receivedAt, setReceivedAt] = useState<number>();
  const live = useRef(true);

  const adopt = useCallback((next: AudacityLink) => {
    if (!live.current) return;
    setLink(next);
    setError(undefined);
    setReceivedAt(Date.now());
  }, []);
  const fail = useCallback((failure: unknown) => {
    if (live.current) setError(`How Audacity is doing could not be read: ${apiErrorMessage(failure)}`);
  }, []);

  const read = useCallback(() => port.audacityLink().then(adopt, fail), [port, adopt, fail]);
  const check = useCallback(() => port.audacityLinkCheck().then(adopt, fail), [port, adopt, fail]);

  useEffect(() => {
    live.current = true;
    void read();
    const unsubscribe = port.subscribeAudacityLink(adopt);
    const onFocus = () => void read();
    window.addEventListener('focus', onFocus);
    return () => {
      live.current = false;
      unsubscribe();
      window.removeEventListener('focus', onFocus);
    };
  }, [port, read, adopt]);

  return { link, error, receivedAt, check, adopt };
}
