import { useEffect, useRef, useState } from 'react';

/**
 * Whether the project picker is open over the shell. It closes when a project is chosen, meaning the open project's folder changes.
 * The folder is `undefined` until the bootstrap payload arrives; that first value is not a switch and must not undo a click made
 * in the gap between the shell appearing and the effect running.
 */
export function useProjectPicker(projectFolder: string | undefined) {
  const [open, setOpen] = useState(false);
  const previous = useRef(projectFolder);
  useEffect(() => {
    if (previous.current !== undefined && previous.current !== projectFolder) setOpen(false);
    previous.current = projectFolder;
  }, [projectFolder]);
  return [open, setOpen] as const;
}
