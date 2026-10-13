// The credits as the old Script page drew them (D22: no equivalent in the mock, so re-homed unchanged): the setup banner, then the
// Opening and Closing credits cards with their previews, open by default and remembered per project, and their Fill in and Record in
// Booth. The page draws this twice: the banner and the Opening card above the first chapter's card, and the Closing card after the last
// chapter's text, where the mock's chapter list puts them (`chapters/creditsRows.ts`). The setup dialog is the page's (`ScriptPage.tsx`),
// so it outlives the banner that opened it. A `#credits-opening` or `#credits-closing` link (Home's credits rows) opens and shows that card.

import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CreditsSetupBanner } from '../../../credits/CreditsSetupBanner';
import type { CreditsKind } from '../../../booth/readerModel';
import { CreditsEntry } from '../../../manuscript/CreditsEntry';
import { loadCreditsExpanded, saveCreditsExpanded } from '../../../manuscript/creditsExpandedStorage';
import type { Notify } from '../../../primitives/Toast';
import type { ScriptCredits as Credits } from '../../scriptPageHost';

/** The old reader's medium text size, which the credits rows follow. */
const CREDITS_TEXT = 'text-base leading-6 [--hl-pad-y:0.09em]';

export function ScriptCredits({
  kind,
  credits,
  projectFolder,
  notify,
  fillingIn,
  onFillIn,
  goToBooth,
}: {
  /** Which end of the book: `opening` draws the setup banner and the Opening card, `closing` the Closing card. */
  kind: CreditsKind;
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
  const [expanded, setExpandedState] = useState(() => loadCreditsExpanded(projectFolder)[kind]);
  // The other card keeps its own open state in the same stored pair, so a save writes this card's half over what is stored.
  const setExpanded = useCallback(
    (open: boolean) => {
      setExpandedState(open);
      saveCreditsExpanded(projectFolder, { ...loadCreditsExpanded(projectFolder), [kind]: open });
    },
    [projectFolder, kind],
  );

  useEffect(() => {
    if (hash !== `#credits-${kind}`) return;
    setExpanded(true);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-credits-entry="${kind}"]`)?.scrollIntoView?.({ block: 'start' }));
    // Taken off the address once read, as the chapter and paragraph links are (`useDeepLink.ts`), so the same link works again.
    navigate('/script', { replace: true });
  }, [hash, kind, setExpanded, navigate]);

  const { setup, setSetup, previews } = credits;
  const has = kind === 'opening' ? credits.hasOpening : credits.hasClosing;
  const banner = kind === 'opening' && setup?.banner;
  if (!banner && !has) return null;
  return (
    <div data-script-credits={kind} className="flex flex-col gap-3 py-3 font-sans">
      {banner && !fillingIn && <CreditsSetupBanner state={setup} notify={notify} onDone={setSetup} onFillIn={onFillIn} />}
      {has && (
        <CreditsEntry
          kind={kind}
          preview={previews[kind]}
          expanded={expanded}
          onToggle={() => setExpanded(!expanded)}
          textClass={CREDITS_TEXT}
          onFillIn={setup ? onFillIn : undefined}
          onRecordInBooth={goToBooth && (() => goToBooth({ credits: kind }))}
        />
      )}
    </div>
  );
}
