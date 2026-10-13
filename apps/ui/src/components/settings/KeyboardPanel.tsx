import { useCallback, useMemo, useState } from 'react';
import { describeApiError } from '../../api/errorMessage';
import { useApi } from '../../api/ApiContext';
import type { ScopedSettingField } from '../../types';
import { Button } from '../primitives/Button';
import { InsetCard } from '../primitives/InsetCard';
import { Kbd } from '../primitives/Kbd';
import { SectionLabel } from '../primitives/SectionLabel';
import { StatusBadge } from '../primitives/StatusBadge';
import type { Notify } from '../primitives/Toast';
import type { CommandDescriptor, CommandId } from '../../input/commands.catalog';
import { findConflicts, type Conflict } from '../../input/findConflicts';
import { serializeGesture, type Gesture } from '../../input/gestures';
import { gestureKeys } from '../../input/hints';
import { bindingsFromKeymap, defaultKeymap, type Keymap } from '../../input/keymap';
import { type Scope } from '../../input/scopes';
import { commandsFor } from '../../input/surfaces';
import { useGestureCapture } from '../../input/useGestureCapture';
import { refreshUserKeymap, useUserKeymap } from '../../input/useUserKeymap';

// Grouping and copy mirror the "?" sheet (ShortcutSheet.tsx), which lists the same catalogue rows by the same scopes; the
// display order (Global, Page, Booth, Dialog) and the "applies where" subtitle text follow it.
const SCOPE_ORDER: readonly Scope[] = ['global', 'page', 'booth', 'dialog'];
const SCOPE_LABEL: Record<Scope, string> = { global: 'Global', page: 'Page', booth: 'Booth', dialog: 'Dialog' };
const SCOPE_APPLIES: Record<Scope, string> = {
  global: 'anywhere, except while a dialog is open',
  page: "a chapter's Proof view",
  booth: 'the Booth and its companion panel',
  dialog: 'while a dialog is open',
};
// The same phrase used mid-sentence ("No other command uses it ...").
const SCOPE_ACTIVE: Record<Scope, string> = {
  global: 'anywhere',
  page: "on a chapter's Proof view",
  booth: 'where reading happens',
  dialog: 'in this dialog',
};

function groupByScope(catalog: readonly CommandDescriptor[]): Partial<Record<Scope, CommandDescriptor[]>> {
  const groups: Partial<Record<Scope, CommandDescriptor[]>> = {};
  for (const command of catalog) (groups[command.scope] ??= []).push(command);
  return groups;
}

function gestureLabel(gesture: Gesture): string {
  return gestureKeys(gesture).join(' + ');
}

/** The command another command's own gesture list would collide with, if `gesture` were added to `commandId`
 * (Solution Detail: "Conflict messages come from findConflicts"). Built as a hypothetical keymap rather than a
 * bespoke lookup, so a remap is checked by the same pure function the catalog's own zero-conflicts test uses. */
function conflictFor(catalog: readonly CommandDescriptor[], keymap: Keymap, commandId: CommandId, gesture: Gesture): Conflict | undefined {
  const candidate: Keymap = { ...keymap, [commandId]: [...(keymap[commandId] ?? []), gesture] };
  return findConflicts(catalog, candidate).find((conflict) => conflict.commands.includes(commandId));
}

function otherCommandId(conflict: Conflict, commandId: CommandId): CommandId {
  return conflict.commands[0] === commandId ? conflict.commands[1] : conflict.commands[0];
}

function isChanged(keymap: Keymap, defaults: Keymap, commandId: CommandId): boolean {
  const current = (keymap[commandId] ?? []).map(serializeGesture).sort();
  const base = (defaults[commandId] ?? []).map(serializeGesture).sort();
  return current.length !== base.length || current.some((value, index) => value !== base[index]);
}

// The "Changed" badge is THE pill's warn
// outline (StatusBadge, ADR 0600), the dark sets' "CHANGED".

