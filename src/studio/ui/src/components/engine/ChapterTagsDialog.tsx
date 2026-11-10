import { apiErrorMessage } from '../../api/errorMessage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '../../api/ApiContext';
import { Button } from '../primitives/Button';
import { Checkbox } from '../primitives/Checkbox';
import { Dialog } from '../primitives/Dialog';
import { SectionLabel } from '../primitives/SectionLabel';
import { StatusBadge } from '../primitives/StatusBadge';
import { Field } from '../primitives/Field';
import { ToolResult } from './ToolResult';
import type { ChapterTagsPreview } from '../../types';

const IDLE: ChapterTagsPreview = { chapters: [], ready: false };
/** How long an Embed waits for the host before it says so and frees the dialog: a copy of one book's MP3 takes seconds, not minutes. */
const EMBED_DEADLINE_MS = 60_000;
/** How long reading the last chapter render waits for the host before it says so and offers Check again. */
const PREVIEW_DEADLINE_MS = 15_000;

/** Chapter tag embedding. This never talks to REAPER: it reads
 * the last "Prepare chapter render" result (the per-chapter MP3 titles and files) to build a chapter
 * timeline, then writes ID3v2 CHAP/CTOC frames into a NEW copy of a separate, already-rendered combined-book MP3
 * the narrator names below - never into the per-chapter files, and never overwriting the file they name. Reachable
 * from Delivery's Output panel beside the package build, not a new nav item (#2829); it is not a DAW tool and is not in the DAW tools registry. */
