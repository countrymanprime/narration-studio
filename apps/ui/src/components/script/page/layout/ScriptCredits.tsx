// The credits as the old Script page drew them (D22: no equivalent in the mock, so re-homed unchanged): the setup banner, then the
// Opening and Closing credits cards with their previews, open by default and remembered per project, and their Fill in and Record in
// Booth. They sit above the first chapter's card in the reader. The setup dialog is the page's (`ScriptPage.tsx`), so it outlives the
// banner that opened it. A `#credits-opening` or `#credits-closing` link (Home's credits rows) opens and shows that card.

import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CreditsSetupBanner } from '../../../credits/CreditsSetupBanner';
import type { CreditsKind } from '../../../booth/readerModel';
import { CreditsEntry } from '../../../manuscript/CreditsEntry';
import { loadCreditsExpanded, saveCreditsExpanded, type CreditsExpanded } from '../../../manuscript/creditsExpandedStorage';
import type { Notify } from '../../../primitives/Toast';
import type { ScriptCredits as Credits } from '../../scriptPageHost';

/** The old reader's medium text size, which the credits rows follow. */
const CREDITS_TEXT = 'text-base leading-6 [--hl-pad-y:0.09em]';

export function ScriptCredits({
  credits,
  projectFolder,
  notify,
  fillingIn,
  onFillIn,
  goToBooth,
}: {
  credits: Credits;
  projectFolder: string;
  notify: Notify;
  /** The setup dialog is open: the banner steps aside. */
  fillingIn: boolean;
  onFillIn: () => void;
  goToBooth?: (target: { credits: CreditsKind }) => void;
}) {
  const { hash } = useLocation();
  const navigate = useNavigate();
  const [expanded, setExpandedState] = useState<CreditsExpanded>(() => loadCreditsExpanded(projectFolder));
  const setExpanded = useCallback(
    (next: (current: CreditsExpanded) => CreditsExpanded) =>
      setExpandedState((current) => {
        const resolved = next(current);
        saveCreditsExpanded(projectFolder, resolved);
        return resolved;
      }),
    [projectFolder],
  );

  useEffect(() => {
    if (hash !== '#credits-opening' && hash !== '#credits-closing') return;
    const kind = hash === '#credits-opening' ? 'opening' : 'closing';
    setExpanded((current) => ({ ...current, [kind]: true }));
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-credits-entry="${kind}"]`)?.scrollIntoView?.({ block: 'start' }));
    // Taken off the address once read, as the chapter and paragraph links are (`useDeepLink.ts`), so the same link works again.
    navigate('/script', { replace: true });
  }, [hash, setExpanded, navigate]);

  const { setup, setSetup, previews } = credits;
  const fillIn = setup ? onFillIn : undefined;
  const card = (kind: CreditsKind) => (
    <CreditsEntry
      kind={kind}
      preview={previews[kind]}
      expanded={expanded[kind]}
      onToggle={() => setExpanded((current) => ({ ...current, [kind]: !current[kind] }))}
      textClass={CREDITS_TEXT}
      onFillIn={fillIn}
      onRecordInBooth={goToBooth && (() => goToBooth({ credits: kind }))}
    />
  );
  if (!setup?.banner && !credits.hasOpening && !credits.hasClosing) return null;
  return (
    <div data-script-credits="" className="flex flex-col gap-3 py-3 font-sans">
      {setup?.banner && !fillingIn && <CreditsSetupBanner state={setup} notify={notify} onDone={setSetup} onFillIn={onFillIn} />}
      {credits.hasOpening && card('opening')}
      {credits.hasClosing && card('closing')}
    </div>
  );
}
