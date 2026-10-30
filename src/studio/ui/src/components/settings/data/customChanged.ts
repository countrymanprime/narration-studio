import { useEffect, useMemo, useState } from 'react';
import { useBrowserSettingsVersion } from '../../../browserSettings';
import { usePort } from '../../../ports/usePort';
import type { PortOf } from '../../../ports';
import { DELIVERY_PROFILES_CHANGED } from '../DeliveryProfilesPanel';
import { MW_KEY_CHANGED } from '../controls/mwKeyStatus';
import { onEngineChanged } from './engineSignal';
import { BROWSER_CHANGED } from './browserValues';
import type { ReadSettings } from './values';

/** What a probe may look at: the ports it reads through and the fields the page already read. */
export type ProbeContext = {
  api: PortOf<'system'> & PortOf<'dawChoice'> & PortOf<'deliveryProfiles'> & PortOf<'pronunciationOnline'>;
  settings: ReadSettings;
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
  'delivery.custom': async ({ api }) => (await api.deliveryProfiles()).profiles.some((profile) => !profile.builtIn),
  // This project: it records with something other than REAPER, or has its own delivery profile.
  'daw.engine': async ({ api }) => {
    const { chosen } = await api.dawChoice();
    return chosen !== null && chosen !== 'REAPER';
  },
  'delivery.profile': async ({ api }) => {
    const state = await api.deliveryProfiles();
    return state.hasProject && state.projectChoice !== null;
  },
};

/** Rows with a custom body that Changed does not read, each with the reason. A reason is a sentence a reader can judge; a row leaves this list when it gets a probe. */
export const CHANGED_EXEMPT: Readonly<Record<string, string>> = {
  'daw.capabilities': 'A report of what the linked tool can do; nothing here is set.',
  'daw.syncActivity': 'A log of chapter syncs; nothing here is set.',
  'delivery.default': 'The default profile is the host’s; the page has no value to compare the choice with.',
  'project.manuscript': 'The import and replace action for the manuscript, which is project data and not a setting.',
  'project.bibleData': 'Deletes Story Bible data; an action, not a setting.',
  'project.data': 'Deletes project data; an action, not a setting.',
  'project.types': 'A list of Story Bible types edited in place; the host marks no type as added or changed.',
  'project.marks': 'A list of mark types edited in place; the host marks no type as added or changed.',
  'project.credits': 'Credits templates edited in place; the host marks no template as changed.',
};

/** Whether Changed can tell if this row differs from its default: a host field, a browser reader, a probe, or a stated exemption. */
export const changedIsCovered = (row: { id: string; field?: unknown }): boolean =>
  Boolean(row.field) || row.id in BROWSER_CHANGED || row.id in CUSTOM_CHANGED || row.id in CHANGED_EXEMPT;

/**
 * The ids of the custom rows whose value differs from the default, read again when the host's fields change, when a window-kept setting is
 * written, and on the events the bodies already raise for the engine, the delivery profiles, the Merriam-Webster key and the window size
 * (a zoom change resizes it). A probe that fails counts as "not changed", so a host that cannot answer lists nothing wrongly.
 */
export function useCustomChanged(settings: ReadSettings): ReadonlySet<string> {
  const system = usePort('system');
  const dawChoice = usePort('dawChoice');
  const delivery = usePort('deliveryProfiles');
  const pronunciation = usePort('pronunciationOnline');
  const api = useMemo(() => ({ ...system, ...dawChoice, ...delivery, ...pronunciation }), [system, dawChoice, delivery, pronunciation]);
  const version = useBrowserSettingsVersion();
  const [again, setAgain] = useState(0);
  const [changed, setChanged] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const bump = () => setAgain((n) => n + 1);
    const events = [DELIVERY_PROFILES_CHANGED, MW_KEY_CHANGED, 'resize'];
    for (const name of events) window.addEventListener(name, bump);
    const stop = onEngineChanged(bump);
    return () => {
      for (const name of events) window.removeEventListener(name, bump);
      stop();
    };
  }, []);

  useEffect(() => {
    let current = true;
    void Promise.all(
      Object.entries(CUSTOM_CHANGED).map(async ([id, probe]) => {
        try {
          return (await probe({ api, settings })) ? id : undefined;
        } catch {
          return undefined;
        }
      }),
    ).then((ids) => {
      if (current) setChanged(new Set(ids.filter((id): id is string => id !== undefined)));
    });
    return () => {
      current = false;
    };
  }, [api, settings, version, again]);

  return changed;
}
