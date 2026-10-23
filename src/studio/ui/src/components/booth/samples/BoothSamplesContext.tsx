import { createContext, useContext } from 'react';
import type { BoothSamples } from './useBoothSamples';

const BoothSamplesContext = createContext<BoothSamples | null>(null);

/** Gives the Booth's speaker picker and side panel the page's voice samples, so they are not drilled through the reading text. */
export const BoothSamplesProvider = BoothSamplesContext.Provider;

/** The page's voice samples, or null where there are none to show (a story, a test, a page that has not provided them): then nothing is drawn for them. */
export function useBoothSamplesContext(): BoothSamples | null {
  return useContext(BoothSamplesContext);
}
