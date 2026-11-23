import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { addressWithoutProject, isOtherProject } from '../pageBoundaryKey';

/**
 * Where the narrator was when a link or Ctrl+, brought them to Settings, so the page can offer "Back to <page>". Arriving by the navigation
 * rail is not a link (the rail has its own Back), so only a deep link (`/settings#credits`) or `markLink()` before the move counts.
 * The origin names a chapter of the project it was recorded under (`/booth?chapter=chapter-9`); after a project change it is the bare page (#4059).
 */
export function useSettingsOrigin(project?: string): { origin: string | undefined; markLink: () => void } {
  const location = useLocation();
  // Read when the address changes, not when the project does: the address in front of a project change is still the old project's until it is cut back.
  const projectNow = useRef(project);
  projectNow.current = project;
  const lastPage = useRef<Origin>({ to: '/', bare: '/', project });
  const linked = useRef(false);
  const [kept, setOrigin] = useState<Origin>();

  useEffect(() => {
    if (location.pathname !== '/settings') {
      lastPage.current = {
        to: `${location.pathname}${location.search}`,
        bare: addressWithoutProject({ pathname: location.pathname, search: location.search, hash: '' }).pathname,
        project: projectNow.current,
      };
      setOrigin(undefined);
      return;
    }
    if (linked.current || location.hash !== '') setOrigin((current) => current ?? lastPage.current);
    linked.current = false;
  }, [location.key, location.pathname, location.search, location.hash]);

  // The project is learned with the bootstrap, after the first address: an origin recorded before it is the project's that answers.
  useEffect(() => {
    if (project === undefined) return;
    if (lastPage.current.project === undefined) lastPage.current = { ...lastPage.current, project };
    setOrigin((current) => (current && current.project === undefined ? { ...current, project } : current));
  }, [project]);

  const markLink = useCallback(() => {
    linked.current = true;
  }, []);
  const origin = kept && (isOtherProject(kept.project, project) ? kept.bare : kept.to);
  return { origin, markLink };
}

type Origin = { to: string; bare: string; project: string | undefined };
