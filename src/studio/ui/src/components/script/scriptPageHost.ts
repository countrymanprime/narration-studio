// What the Studio Next Script page (`page/ScriptPage.tsx`) reads from the host beyond its data layer (`page/data/`): the credits cards'
// templates, previews, setup state and retail sample (re-homed unchanged from the old page, D22), the Words tab's host (`WordsHost`) and
// the Define marks dialog's save. No file under `page/` names a port (`page/data/noHostCalls.test.ts`), and `page/data/` is the earlier
// slices', so these hooks sit beside the page as `usePronunciationSources` sits beside the Story Bible tab.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CreditsRenderResult, CreditsSetupState, CreditTemplate, RetailSample } from '../../api/contracts/credits';
import type { MarkType } from '../../api/contracts/marks';
import { apiErrorMessage } from '../../api/errorMessage';
import { overlay } from '../../overlay/overlayService';
import { usePort } from '../../ports/usePort';
import { definitionSourceOf, definitionSourceSchema } from '../../api/schemas/settings';
import type { DefinitionSource, WordsHost } from './page/rail/words/wordsHost';

export type ScriptCredits = {
  /** The first opening and the first closing template's preview; absent when the library has no template of that kind. */
  previews: { opening?: CreditsRenderResult; closing?: CreditsRenderResult };
  hasOpening: boolean;
  hasClosing: boolean;
  /** Whether to show the setup banner and what the dialog asks; undefined until read, or when the read failed. */
  setup: CreditsSetupState | undefined;
  setSetup: (next: CreditsSetupState) => void;
  retailSample: RetailSample | null;
};

/**
 * The credits cards' reads, as the old Script page made them: secondary reads, so a failure leaves the cards or the sample marker out
 * rather than blocking the manuscript. The previews are read again after the setup dialog saves.
 */
export function useScriptCredits(): ScriptCredits {
  const credits = usePort('credits');
  const [templates, setTemplates] = useState<CreditTemplate[]>([]);
  const [previews, setPreviews] = useState<ScriptCredits['previews']>({});
  const [setup, setSetupState] = useState<CreditsSetupState>();
  const [retailSample, setRetailSample] = useState<RetailSample | null>(null);
  const [round, setRound] = useState(0);

  useEffect(() => {
    let live = true;
    credits.creditsTemplates().then(
      (list) => live && setTemplates(list),
      () => live && setTemplates([]),
    );
    credits.creditsRetailSample().then(
      (answer) => live && setRetailSample(answer.sample),
      () => live && setRetailSample(null),
    );
    credits.creditsSetupState().then(
      (state) => live && setSetupState(state),
      () => live && setSetupState(undefined),
    );
    return () => {
      live = false;
    };
  }, [credits]);

  const opening = templates.find((template) => template.kind === 'opening');
  const closing = templates.find((template) => template.kind === 'closing');
  useEffect(() => {
    let live = true;
    void Promise.all([
      opening ? credits.creditsPreview(opening.body).catch(() => undefined) : undefined,
      closing ? credits.creditsPreview(closing.body).catch(() => undefined) : undefined,
    ]).then(([openingPreview, closingPreview]) => live && setPreviews({ opening: openingPreview, closing: closingPreview }));
    return () => {
      live = false;
    };
  }, [credits, opening, closing, round]);

  const setSetup = useCallback((next: CreditsSetupState) => {
    setSetupState(next);
    setRound((n) => n + 1);
  }, []);

  return { previews, hasOpening: opening !== undefined, hasClosing: closing !== undefined, setup, setSetup, retailSample };
}

const DEFINITION_TOOL = 'Script';
const DEFINITION_KEY = 'definition_source';
/** Where the definition source was kept per viewer before it became a host setting: read once, moved to the host, then removed. */
const LEGACY_DEFINITION_SOURCE_KEY = 'narration.script.definitions';

