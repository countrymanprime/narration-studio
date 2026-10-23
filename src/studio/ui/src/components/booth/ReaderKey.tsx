import { typeHueColour } from '../../kinds/entityColour';
import { kindMarkStyle } from '../../kinds/markStyle';
import { NOTE_COLOUR } from '../../kinds/narratorMark';
import { KindMark } from '../primitives/KindMark';

// The legend for every mark the reader can show (read, current, skipped, and with `marks` the
// story bible and note marks and the suspected flag marks: restart, misread, extra; a skipped flag is the skipped
// outline). Each swatch is the registry's mark for its kind (kinds/kindMap.ts), so the key can never disagree with the text. The
// current-word and skipped swatches are drawn by hand or by style rather than as a real `KindMark kind="Cursor"`/`data-word`, so this
// legend is never mistaken for the actual current word by a `[data-highlight="Cursor"]` or `[data-word]` query (the
// reader's own tests and the mock-driven visual states rely on those being unique). The other swatches are real `KindMark`s:
// nothing looks them up as unique.
// `layout="row"` is the inline strip above the text (the standalone page); `"list"` is the read-aloud rail's Key tab.
export function ReaderKey({ seekable, marks = false, layout = 'row' }: { seekable: boolean; marks?: boolean; layout?: 'row' | 'list' }) {
  const list = layout === 'list';
  return (
    <div
      className={list ? 'flex flex-col items-start gap-2 text-sm' : 'flex flex-wrap items-center gap-x-4 gap-y-1 text-xs'}
      style={{ color: 'var(--text-muted)' }}
      aria-label="Key"
    >
      {!list && <span className="font-medium">Key:</span>}
      <span className="flex items-center gap-1.5">
        <span className="rounded-[0.15rem] px-[0.05em]" style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}>
          word
        </span>{' '}
        current word
      </span>
      <span className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
        word read
      </span>
      <span className="flex items-center gap-1.5">
        <span className="rounded-[0.15rem] px-[0.05em]" style={kindMarkStyle('missing')}>
          word
        </span>{' '}
        skipped
      </span>
      {marks && (
        <>
          <span className="flex items-center gap-1.5">
            <KindMark kind="entity" colour={typeHueColour('green')}>
              name
            </KindMark>{' '}
            story bible entry
          </span>
          <span className="flex items-center gap-1.5">
            <KindMark kind="entity" colour={NOTE_COLOUR}>
              words
            </KindMark>{' '}
            note
          </span>
          {/* The suspected flags: real `KindMark`s of the flag kinds, like the story bible swatches. Skipped words
              share the dotted underline above. */}
          <span className="flex items-center gap-1.5">
            <KindMark kind="repeat">word</KindMark> read again from here (suspected restart)
          </span>
          <span className="flex items-center gap-1.5">
            <KindMark kind="misread">word</KindMark> suspected misread
          </span>
          <span className="flex items-center gap-1.5">
            <KindMark kind="extra">word</KindMark> suspected extra words before it
          </span>
        </>
      )}
      {/* Click-to-seek: only reachable once a session is
          running, so the hint only shows then - it would be misleading while idle, when no word is clickable. */}
      {seekable && <span className={list ? '' : 'ml-auto'}>Click a word to start or go back to it.</span>}
      {marks && <span>Click a highlighted name, note or flag to open it here. The reading position stays where it is.</span>}
      {marks && <span>Flags are suspected: live listening can mishear a correct read. Transcript Compare over the recording is authoritative.</span>}
    </div>
  );
}
