import { createContext, useContext, type ReactNode } from 'react';
import { OverlayHost } from './OverlayHost';
import { overlay, type OverlayService } from './overlayService';

const OverlayContext = createContext<OverlayService>(overlay);

/** The service a component reaches through context, for a test or story that wants its own. Renders the host after its children. */
export function OverlayProvider({ service = overlay, children }: { service?: OverlayService; children?: ReactNode }) {
  return (
    <OverlayContext.Provider value={service}>
      {children}
      <OverlayHost service={service} />
    </OverlayContext.Provider>
  );
}

export const useOverlay = (): OverlayService => useContext(OverlayContext);