function legacyDefinitionSource(): DefinitionSource | undefined {
  try {
    const parsed = definitionSourceSchema.safeParse(window.localStorage.getItem(LEGACY_DEFINITION_SOURCE_KEY));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function forgetLegacyDefinitionSource() {
  try {
    window.localStorage.removeItem(LEGACY_DEFINITION_SOURCE_KEY);
  } catch {
    // Storage that cannot be reached cannot be read either, so the key is never moved twice.
  }
}

/**
 * The definition source as the host holds it (Script.definition_source), so a choice made in Settings shows here and one made here shows
 * there. It is read on mount and whenever the window comes back into focus. A source this viewer kept in localStorage before is written to
 * the host once, when the host holds none; the key is removed once the host holds a source, so a failed write is tried again next time.
 */
function useDefinitionSource(): [DefinitionSource, (source: DefinitionSource) => void] {
  const system = usePort('system');
  const [source, setSource] = useState<DefinitionSource>('web');
  const shown = useRef<DefinitionSource>('web');
  // Each read and each choice takes a turn; a read that answers after a newer turn is dropped.
  const turn = useRef(0);
  const show = useCallback((next: DefinitionSource) => {
    shown.current = next;
    setSource(next);
  }, []);

  useEffect(() => {
    const read = async () => {
      const mine = ++turn.current;
      try {
        const settings = await system.settingsForScope('global');
        const held = settings.Script?.some((field) => field.key === DEFINITION_KEY && field.isSet) ?? false;
        const legacy = legacyDefinitionSource();
        if (legacy && !held) {
          await system.saveSettings(DEFINITION_TOOL, 'global', { [DEFINITION_KEY]: legacy });
          forgetLegacyDefinitionSource();
          if (mine === turn.current) show(legacy);
          return;
        }
        if (held) forgetLegacyDefinitionSource();
        if (mine === turn.current) show(definitionSourceOf(settings));
      } catch {
        // The menu keeps what it shows, and the next focus reads again.
      }
    };
    void read();
    const onFocus = () => void read();
    window.addEventListener('focus', onFocus);
    return () => {
      turn.current += 1;
      window.removeEventListener('focus', onFocus);
    };
  }, [system, show]);

  const choose = useCallback(
    (next: DefinitionSource) => {
      const before = shown.current;
      const mine = ++turn.current;
      show(next);
      system.saveSettings(DEFINITION_TOOL, 'global', { [DEFINITION_KEY]: next }).catch((error: unknown) => {
        if (mine === turn.current) show(before);
        overlay.toast(`The definition source could not be saved: ${apiErrorMessage(error)}`, { tone: 'error' });
      });
    },
    [system, show],
  );
  return [source, choose];
}

/** The Words tab's host: the narrator's definition source (a host setting), a source's candidate, the online entry and the web look-ups. */
export function useWordsHost(): WordsHost {
  const sources = usePort('pronunciationSources');
  const online = usePort('pronunciationOnline');
  const lookup = usePort('pronunciationLookup');
  const [definitionSource, setDefinitionSource] = useDefinitionSource();
  return useMemo(
    () => ({
      definitionSource,
      setDefinitionSource,
      // The tab reads a miss as a result (`WordsHost.candidate`), so a refused call becomes one with the host's sentence.
      candidate: (word, sourceId) =>
        sources.pronunciationCandidate(word, sourceId).catch((error: unknown) => ({ ok: false as const, reason: apiErrorMessage(error) })),
      onlineDefinition: (word) => online.pronunciationOnlineLookup(word),
      async openLookup(source, word) {
        try {
          await lookup.pronunciationLookupOpen(source, word);
        } catch (error) {
          overlay.toast(apiErrorMessage(error), { tone: 'error' });
        }
      },
    }),
    [definitionSource, setDefinitionSource, sources, online, lookup],
  );
}

/** The Define marks dialog's save: the host answers the types as it now has them, and the page's marks are read again. Null when refused. */
export function useSaveMarkTypes(reload: () => void): (types: MarkType[], removeUses: boolean) => Promise<MarkType[] | null> {
  const marks = usePort('marks');
  return useCallback(
    async (types, removeUses) => {
      try {
        const answer = await marks.marksSaveTypes(types, removeUses);
        reload();
        return answer.types;
      } catch (error) {
        overlay.toast(apiErrorMessage(error), { tone: 'error' });
        return null;
      }
    },
    [marks, reload],
  );
}
