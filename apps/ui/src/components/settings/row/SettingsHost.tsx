import { createContext, useContext } from 'react';
import type { Bootstrap } from '../../../types';
import type { Notify } from '../../primitives/Toast';

/** What the app hands the page that the settings controls beyond plain fields need: the shared state, the toast, and the app-level actions. */
export type SettingsHost = {
  data: Bootstrap;
  notify: Notify;
  /** The shared "link a REAPER project file" action. */
  onLinkDawFile: () => void;
  /** Clear derived data ended: the app reads its state again and goes to the start. */
  onProjectDataCleared: () => Promise<void>;
  /** Re-reads the shared application state after an import commits. */
  refreshBootstrap: () => Promise<void>;
  /** Navigates the app through its leave guard. */
  go: (path: string) => void;
};

const Context = createContext<SettingsHost | undefined>(undefined);

export const SettingsHostProvider = Context.Provider;

export function useSettingsHost(): SettingsHost {
  const value = useContext(Context);
  if (!value) throw new Error('useSettingsHost needs a SettingsHostProvider');
  return value;
}
