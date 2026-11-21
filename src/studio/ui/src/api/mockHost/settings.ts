// The mock host (mockApi.ts): settings.
import type { NarrationApi, Scope, ScopedSettingField } from '../../types';
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
/** The host's sentence for a choice that is not one of the field's choices. */
export const notAChoice = (key: string): string => `unsupported value for ${key}`;

const PLAIN_NUMBER = /^-?(\d+(\.\d*)?|\.\d+)$/;
const STEP_TOLERANCE = 1e-9;
const withUnit = (text: string, unit: string): string => (unit ? `${text} ${unit}` : text);

/** The host's sentence for a number its range refuses (`validateNumberSetting` in src/studio/desktop/settings_number.go), or undefined for one it keeps. */
export function numberRefusal(key: string, range: NonNullable<ScopedSettingField['number']>, value: string): string | undefined {
  const number = Number(value);
  if (!PLAIN_NUMBER.test(value) || !Number.isFinite(number)) return `setting ${key} must be a number, like -3 or 0.5`;
  const { min, max, step, unit } = range;
  if ((min !== null && number < min) || (max !== null && number > max)) {
    if (min !== null && max !== null) return `setting ${key} must be ${withUnit(`between ${min} and ${max}`, unit)}`;
    return `setting ${key} must be ${min !== null ? withUnit(`at least ${min}`, unit) : withUnit(`at most ${max}`, unit)}`;
  }
  if (step !== null && step > 0) {
    const steps = (number - (min ?? 0)) / step;
    if (Math.abs(steps - Math.round(steps)) > STEP_TOLERANCE * Math.max(1, Math.abs(steps))) return `setting ${key} must go in steps of ${step}`;
  }
  return undefined;
}

/** Why the host refuses `value` for `field`, by the field's kind (`validateSettingValue` in src/studio/desktop/app.go), or undefined when it keeps it. */
function refusal(field: ScopedSettingField, value: string): string | undefined {
  if (field.kind === 'color') return SIX_HEX_DIGITS.test(value) ? undefined : notAColour(field.key);
  if (field.kind === 'choice') return field.choices.includes(value) ? undefined : notAChoice(field.key);
  if (field.kind === 'number' && field.number) return numberRefusal(field.key, field.number, value);
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
      // The host checks each value against its field's kind before it writes any (`validateSettingValue` in src/studio/desktop/app.go). The
      // mock holds the rules a page can break by what it sends: a colour as typed, a choice the field does not offer (an emptied box sent
      // as ''), a number out of range or between steps. A cleared field (null) is not a value to check.
      for (const field of settings[scope][tool] || []) {
        const value = values[field.key];
        const why = typeof value === 'string' ? refusal(field, value) : undefined;
        if (why) throw new Error(why);
      }
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
