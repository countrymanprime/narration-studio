// The providers the select tools read the host through, over the browser mock, for their tests and stories.
import { type ReactNode } from 'react';
import { ApiProvider } from '../../../../../api/ApiContext';
import type { NarrationApi } from '../../../../../types';
import { StudioProvider } from '../../../../../studio/StudioProvider';
import { TooltipProvider } from '../../../../primitives/Tooltip';
import { useScriptView } from '../../data/useScriptData';
import type { ScriptViewState } from '../../data/scriptView';

export let view: ScriptViewState;

/** Keeps the page's view state in `view` for a test to read. */
function ViewProbe() {
  [view] = useScriptView((state) => state);
  return null;
}

export function Host({ api, children }: { api: NarrationApi; children: ReactNode }) {
  return (
    <ApiProvider api={api}>
      <StudioProvider>
        <TooltipProvider>
          <ViewProbe />
          {children}
        </TooltipProvider>
      </StudioProvider>
    </ApiProvider>
  );
}
