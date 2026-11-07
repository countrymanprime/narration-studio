import { createContext, useContext } from 'react';

/**
 * Whether the project has a DAW project file linked, from App (the bootstrap's `dawFileLinked`): REAPER takes markers only into a linked file. Read by the
 * Add marker button on every page (#2830), so "Link a REAPER project (.rpp) file to add markers." is one answer, not each page's own check. `undefined`
 * (no provider: a component test, a story) is "not known", which blocks nothing.
 */
export const DawFileLinkedContext = createContext<boolean | undefined>(undefined);

export const useDawFileLinked = (): boolean | undefined => useContext(DawFileLinkedContext);
