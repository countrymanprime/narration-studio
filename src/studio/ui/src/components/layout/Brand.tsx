import { Icon } from '../primitives/Icon';

// The app's mark and name: the 32 px accent square holding the microphone, radius 6, and the name in Barlow Condensed 700 at 15 px over
// a 12 px muted "Studio", 10 px after the mark (the mock's `.brand`). The shell's brand block and the project picker draw it, so they cannot drift apart.
// `brand-name` is the hook the collapsed rail uses to hide the name.
export function Brand() {
  return (
    <>
      <span className="flex size-8 flex-none items-center justify-center rounded-[var(--radius-button)] bg-[var(--accent)] text-[1rem] text-[var(--accent-contrast)]">
        <Icon name="microphone" />
      </span>
      <span className="brand-name pb-[0.125rem] font-['Barlow_Condensed',sans-serif] leading-none uppercase">
        <b className="block text-[0.9375rem] font-bold tracking-[0.1em]">Narration</b>
        <span className="mt-[0.3125rem] block text-[0.75rem] font-semibold tracking-[0.14em] text-[var(--text-muted)]">Studio</span>
      </span>
    </>
  );
}
