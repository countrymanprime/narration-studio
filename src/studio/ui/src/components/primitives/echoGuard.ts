import { useRef, type MouseEvent } from 'react';

/** The OS double-click interval: a second press this soon after a button appeared is the echo of the press that made it appear. */
export const ECHO_WINDOW_MS = 500;

/**
 * For a button that takes the place of the one just pressed (Download becomes Cancel, Export becomes Done). A double click lands its second
 * press on the new button and would undo or close what the first press started, so the new button ignores presses for `ECHO_WINDOW_MS` after
 * it mounts. Returns true when the press is such an echo (and stops it); `enabled` false never ignores.
 */
export function useEchoGuard(enabled: boolean | undefined): (event: MouseEvent) => boolean {
  const mountedAt = useRef(Date.now());
  return (event) => {
    if (!enabled || Date.now() - mountedAt.current >= ECHO_WINDOW_MS) return false;
    event.preventDefault();
    return true;
  };
}
