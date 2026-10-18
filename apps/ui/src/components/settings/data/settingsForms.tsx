import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { describeApiError } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import type { Scope, ScopedSettingField } from '../../../types';

type ScopeSettings = Record<string, ScopedSettingField[]>;
const NO_FIELDS: ScopedSettingField[] = [];

/** One panel's unsaved edits, as the page's Save & continue / Discard & continue reach them. */
export type SettingsForm = { dirty: boolean; save: () => Promise<void>; discard: () => Promise<void> };

type SettingsFormsValue = {
  /** Every tool's fields in `scope`, once read; absent before the first read. */
  settings: Partial<Record<Scope, ScopeSettings>>;
  /** The host's sentence for a failed read of `scope`. */
  errors: Partial<Record<Scope, string>>;
  /** Reads `scope` again (one read at a time per scope); every panel in that scope redraws from it. */
  load: (scope: Scope) => Promise<void>;
  /** A panel's form, or `undefined` when it unmounts. */
  register: (id: string, form: SettingsForm | undefined) => void;
};

const SettingsFormsContext = createContext<SettingsFormsValue | undefined>(undefined);

// The palette colours the Story Bible and Manuscript fields hold, painted on the document as soon as they are read.
const PALETTE: Record<string, string> = {
  color_character: '--character',
  color_location: '--place',
  color_organization: '--org',
  color_lore: '--lore',
  color_item: '--item',
  color_event: '--event',
  color_needs_review: '--review',
  color_note: '--note',
};
function applyPalette(settings: ScopeSettings) {
  const root = document.documentElement;
  [...(settings.ManuscriptGuide ?? []), ...(settings.Manuscript ?? [])].forEach((field) => {
    if (PALETTE[field.key] && field.effectiveValue) root.style.setProperty(PALETTE[field.key]!, `#${field.effectiveValue.replace('#', '')}`);
  });
}

/**
 * The Settings page's shared state: one read of `settingsForScope` per scope for every panel of the page, and the
 * panels' unsaved edits gathered into the one dirty flag and the one Save/Discard pair the app's leave guard asks
 * for (`onDirtyChange`, `registerActions`). Saving or discarding through the guard reaches every panel with edits.
 */
export function SettingsFormsProvider({
  notify,
  onDirtyChange,
  registerActions,
  children,
}: {
  notify: (message: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  registerActions: (actions: { save: () => Promise<void>; discard: () => Promise<void> }) => void;
  children: ReactNode;
}) {
  const system = usePort('system');
  const [settings, setSettings] = useState<Partial<Record<Scope, ScopeSettings>>>({});
  const [errors, setErrors] = useState<Partial<Record<Scope, string>>>({});
  const inFlight = useRef<Partial<Record<Scope, Promise<void>>>>({});
  const forms = useRef(new Map<string, SettingsForm>());
  const [dirtyIds, setDirtyIds] = useState<ReadonlySet<string>>(new Set());

  const load = useCallback(
    (scope: Scope) => {
      const running = inFlight.current[scope];
      if (running) return running;
      const read = (async () => {
        try {
          const next = await system.settingsForScope(scope);
          setSettings((current) => ({ ...current, [scope]: next }));
          setErrors(({ [scope]: _cleared, ...rest }) => rest);
          applyPalette(next);
        } catch (error) {
          const message = describeApiError(error);
          setErrors((current) => ({ ...current, [scope]: message }));
          notify(message);
        } finally {
          delete inFlight.current[scope];
        }
      })();
      inFlight.current[scope] = read;
      return read;
    },
    [system, notify],
  );

  const register = useCallback((id: string, form: SettingsForm | undefined) => {
    if (form) forms.current.set(id, form);
    else forms.current.delete(id);
    const dirty = Boolean(form?.dirty);
    setDirtyIds((current) => {
      if (current.has(id) === dirty) return current;
      const next = new Set(current);
      if (dirty) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  useEffect(() => {
    onDirtyChange(dirtyIds.size > 0);
  }, [dirtyIds, onDirtyChange]);
  useEffect(() => {
    const each = (step: (form: SettingsForm) => Promise<void>) => async () => {
      for (const form of [...forms.current.values()].filter((entry) => entry.dirty)) await step(form);
    };
    registerActions({ save: each((form) => form.save()), discard: each((form) => form.discard()) });
  }, [registerActions]);

  const value = useMemo(() => ({ settings, errors, load, register }), [settings, errors, load, register]);
  return <SettingsFormsContext.Provider value={value}>{children}</SettingsFormsContext.Provider>;
}

export function useSettingsForms(): SettingsFormsValue {
  const value = useContext(SettingsFormsContext);
  if (!value) throw new Error('useSettingsForms needs a SettingsFormsProvider');
  return value;
}

/**
 * `tool`'s fields in `scope` (read on first use), the host's sentence when the read failed, and `reload` for after a save.
 * The fields are `undefined` until the first read ends.
 */
export function useScopedFields(tool: string | undefined, scope: Scope) {
  const { settings, errors, load } = useSettingsForms();
  const scoped = settings[scope];
  useEffect(() => {
    if (!scoped) void load(scope);
  }, [load, scope, scoped]);
  return { fields: scoped && tool ? (scoped[tool] ?? NO_FIELDS) : undefined, all: scoped, error: errors[scope], reload: () => load(scope) };
}