function GestureChips({ gestures }: { gestures: Gesture[] }) {
  if (gestures.length === 0) {
    return (
      <span className="text-[0.8rem]" style={{ color: 'var(--text-muted)' }}>
        Unbound
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      {gestures.map((gesture, index) => (
        <Kbd key={index} keys={gestureKeys(gesture)} />
      ))}
    </span>
  );
}
type RecorderProps = {
  command: CommandDescriptor;
  currentGestures: Gesture[];
  scope: Scope;
  catalog: readonly CommandDescriptor[];
  keymap: Keymap;
  busy: boolean;
  onCancel: () => void;
  onReplace: (gesture: Gesture, stolenFrom?: CommandId) => void;
  onAdd: (gesture: Gesture) => void;
  onUnbind: () => void;
  onResetOne: () => void;
};

// The recorder opens inline under its row, not in a dialog: capturing, then a captured or a conflict
// state. Its status line is a live region that announces the captured gesture, so a screen reader hears the result
// of a press without moving focus.
function Recorder({ command, currentGestures, scope, catalog, keymap, busy, onCancel, onReplace, onAdd, onUnbind, onResetOne }: RecorderProps) {
  const [captured, setCaptured] = useState<Gesture>();
  useGestureCapture(!busy, setCaptured, onCancel);

  const conflict = captured ? conflictFor(catalog, keymap, command.id, captured) : undefined;
  const conflictCommand = conflict ? catalog.find((entry) => entry.id === otherCommandId(conflict, command.id)) : undefined;

  const status = !captured
    ? `Press a key or a pedal for "${command.label}"…`
    : conflict && conflictCommand
      ? `${gestureLabel(captured)} already runs "${conflictCommand.label}".`
      : `${gestureLabel(captured)} captured. No other command uses it ${SCOPE_ACTIVE[scope]}.`;

  return (
    <InsetCard role="group" aria-label={`Change "${command.label}"`} tone="accent" fill className="mt-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm font-medium">
        <span>Change "{command.label}"</span>
        <span style={{ color: 'var(--text-muted)' }}>now</span>
        <GestureChips gestures={currentGestures} />
      </div>
      <InsetCard dashed className="text-center">
        <SectionLabel as="div">Captured</SectionLabel>
        <div className="my-2 flex justify-center">{captured ? <Kbd keys={gestureKeys(captured)} /> : <span aria-hidden="true">—</span>}</div>
        <p className="text-[0.75rem]" style={{ color: 'var(--text-muted)' }}>
          Press another key or pedal to try again. Esc cancels.
        </p>
      </InsetCard>
      <p role="status" aria-live="polite" className="mt-2 text-sm">
        {status}
      </p>
      {conflict && conflictCommand && (
        <InsetCard as="p" tone="warn" role="alert" className="mt-1 text-[0.82rem]">
          <span style={{ color: 'var(--warn-text)' }}>
            Replace takes it from "{conflictCommand.label}", which is then left with no key; you can give it another one afterwards.
          </span>
        </InsetCard>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button disabled={!captured || busy} onClick={() => captured && onReplace(captured, conflict ? conflictCommand?.id : undefined)}>
          Replace
        </Button>
        {!conflict && (
          <>
            <Button variant="secondary" disabled={!captured || busy} onClick={() => captured && onAdd(captured)}>
              Add as another key
            </Button>
            <Button variant="secondary" disabled={busy} onClick={onUnbind}>
              Unbind
            </Button>
            <Button variant="secondary" disabled={busy} onClick={onResetOne}>
              Reset to default
            </Button>
          </>
        )}
        {conflict && (
          <Button variant="secondary" disabled={busy} onClick={() => setCaptured(undefined)}>
            Try another key
          </Button>
        )}
        <Button variant="secondary" className="ml-auto" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </InsetCard>
  );
}

/**
 * Settings > Keyboard & pedals every command the catalogue lists on `settings` (`commandsFor`), grouped by
 * scope, remappable by pressing a key or a pedal. Self-contained like DeliveryProfilesPanel/CreditsPanel: it reads and
 * writes the `Keymap.overrides` row directly rather than through the Settings page's generic dirty-tracking form (`page/ScopedFieldsPanel.tsx`),
 * since that mechanism is for a page of independent fields with a shared Save button, and this is one JSON document a
 * narrator changes one command at a time (each action saves immediately, like LocalAssets' install actions).
 */
export function KeyboardPanel({
  overridesField,
  notify,
  reload,
  catalog,
}: {
  overridesField: ScopedSettingField | undefined;
  notify: Notify;
  reload: () => Promise<void>;
  /** The catalogue to list from; a test's fake rows. Defaults to the real one. */
  catalog?: readonly CommandDescriptor[];
}) {
  const api = useApi();
  const [recordingId, setRecordingId] = useState<CommandId>();
  const [busy, setBusy] = useState(false);

  // Settings has already loaded the setting, so its text is handed to the shared hook rather than fetched again.
  const keymap = useUserKeymap(overridesField?.effectiveValue, catalog);
  const defaults = useMemo(() => defaultKeymap(catalog), [catalog]);
  const commands = useMemo(() => commandsFor('settings', catalog), [catalog]);
  const groups = useMemo(() => groupByScope(commands), [commands]);
  const anyChanged = commands.some((command) => isChanged(keymap, defaults, command.id));

  const persist = useCallback(
    async (nextKeymap: Keymap) => {
      setBusy(true);
      try {
        const bindings = bindingsFromKeymap(nextKeymap, catalog);
        await api.saveSettings('Keymap', 'global', { overrides: JSON.stringify({ version: 1 as const, bindings }) });
        setRecordingId(undefined);
        notify('Keyboard shortcut saved.');
        refreshUserKeymap();
        await reload();
      } catch (error) {
        notify(describeApiError(error), 'error');
      } finally {
        setBusy(false);
      }
    },
    [api, catalog, notify, reload],
  );

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-medium">Keys and pedals</div>
          <p style={{ color: 'var(--text-muted)' }}>
            Every command you can run without the mouse. Choose Change, then press the key or pedal to use. A USB footswitch that types a key works like a
            keyboard. These apply to every project.
          </p>
        </div>
        <Button variant="secondary" disabled={busy || !anyChanged} onClick={() => void persist(defaults)}>
          Reset all to defaults
        </Button>
      </div>
      {(keymap['help.shortcuts'] ?? [])[0] && (
        <p style={{ color: 'var(--text-muted)' }}>
          Press <Kbd keys={gestureKeys(keymap['help.shortcuts'][0])} /> anywhere to see what works on the screen you are on.
        </p>
      )}
      {SCOPE_ORDER.filter((scope) => groups[scope]?.length).map((scope) => (
        <section key={scope}>
          <SectionLabel as="h3" className="mb-1">
            {SCOPE_LABEL[scope]} · {SCOPE_APPLIES[scope]}
          </SectionLabel>
          <div>
            {groups[scope]!.map((command) => {
              const gestures = keymap[command.id] ?? [];
              const changed = isChanged(keymap, defaults, command.id);
              return (
                <div key={command.id} className="border-b py-3" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      {command.label}
                      {command.noisy && (
                        <span className="text-[0.75rem] font-normal" style={{ color: 'var(--text-muted)' }}>
                          Plays audio
                        </span>
                      )}
                      {changed && <StatusBadge tone="warning" look="outline" label="Changed" />}
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      <GestureChips gestures={gestures} />
                      {changed && (
                        <Button variant="secondary" disabled={busy} onClick={() => void persist({ ...keymap, [command.id]: defaults[command.id] ?? [] })}>
                          Reset
                        </Button>
                      )}
                      <Button variant="secondary" disabled={busy} onClick={() => setRecordingId(recordingId === command.id ? undefined : command.id)}>
                        Change
                      </Button>
                    </span>
                  </div>
                  {recordingId === command.id && (
                    <Recorder
                      command={command}
                      currentGestures={gestures}
                      scope={scope}
                      catalog={commands}
                      keymap={keymap}
                      busy={busy}
                      onCancel={() => setRecordingId(undefined)}
                      onReplace={(gesture, stolenFrom) => {
                        const next: Keymap = { ...keymap, [command.id]: [gesture] };
                        if (stolenFrom) next[stolenFrom] = (keymap[stolenFrom] ?? []).filter((bound) => serializeGesture(bound) !== serializeGesture(gesture));
                        void persist(next);
                      }}
                      onAdd={(gesture) => void persist({ ...keymap, [command.id]: [...gestures, gesture] })}
                      onUnbind={() => void persist({ ...keymap, [command.id]: [] })}
                      onResetOne={() => void persist({ ...keymap, [command.id]: defaults[command.id] ?? [] })}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
