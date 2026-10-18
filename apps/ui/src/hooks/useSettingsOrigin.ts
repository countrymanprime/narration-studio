import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Where the narrator was when a link or Ctrl+, brought them to Settings, so the page can offer "Back to <page>". Arriving by the navigation
 * rail is not a link (the rail has its own Back), so only a deep link (`/settings#credits`) or `markLink()` before the move counts.
 */
export function useSettingsOrigin(): { origin: string | undefined; markLink: () => void } {
  const location = useLocation();
  const lastPage = useRef<string>('/');
  const linked = useRef(false);
  const [origin, setOrigin] = useState<string>();

  useEffect(() => {
    if (location.pathname !== '/settings') {
      lastPage.current = `${location.pathname}${location.search}`;
      setOrigin(undefined);
      return;
    }
    if (linked.current || location.hash !== '') setOrigin((current) => current ?? lastPage.current);
    linked.current = false;
  }, [location.key, location.pathname, location.search, location.hash]);

  const markLink = useCallback(() => {
    linked.current = true;
  }, []);
  return { origin, markLink };
}