export function ChapterTagsDialog({ onClose }: { onClose: () => void }) {
  const api = useApi();
  const [preview, setPreview] = useState<ChapterTagsPreview>(IDLE);
  const [reading, setReading] = useState(true);
  const [previewError, setPreviewError] = useState('');
  const [destPath, setDestPathState] = useState('');
  const [confirmed, setConfirmedState] = useState(false);
  // `embedding` is what the narrator waits on; `inFlight` stays true until the host's call settles, which can be after the deadline freed the dialog.
  const [embedding, setEmbedding] = useState(false);
  const [inFlight, setInFlight] = useState(false);
  const [outputPath, setOutputPath] = useState('');
  const [embedError, setEmbedError] = useState('');
  const mounted = useRef(true);
  const loadRun = useRef(0);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(() => {
    const run = ++loadRun.current;
    setReading(true);
    setPreviewError('');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('The app did not answer when it read your last chapter render.')), PREVIEW_DEADLINE_MS);
    });
    Promise.race([api.chapterTagsPreview(), deadline])
      .then((next) => {
        if (mounted.current && run === loadRun.current) setPreview(next);
      })
      .catch((reason: unknown) => {
        if (mounted.current && run === loadRun.current) setPreviewError(apiErrorMessage(reason));
      })
      .finally(() => {
        clearTimeout(timer);
        if (mounted.current && run === loadRun.current) setReading(false);
      });
  }, [api]);

  useEffect(() => load(), [load]);

  // What was written belongs to the destination and confirmation it was written for: changing either takes the old result away.
  const setDestPath = (next: string) => {
    setDestPathState(next);
    setOutputPath('');
  };
  const setConfirmed = (next: boolean) => {
    setConfirmedState(next);
    setOutputPath('');
  };

  // The result sits below the fold in a short window: bring it into view.
  useEffect(() => {
    if (outputPath || embedError) resultRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [outputPath, embedError]);

  // After the deadline the first call may still be writing: a second press would write to the same file at the same time.
  const held = inFlight && !embedding;
  // Why Embed is off, as its tooltip: the button never sits disabled with nothing to say (#3276).
  const embedWhy = embedding
    ? ''
    : held
      ? 'The first copy may still be writing. Wait, or close this dialog and look in the folder of your MP3.'
      : !preview.ready
        ? 'Every chapter has to be rendered first; the list above says which are not.'
        : destPath.trim() === ''
          ? 'Enter the combined book MP3 first.'
          : !confirmed
            ? 'Tick the box that says a new file is written first.'
            : '';

  const embed = () => {
    if (inFlight) return;
    setEmbedError('');
    setOutputPath('');
    setEmbedding(true);
    setInFlight(true);
    // A host that never answers must not trap the dialog: after the deadline it says so and Close and Escape work again; a late answer is still shown.
    const timer = setTimeout(() => {
      if (!mounted.current) return;
      setEmbedError(
        'The app did not answer. The copy may still be written, and this dialog shows it if it arrives. Close it, or look in the folder of your MP3.',
      );
      setEmbedding(false);
    }, EMBED_DEADLINE_MS);
    api
      .chapterTagsEmbed(destPath.trim())
      .then((result) => {
        if (!mounted.current) return;
        setEmbedError('');
        setOutputPath(result.outputPath);
      })
      .catch((reason: unknown) => {
        if (mounted.current) setEmbedError(apiErrorMessage(reason));
      })
      .finally(() => {
        clearTimeout(timer);
        if (!mounted.current) return;
        setEmbedding(false);
        setInFlight(false);
      });
  };

  return (
    <Dialog
      dismissOnOutsidePress={false}
      title="Embed chapter tags"
      onClose={embedding ? undefined : onClose}
      escapeCloses={!embedding}
      description="Add ID3 chapter markers to a copy of an already-rendered MP3, using the chapter names and lengths from your last chapter render. The file you choose below is never changed; a new, tagged copy is written beside it."
      actions={
        <>
          {/* The header's Close is the dialog's only "Close"; this button is Cancel until the tagged copy is written, then Done, the next step (ENX-28). */}
          <Button variant={outputPath ? 'primary' : 'secondary'} onClick={onClose} disabled={embedding}>
            {outputPath ? 'Done' : 'Cancel'}
          </Button>
          <Button variant={outputPath ? 'secondary' : 'primary'} onClick={embed} pending={embedding} disabledReason={embedWhy}>
            Embed chapter tags
          </Button>
        </>
      }
    >
      {previewError && (
        <div className="space-y-2">
          <ToolResult tone="danger" message={previewError} />
          <Button variant="secondary" size="sm" onClick={load}>
            Check again
          </Button>
        </div>
      )}
      {!previewError && reading && (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }} role="status">
          Reading your last chapter render&hellip;
        </p>
      )}
      {!previewError && !reading && preview.chapters.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          No chapter render is configured yet. Use &ldquo;Prepare chapter render…&rdquo; in DAW tools on Editing, Proof or Master &amp; QC first.
        </p>
      )}
      {preview.chapters.length > 0 && (
        <section aria-labelledby="chapter-tags-chapters" className="space-y-2">
          <SectionLabel as="h3" id="chapter-tags-chapters">
            Chapters from your last chapter render
          </SectionLabel>
          <ul className="max-h-32 space-y-0.5 overflow-y-auto text-sm">
            {preview.chapters.map((chapter) => (
              <li key={chapter.path} className="flex items-center gap-2">
                <span className="min-w-0">{chapter.title}</span>
                {!chapter.rendered && <StatusBadge tone="danger" label="Not rendered yet" />}
              </li>
            ))}
          </ul>
          {!preview.ready && (
            <ToolResult tone="warning" message="Press Render in REAPER first: every chapter file must exist before chapter tags can be timed from them." />
          )}
        </section>
      )}

      <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
        <Field
          label="Combined book MP3 to add chapters to"
          value={destPath}
          onChange={setDestPath}
          disabled={embedding}
          placeholder="C:\Books\Alice\Alice in Wonderland.mp3"
        />
        <div className="mt-2" style={{ color: 'var(--text-muted)' }}>
          <Checkbox checked={confirmed} onChange={setConfirmed} disabled={embedding}>
            I understand this writes a new file beside the one above; the original file is not changed.
          </Checkbox>
        </div>
      </div>

      {outputPath && (
        <div className="mt-4" ref={resultRef}>
          <ToolResult tone="success" message={`Wrote ${outputPath}`} />
        </div>
      )}
      {embedError && (
        <div className="mt-4" ref={outputPath ? undefined : resultRef}>
          <ToolResult tone="danger" message={embedError} />
        </div>
      )}
    </Dialog>
  );
}
