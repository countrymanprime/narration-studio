/** The development build's version: what a program built without the release stamp reports (src/studio/desktop/version.go). */
const DEVELOPMENT_VERSION = '0.0.0-dev';

/** A build with no release stamp reports this version, or none (src/studio/desktop/version.go; the host's `update.IsDevelopment`). */
function isDevelopmentBuild(version: string): boolean {
  return version === '' || version === DEVELOPMENT_VERSION;
}

/** What the narrator is running: the version, from `Bootstrap`, and a note on a development build. The product name and the licence are the row's label. */
export function AboutPanel({ version }: { version: string }) {
  return (
    <div className="flex flex-col gap-0.5 text-[0.875rem]">
      <b className="font-semibold">Version {version}</b>
      {isDevelopmentBuild(version) && (
        <p className="m-0 text-[0.8125rem] text-[var(--text-muted)]">
          This is a development build, not a release, so it has no version to compare with a newer one.
        </p>
      )}
    </div>
  );
}
