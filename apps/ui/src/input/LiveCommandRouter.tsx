import { CommandRouter, type CommandRouterProps } from './router';
import { useDawRecording } from './useDawRecording';
import { useUserKeymap } from './useUserKeymap';

export type LiveCommandRouterProps = Omit<CommandRouterProps, 'isRecording'>;

/**
 * Mounted at the root in place of a bare `<CommandRouter>` (main.tsx):
 * wires the router's `isRecording` seam to the DAW port's live transport state, so a `noisy` command
 * actually goes silent while REAPER reports recording, and hands it the narrator's keymap, so a saved remap fires on its
 * new gesture. Needs an `<ApiProvider>` ancestor, which `<CommandRouter>` itself does not - tests that don't care about
 * the DAW port keep using `<CommandRouter>` directly, as `router.test.tsx` does. A `keymap` prop still wins, for a test.
 */
export function LiveCommandRouter({ children, keymap, catalog, ...props }: LiveCommandRouterProps) {
  const isRecording = useDawRecording();
  const userKeymap = useUserKeymap(undefined, catalog);
  return (
    <CommandRouter {...props} catalog={catalog} keymap={keymap ?? userKeymap} isRecording={isRecording}>
      {children}
    </CommandRouter>
  );
}
