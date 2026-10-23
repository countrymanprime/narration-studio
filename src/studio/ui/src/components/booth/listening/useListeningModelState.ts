import { useEffect, useState } from 'react';
import { usePort } from '../../../ports/usePort';

type ListeningModelState = 'installed' | 'missing' | 'unknown';

/**
 * Whether the speech model the Booth listens with is on this computer, from the download catalog (which reads manifests only, so it is
 * quick), so the footer can say so before Record is pressed and not only after a start finds it gone. `unknown` while the catalog is
 * unread, when it fails, or when it does not list this engine's model: nothing is claimed then. `again` is any value that changes when it
 * should be read again (a download finished, the window came back).
 */
export function useListeningModelState(engine: string, model: string, again: unknown): ListeningModelState {
  const assets = usePort('assets');
  const [state, setState] = useState<ListeningModelState>('unknown');
  // The model can be downloaded or removed in Settings while the Booth is behind it: read again when the window is looked at.
  const [looked, setLooked] = useState(0);
  useEffect(() => {
    const look = () => setLooked((n) => n + 1);
    window.addEventListener('focus', look);
    return () => window.removeEventListener('focus', look);
  }, []);
  useEffect(() => {
    let live = true;
    assets
      .assetsList()
      .then((catalog) => {
        if (!live) return;
        const asset = catalog.assets.find((item) => item.kind === engine && item.id === model);
        setState(!asset ? 'unknown' : asset.installState === 'installed' ? 'installed' : 'missing');
      })
      .catch(() => live && setState('unknown'));
    return () => {
      live = false;
    };
  }, [assets, engine, model, again, looked]);
  return state;
}
