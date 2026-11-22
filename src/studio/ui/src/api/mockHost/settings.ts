// The mock host (mockApi.ts): settings.
import type { NarrationApi, Scope, ScopedSettingField } from '../../types';
import type { NumberSettingRange } from '../contracts/system';
import { wireClone, wireSettings } from '../mockFixtures';

export type MockSettings = Record<Scope, Record<string, ScopedSettingField[]>>;

/**
 * How the mock's settings file behaves (`?mockSettings=`): `loading` never answers a read, so the page stays on its loading rows; `unreadable`
 * rejects every read, as a file the host cannot parse does; `save-fails` reads normally and rejects every save with the read-only sentence.
 */
export type MockSettingsSeed = 'loading' | 'unreadable' | 'save-fails' | 'odd-chunk';

export const UNREADABLE_SETTINGS = 'The settings file could not be read: it is not valid JSON';
export const READ_ONLY_SETTINGS = 'The settings file is read-only.';
/** The host's sentence for a colour that is not six hex digits. */
export const notAColour = (key: string): string => `setting ${key} must be a six-digit color`;
const SIX_HEX_DIGITS = /^[0-9a-fA-F]{6}$/;
const PLAIN_NUMBER = /^-?(\d+(\.\d*)?|\.\d+)$/;

/** The host's sentence for a value its number field refuses (`validateNumberSetting` in src/studio/desktop/settings_number.go), or undefined. */
function numberRefusal(key: string, range: NumberSettingRange, text: string): string | undefined {
  const value = Number(text);
  if (!PLAIN_NUMBER.test(text) || !Number.isFinite(value)) return `setting ${key} must be a number, like -3 or 0.5`;
  const unit = range.unit ? ` ${range.unit}` : '';
  const { min, max, step } = range;
  if ((min !== null && value < min) || (max !== null && value > max)) {
    const words = min !== null && max !== null ? `between ${min} and ${max}${unit}` : min !== null ? `at least ${min}${unit}` : `at most ${max}${unit}`;
    return `setting ${key} must be ${words}`;
  }
  if (step !== null && step > 0) {
    const steps = (value - (min ?? 0)) / step;
    if (Math.abs(steps - Math.round(steps)) > 1e-9 * Math.max(1, Math.abs(steps))) return `setting ${key} must go in steps of ${step}`;
  }
  return undefined;
}

/** The settings bindings. Saving answers with a fresh bootstrap, as the host does. */
export function createSettingsMock(
  bootstrap: NarrationApi['bootstrap'],
  onSaved: (tool: string, scope: Scope, values: Record<string, string | null>) => void = () => {},
  seed?: MockSettingsSeed,
) {
  const globalSettings = wireSettings();
  // A hand-edited settings file: a coverage chunk length of 240 s (not one of the choices Settings lists) and a compare chunk that is not a number.
  if (seed === 'odd-chunk') {
    const set = (tool: string, key: string, value: string) => {
      globalSettings[tool] = (globalSettings[tool] || []).map((field) =>
        field.key === key ? { ...field, value, isSet: true, effectiveValue: value, effectiveSource: 'Global' } : field,
      );
    };
    set('RecordingCoverage', 'chunk_seconds', '240');
    set('TranscriptCompare', 'chunk_seconds', 'abc');
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
      // As the host (saveSettings in src/studio/desktop/app.go): the local model for unknown speakers is this computer's, never a project's.
      if (tool === 'ManuscriptGuide' && scope !== 'global' && Object.keys(values).some((key) => key.startsWith('speaker_fallback')))
        throw new Error('the local model for unknown speakers is global: it is installed on this computer, not in this project');
      // The host checks each value against its field's kind before it writes any (`validateSettingValue` in src/studio/desktop/app.go). The
      // mock holds the colour rule and the number rule, the ones a page can break by sending text as typed; a cleared field (null) is not a
      // value to check.
      for (const field of settings[scope][tool] || []) {
        const value = values[field.key];
        if (typeof value !== 'string') continue;
        if (field.kind === 'color' && !SIX_HEX_DIGITS.test(value)) throw new Error(notAColour(field.key));
        const refused = field.kind === 'number' && field.number ? numberRefusal(field.key, field.number, value) : undefined;
        if (refused) throw new Error(refused);
      }
      settings[scope][tool] = (settings[scope][tool] || []).map((field) =>
        field.key in values
          ? {
              ...field,
              value: values[field.key] ?? '',
              isSet: values[field.key] !== null,
              // Where the value in force came from: the layer it was saved in, or the default again once cleared (what the host reports).
              effectiveSource: values[field.key] === null ? (scope === 'project' ? 'Global' : 'repo default') : scope === 'project' ? 'Project' : 'Global',
              // A cleared project field falls back to Global, a cleared Global field to the value the mock started with (its default).
              effectiveValue:
                values[field.key] ??
                (scope === 'project' ? settings.global[tool] : wireSettings()[tool])?.find((item) => item.key === field.key)?.effectiveValue ??
                '',
            }
          : field,
      );
      // A project field that is not set follows the computer scope live, as the host resolves it; one the project sets keeps its own value.
      if (scope === 'global') {
        settings.project[tool] = (settings.project[tool] || []).map((field) =>
          field.key in values && !field.isSet
            ? { ...field, effectiveValue: settings.global[tool]?.find((item) => item.key === field.key)?.effectiveValue ?? field.effectiveValue }
            : field,
        );
      }
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
