// A file or folder path that wraps after a folder separator, never inside a folder's name ("faster-whisper/s|mall" was the defect,
// alignment audit R3BO-4, XPJ-9): a `<wbr>` after every `/` and `\`. Its box keeps `overflow-wrap: anywhere`, so a single name longer
// than the line still breaks rather than pushing the page sideways.

/** The path's text with a break opportunity after each separator. */
export function BreakablePath({ path }: { path: string }) {
  return (
    <span className="[overflow-wrap:anywhere]">
      {path.split(/(?<=[\\/])/).map((part, index) => (
        <span key={index}>
          {part}
          <wbr />
        </span>
      ))}
    </span>
  );
}
