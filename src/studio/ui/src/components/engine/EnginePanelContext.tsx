import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { Button } from '../primitives/Button';

// Opens the engine panel from anywhere in the app: the header's
// engine chip, and every "fix this link" pointer. App.tsx owns the one
// panel and provides this; without a provider (a component test) the pointers render and do nothing.
const EnginePanelContext = createContext<(() => void) | null>(null);

// The mounted providers' openers, for the overlay host: it renders beside the routes, not under this provider, so a dialog or panel opened through the
// overlay service (Check recordings) would otherwise find no provider and its "Open the audio engine panel" pointer would close it and do nothing.
// A stack, so a second provider (a story) that unmounts takes only its own entry away. A component with a provider above it still uses that one; with
// none anywhere (a component test) both pointers stay no-ops.
type Mounted = { openEnginePanel: () => void; openRecordingSettings: (() => void) | null };
const mounted: Mounted[] = [];
const openMountedEnginePanel = () => mounted.at(-1)?.openEnginePanel();
const openMountedRecordingSettings = () =>
  [...mounted]
    .reverse()
    .find((entry) => entry.openRecordingSettings)
    ?.openRecordingSettings?.();

export function useOpenEnginePanel(): () => void {
  return useContext(EnginePanelContext) ?? openMountedEnginePanel;
}

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
  // The overlay host's fallback (above): this provider's openers while it is mounted.
  useEffect(() => {
    const entry: Mounted = { openEnginePanel: value, openRecordingSettings };
    mounted.push(entry);
    return () => {
      const at = mounted.indexOf(entry);
      if (at >= 0) mounted.splice(at, 1);
    };
  }, [value, openRecordingSettings]);
  return (
    <EnginePanelContext.Provider value={value}>
      <RecordingSettingsContext.Provider value={openRecordingSettings}>{children}</RecordingSettingsContext.Provider>
    </EnginePanelContext.Provider>
  );
}

export function useOpenRecordingSettings(): () => void {
  return useContext(RecordingSettingsContext) ?? openMountedRecordingSettings;
}
