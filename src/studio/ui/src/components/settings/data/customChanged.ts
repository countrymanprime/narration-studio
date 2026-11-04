import { useEffect, useMemo, useState } from 'react';
import { useBrowserSettingsVersion } from '../../../browserSettings';
import { usePort } from '../../../ports/usePort';
import type { PortOf } from '../../../ports';
import type { DeliveryProfilesState } from '../../../types';
import { DELIVERY_PROFILES_CHANGED } from '../DeliveryProfilesPanel';
import { MW_KEY_CHANGED } from '../controls/mwKeyStatus';
import { useChapterSync } from '../../../hooks/useChapterSync';
import type { VoiceTracksState } from '../../../api/contracts/voiceTracks';
import { subscribeRateBasis } from '../../schedule/useEffectiveWph';
import { useTips } from '../../../tips/useFirstUseTip';
import { useVoiceSetup } from '../../engine/voiceLayout';
import { onEngineChanged } from './engineSignal';
import { BROWSER_CHANGED } from './browserValues';
import type { ReadSettings } from './values';

/** What a probe may look at: the ports it reads through, the fields the page already read, and the delivery profiles (read once per pass). */
export type ProbeContext = {
  api: PortOf<'system'> & PortOf<'dawChoice'> & PortOf<'deliveryProfiles'> & PortOf<'pronunciationOnline'> & PortOf<'production'>;
  settings: ReadSettings;
  delivery: () => Promise<DeliveryProfilesState>;
};

/**
 * A row with a custom body has no host field to compare with its default. It is listed here instead, with a probe that says whether the
 * value it edits differs from the default, readable without the body being on screen (the Changed filter lists rows of every category).
 * A row with a host field needs no entry; a row kept by this window is in `BROWSER_CHANGED`. `changedCoverage.test.ts` fails for a row that
 * is in none of the three and not in `CHANGED_EXEMPT`.
 */
export const CUSTOM_CHANGED: Readonly<Record<string, (context: ProbeContext) => Promise<boolean> | boolean>> = {
  // This computer: the window zoom is not 100%.
  'look.zoom': async ({ api }) => (await api.windowZoom()).level !== 1,
  // This computer: some command's keys were changed from the default.
  'keys.map': ({ settings }) => settings.global?.Keymap?.some((field) => field.isSet) === true,
  // This computer: a Merriam-Webster key is saved.
  'voice.mwKey': async ({ api }) => (await api.pronunciationOnlineKeyStatus()).present,
  // This computer: the narrator added a profile of their own.
  'delivery.custom': async ({ delivery }) => (await delivery()).profiles.some((profile) => !profile.builtIn),
  // This project: the schedule uses the narrator's own pace instead of the standard.
  'project.rateBasis': async ({ api }) => (await api.productionPlan()).rateBasis === 'own',
  // This project: it records with something other than REAPER, or has its own delivery profile.
  'daw.engine': async ({ api }) => {
    const { chosen } = await api.dawChoice();
    return chosen !== null && chosen !== 'REAPER';
  },
  'delivery.profile': async ({ delivery }) => {
    const state = await delivery();
    return state.hasProject && state.projectChoice !== null;
  },
};

/** What the app already holds live, shared with the pages: read without a call, so a change shows at once and never re-runs the probes. */
export type LiveContext = {
  /** The project's voice setup, the same value the Engine panel shows. */
  voiceSetup: VoiceTracksState;
  /** Chapter sync's consent as the host last said it, or undefined before the first answer. */
  syncConsent: string | undefined;
  /** The first-use tips dismissed, or null before the host has said. */
  tipsSeen: ReadonlySet<string> | null;
};

/** Rows whose value the app holds live (`LiveContext`): whether each differs from its default. */
export const LIVE_CHANGED: Readonly<Record<string, (context: LiveContext) => boolean>> = {
  // This project: chapters are voice folders instead of one flat track each.
  'daw.layout': ({ voiceSetup }) => voiceSetup.layout !== 'flat',
  // This project: the narrator turned Chapter sync off (on is what the app recommends, and what the first question offers).
  'daw.sync': ({ syncConsent }) => syncConsent === 'off',
  // This project: a character is chosen for the Narrator or assigned to a voice track.
  // This computer: some first-use tip was dismissed.
  'app.tips': ({ tipsSeen }) => (tipsSeen?.size ?? 0) > 0,
  'daw.voices': ({ voiceSetup }) => voiceSetup.narratorCharacter !== '' || voiceSetup.tracks.length > 0,
};

/** Why a row is not read: `report` shows what the tool says, `action` does something to project data, `unmarked-default` is a setting whose default the host does not mark. */
export type ExemptKind = 'report' | 'action' | 'unmarked-default';

/**
 * Rows with a custom body that Changed does not read. Each says which kind of exemption it is and the specific reason; a row leaves this list
 * when it gets a probe. `changedCoverage.test.ts` holds the list to this shape and to its current size, so it cannot grow silently.
 */
