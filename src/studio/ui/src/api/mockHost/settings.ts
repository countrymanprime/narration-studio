// The mock host (mockApi.ts): settings.
import type { NarrationApi, Scope, ScopedSettingField } from '../../types';
import { wireClone, wireSettings } from '../mockFixtures';

export type MockSettings = Record<Scope, Record<string, ScopedSettingField[]>>;

/**
 * How the mock's settings file behaves (`?mockSettings=`): `loading` never answers a read, so the page stays on its loading rows; `unreadable`
 * rejects every read, as a file the host cannot parse does; `save-fails` reads normally and rejects every save with the read-only sentence.
 */
export type MockSettingsSeed = 'loading' | 'unreadable' | 'save-fails';

export const UNREADABLE_SETTINGS = 'The settings file could not be read: it is not valid JSON';
export const READ_ONLY_SETTINGS = 'The settings file is read-only.';

/** The settings bindings. Saving answers with a fresh bootstrap, as the host does. */
export function createSettingsMock(
  bootstrap: NarrationApi['bootstrap'],
  onSaved: (tool: string, scope: Scope, values: Record<string, string | null>) => void = () => {},
  seed?: MockSettingsSeed,
  /** A switch the file already holds on: the public demo starts with Experimental REAPER actions on, so its simulated DAW answers. */
  experimentalReaper = false,
) {
  const globalSettings = wireSettings();
  if (experimentalReaper) {
    globalSettings.DAW = globalSettings.DAW?.map((field) =>
      field.key === 'experimental_reaper_actions' ? { ...field, value: 'true', isSet: true, effectiveValue: 'true', effectiveSource: 'Global' } : field,
    );
  }
  const settings: MockSettings = {
    global: globalSettings,
    project: Object.fromEntries(
      Object.entries(globalSettings).map(([tool, fields]) => [
        tool,
        // A field set in Global is inherited from there; one set nowhere keeps the default the host would send.
        fields.map((field) => ({
          ...field,
          value: '',
          isSet: false,
          effectiveValue: field.isSet ? field.value : field.effectiveValue,
          effectiveSource: field.isSet ? 'Global' : field.effectiveSource,
        })),
      ]),
    ),
  };
  const bindings = {
    saveSettings: async (tool, scope, values) => {
      if (seed === 'save-fails') throw new Error(READ_ONLY_SETTINGS);
      settings[scope][tool] = (settings[scope][tool] || []).map((field) =>
        field.key in values
          ? {
              ...field,
              value: values[field.key] ?? '',
              isSet: values[field.key] !== null,
              // A cleared project field falls back to Global, a cleared Global field to the value the mock started with (its default).
              effectiveValue:
                values[field.key] ??
                (scope === 'project' ? settings.global[tool] : wireSettings()[tool])?.find((item) => item.key === field.key)?.effectiveValue ??
                '',
            }
          : field,
      );
      onSaved(tool, scope, values);
      return bootstrap();
    },
    settingsForScope: async (scope) => {
      if (seed === 'loading') return new Promise<never>(() => {});
      if (seed === 'unreadable') throw new Error(UNREADABLE_SETTINGS);
      return wireClone(settings[scope]);
    },
  } satisfies Partial<NarrationApi>;
  return { bindings, settings };
}
