// Who says why a project launched from the DAW was turned away (the host's `system:attached` with a reason). App toasts the reason; a dialog
// that already writes it in its own alert (the Booth's connect dialog, `booth/record/RecordSetup.tsx`) claims it while it is mounted, so the
// narrator is not told the same sentence twice, once over the script (alignment audit R4BO2-4).

let claims = 0;

/** Claims the turned-away reason for as long as the caller is mounted; returns the release, for a `useEffect` cleanup. */
export function claimAttachRefusal(): () => void {
  claims += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    claims -= 1;
  };
}

/** Whether a mounted dialog already says why the project was turned away, so App leaves out its toast. */
export function attachRefusalClaimed(): boolean {
  return claims > 0;
}
