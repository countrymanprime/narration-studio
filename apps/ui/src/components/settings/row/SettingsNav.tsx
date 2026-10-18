import { createContext, useContext } from 'react';
import type { CategoryId } from '../registry/types';

/** What a row can ask the page to do: go to another page of the app (through the leave guard), or show another category here. */
export type SettingsNav = {
  go: (path: string) => void;
  showCategory: (id: CategoryId) => void;
};

const Context = createContext<SettingsNav>({ go: () => {}, showCategory: () => {} });

export const SettingsNavProvider = Context.Provider;
export const useSettingsNav = (): SettingsNav => useContext(Context);
