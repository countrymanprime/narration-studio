import { useEffect, useState } from 'react';
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

/** Chapter tag embedding. This never talks to REAPER: it reads
 * the last "Prepare chapter render" result (the per-chapter MP3 titles and files) to build a chapter
 * timeline, then writes ID3v2 CHAP/CTOC frames into a NEW copy of a separate, already-rendered combined-book MP3
 * the narrator names below - never into the per-chapter files, and never overwriting the file they name. Reachable
 * from the audio engine panel next to "Link chapters…" and "Prepare chapter render…",
 * not a new nav item. */
export function ChapterTagsDialog({ onClose }: { onClose: () => void }) {
  const api = useApi();
  const [preview, setPreview] = useState<ChapterTagsPreview>(IDLE);
  const [previewError, setPreviewError] = useState('');
  const [destPath, setDestPath] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [embedding, setEmbedding] = useState(false);
  const [outputPath, setOutputPath] = useState('');
  const [embedError, setEmbedError] = useState('');

  useEffect(() => {
    let active = true;
    void api
      .chapterTagsPreview()
      .then((next) => {
        if (active) setPreview(next);
      })
      .catch((reason: unknown) => {
        if (active) setPreviewError(String(reason));
      });
    return () => {
      active = false;
    };
  }, [api]);

  const canEmbed = preview.ready && destPath.trim() !== '' && confirmed && !embedding;

  const embed = () => {
    setEmbedError('');
    setOutputPath('');
    setEmbedding(true);
    api
      .chapterTagsEmbed(destPath)
      .then((result) => setOutputPath(result.outputPath))
      .catch((reason: unknown) => setEmbedError(String(reason)))
      .finally(() => setEmbedding(false));
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
          {/* Once the tagged copy is written, Close is the next step (ENX-28). */}
          <Button variant={outputPath ? 'primary' : 'secondary'} onClick={onClose} disabled={embedding}>
            Close
          </Button>
          <Button variant={outputPath ? 'secondary' : 'primary'} onClick={embed} disabled={!canEmbed} pending={embedding}>
            Embed chapter tags
          </Button>
        </>
      }
    >
      {previewError && <ToolResult tone="danger" message={previewError} />}
      {!previewError && preview.chapters.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          No chapter render is configured yet. Use &ldquo;Prepare chapter render…&rdquo; first.
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
        <div className="mt-4">
          <ToolResult tone="success" message={`Wrote ${outputPath}`} />
        </div>
      )}
      {embedError && (
        <div className="mt-4">
          <ToolResult tone="danger" message={embedError} />
        </div>
      )}
    </Dialog>
  );
}
