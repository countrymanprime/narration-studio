// How a popup anchored to a control (Popover, Menu, ContextMenu, ChapterStepper's menu) arrives and leaves: it fades in while
// moving --motion-shift away from its anchor, on the fast token, and fades out on the same token. Base UI sets
// data-starting-style on the popup's first frame and data-ending-style while it closes, and waits for the transition before
// unmounting. The starting and ending styles are `motion-ok:` too: under reduced motion the popup has no transition and no
// invisible first frame, so it appears and goes at once
// (docs/design/motion-and-animation.md). A dialog has none of this: dialogs stay instant (#1456, Q3).
export const POPUP_MOTION_CLASSES = [
  'motion-ok:transition-[opacity,translate]',
  'motion-ok:duration-(--motion-fast)',
  'motion-ok:ease-(--ease-enter)',
  'data-[ending-style]:motion-ok:ease-(--ease-exit)',
  'data-[starting-style]:motion-ok:opacity-0',
  'data-[ending-style]:motion-ok:opacity-0',
  'data-[side=bottom]:data-[starting-style]:motion-ok:-translate-y-(--motion-shift)',
  'data-[side=top]:data-[starting-style]:motion-ok:translate-y-(--motion-shift)',
  'data-[side=right]:data-[starting-style]:motion-ok:-translate-x-(--motion-shift)',
  'data-[side=left]:data-[starting-style]:motion-ok:translate-x-(--motion-shift)',
].join(' ');