export const CHANGED_EXEMPT: Readonly<Record<string, { kind: ExemptKind; reason: string }>> = {
  'daw.capabilities': { kind: 'report', reason: 'A report of what the linked tool can do; nothing here is set.' },
  'daw.syncActivity': { kind: 'report', reason: 'A log of chapter syncs; nothing here is set.' },
  'delivery.default': {
    kind: 'unmarked-default',
    reason:
      'The host reports the chosen default profile but not which one ships as the default (deliveryprofile.Default() is not in the binding), and a component may not name a profile id.',
  },
  'project.manuscript': { kind: 'action', reason: 'The import and replace action for the manuscript, which is project data and not a setting.' },
  'project.bibleData': { kind: 'action', reason: 'Deletes Story Bible data; an action, not a setting.' },
  'project.data': { kind: 'action', reason: 'Deletes project data; an action, not a setting.' },
  'project.types': {
    kind: 'unmarked-default',
    reason: 'The default is the six types of the host’s guide.DefaultTypes(); the host marks none as added or changed and the UI holds no copy of the list.',
  },
  'project.marks': {
    kind: 'unmarked-default',
    reason:
      'The default is the six mark types of the host’s marks.DefaultTypes(); the host marks none as added or changed and the UI holds no copy of the list.',
  },
  'project.credits': {
    kind: 'unmarked-default',
    reason:
      'Scope both: the opening and closing credit templates, which the narrator owns (a shipped one may be edited or deleted), plus this project’s values; the host marks neither as differing from the shipped text.',
  },
};

/** Whether Changed can tell if this row differs from its default: a host field, a browser reader, a probe, or a stated exemption. */
export const changedIsCovered = (row: { id: string; field?: unknown }): boolean =>
  Boolean(row.field) || row.id in BROWSER_CHANGED || row.id in CUSTOM_CHANGED || row.id in LIVE_CHANGED || row.id in CHANGED_EXEMPT;

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean => a.size === b.size && [...a].every((id) => b.has(id));

/**
 * The ids of the custom rows whose value differs from the default, read again when the host's fields change, when a window-kept setting is
 * written (the zoom body announces its change too), and on the events the bodies already raise for the engine, the delivery profiles and the
 * Merriam-Webster key. A probe that fails counts as "not changed", so a host that cannot answer lists nothing wrongly. The set keeps its
 * identity when a pass finds the same ids. `usePort` answers the same object for the same api, so `api` below changes only with the api.
 */
export function useCustomChanged(settings: ReadSettings): ReadonlySet<string> {
  const system = usePort('system');
  const dawChoice = usePort('dawChoice');
  const delivery = usePort('deliveryProfiles');
  const pronunciation = usePort('pronunciationOnline');
  const production = usePort('production');
  const api = useMemo(
    () => ({ ...system, ...dawChoice, ...delivery, ...pronunciation, ...production }),
    [system, dawChoice, delivery, pronunciation, production],
  );
  const { setup: voiceSetup } = useVoiceSetup();
  const chapterSync = usePort('chapterSync');
  const syncConsent = useChapterSync(chapterSync)?.consent;
  const tipsSeen = useTips().seen;
  const version = useBrowserSettingsVersion();
  const [again, setAgain] = useState(0);
  const [changed, setChanged] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const bump = () => setAgain((n) => n + 1);
    const events = [DELIVERY_PROFILES_CHANGED, MW_KEY_CHANGED];
    for (const name of events) window.addEventListener(name, bump);
    const stop = onEngineChanged(bump);
    const stopBasis = subscribeRateBasis(bump);
    return () => {
      for (const name of events) window.removeEventListener(name, bump);
      stop();
      stopBasis();
    };
  }, []);

  useEffect(() => {
    let current = true;
    let profiles: Promise<DeliveryProfilesState> | undefined;
    const readDelivery = () => (profiles ??= api.deliveryProfiles());
    void Promise.all(
      Object.entries(CUSTOM_CHANGED).map(async ([id, probe]) => {
        try {
          return (await probe({ api, settings, delivery: readDelivery })) ? id : undefined;
        } catch {
          return undefined;
        }
      }),
    ).then((ids) => {
      if (!current) return;
      const next = new Set(ids.filter((id): id is string => id !== undefined));
      setChanged((previous) => (sameSet(previous, next) ? previous : next));
    });
    return () => {
      current = false;
    };
  }, [api, settings, version, again]);

  const live = useMemo(
    () => new Set(Object.entries(LIVE_CHANGED).flatMap(([id, differs]) => (differs({ voiceSetup, syncConsent, tipsSeen }) ? [id] : []))),
    [voiceSetup, syncConsent, tipsSeen],
  );
  return useMemo(() => (live.size === 0 ? changed : new Set([...changed, ...live])), [changed, live]);
}
