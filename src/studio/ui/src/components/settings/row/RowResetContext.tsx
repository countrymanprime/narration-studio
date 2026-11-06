import { createContext, useContext } from 'react';
import type { RowReset } from '../data/rowResets';

/** What the page knows how to put back for a row with no host field (`useRowResets`), so a changed row can offer its own Reset. */
export const RowResetContext = createContext<Readonly<Record<string, RowReset>>>({});

export const useRowReset = (id: string): RowReset | undefined => useContext(RowResetContext)[id];
