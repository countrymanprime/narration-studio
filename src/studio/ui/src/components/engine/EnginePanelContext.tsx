import { createContext, useContext, type ReactNode } from 'react';
import { Button } from '../primitives/Button';

// Opens the engine panel from anywhere in the app: the header's
// engine chip, and every "fix this link" pointer. App.tsx owns the one
// panel and provides this; without a provider (a component test) the pointers render and do nothing.
const EnginePanelContext = createContext<(() => void) | null>(null);

export function useOpenEnginePanel(): () => void {
  return useContext(EnginePanelContext) ?? noop;
}

function noop() {}

/** An inline "Open the audio engine panel" pointer, drawn like the text links it replaces ("Open Tracks"). */
export function EnginePanelLink({
  className = 'font-semibold',
  children = 'Open the audio engine panel',
  onOpen,
}: {
  className?: string;
  children?: ReactNode;
  /** Runs as the panel opens, for a dialog that must close so the panel is not under it. */
  onOpen?: () => void;
}) {
  const open = useOpenEnginePanel();
  return (
    <Button
      variant="link"
      className={className}
      onClick={() => {
        onOpen?.();
        open();
      }}
    >
      {children}
    </Button>
  );
}

// Opens Settings > Recording & DAW, where the project's engine is chosen. App.tsx owns it (it closes the panel and goes through the guarded
// navigate, so a running take is asked about first); the engine panel's gear and the Built-in chips use it.
const RecordingSettingsContext = createContext<(() => void) | null>(null);

/** Provides both openers: the engine panel's and Settings > Recording & DAW's. Without `openRecordingSettings` (a component test) that one does nothing. */
export function EnginePanelProvider({
  value,
  openRecordingSettings = null,
  children,
}: {
  value: () => void;
  openRecordingSettings?: (() => void) | null;
  children: ReactNode;
}) {
  return (
    <EnginePanelContext.Provider value={value}>
      <RecordingSettingsContext.Provider value={openRecordingSettings}>{children}</RecordingSettingsContext.Provider>
    </EnginePanelContext.Provider>
  );
}

export function useOpenRecordingSettings(): () => void {
  return useContext(RecordingSettingsContext) ?? noop;
}
