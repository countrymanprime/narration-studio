import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExtractionImportPlan, ImportFormat } from '../../../../api/contracts/extraction';
import { overlay } from '../../../../overlay/overlayService';
import { usePort } from '../../../../ports/usePort';
import { useJournal } from '../../../../studio/StudioProvider';
import { Button } from '../../../primitives/Button';
import { IconButton } from '../../../primitives/IconButton';
import { StatusBadge } from '../../../primitives/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../primitives/Table';
import { ToggleGroup } from '../../../primitives/ToggleGroup';
import { importEntries } from './commands';
import {
  ACTION_LABEL,
  IMPORT_MAX_BYTES,
  LIST_CAP,
  addLabel,
  becomes,
  countsOf,
  displayName,
  hintFromName,
  readableFailure,
  tooBigSentence,
} from './importModel';
import { useImportPreview } from './useImportPreview';
import { useImportPrompts } from './useImportPrompts';

const MUTED = { color: 'var(--text-muted)' };
const DANGER = { color: 'var(--danger-text)' };
const FORMATS = [
  { value: 'json', label: 'JSON' },
  { value: 'csv', label: 'CSV' },
] as const;

function copy(text: string, done: string): void {
  const failed = () => overlay.toast('Copy failed.', { tone: 'error' });
  try {
    navigator.clipboard.writeText(text).then(() => overlay.toast(done), failed);
  } catch {
    failed();
  }
}

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function More({ hidden, span }: { hidden: number; span: number }) {
  if (hidden <= 0) return null;
  return (
    <TableRow>
      <TableCell colSpan={span} muted>
        and {hidden} more
      </TableCell>
    </TableRow>
  );
}

function Preview({ plan }: { plan: ExtractionImportPlan }) {
  const counts = countsOf(plan);
  return (
    <div className="flex flex-col gap-2">
      <div role="status" className="flex flex-wrap gap-2">
        <StatusBadge tone="success" label={`${counts.add} to add`} />
        <StatusBadge tone="neutral" label={`${counts.merge} to merge`} />
        <StatusBadge tone="neutral" label={`${counts.skip} skipped`} />
        <StatusBadge tone={counts.verify ? 'warning' : 'neutral'} label={`${counts.verify} to verify`} />
        <StatusBadge tone={counts.errors ? 'danger' : 'neutral'} label={`${counts.errors} ${counts.errors === 1 ? 'error' : 'errors'}`} />
      </div>
      {plan.lines.length === 0 && plan.errors.length === 0 && (
        <p className="text-sm" style={MUTED}>
          There are no entries in this file to add.
        </p>
      )}
      {plan.lines.length > 0 && (
        <div className="max-h-64 overflow-auto" role="region" aria-label="What will be added" tabIndex={0}>
          <Table label="What will be added">
            <TableHead sticky>
              <TableRow>
                <TableHeader>Row</TableHeader>
                <TableHeader>What</TableHeader>
                <TableHeader>Action</TableHeader>
                <TableHeader>Becomes</TableHeader>
                <TableHeader>Note</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {plan.lines.slice(0, LIST_CAP).map((line, index) => (
                <TableRow key={`${line.row}-${index}`}>
                  <TableCell numeric>{line.row}</TableCell>
                  <TableCell className="[overflow-wrap:anywhere]">{line.label}</TableCell>
                  <TableCell>{ACTION_LABEL[line.action]}</TableCell>
                  <TableCell>{becomes(line)}</TableCell>
                  <TableCell muted className="[overflow-wrap:anywhere]">
                    {line.note}
                  </TableCell>
                </TableRow>
              ))}
              <More hidden={plan.lines.length - LIST_CAP} span={5} />
            </TableBody>
          </Table>
        </div>
      )}
      {plan.errors.length > 0 && (
        <div className="max-h-64 overflow-auto" role="region" aria-label="Rows with errors" tabIndex={0}>
          <Table label="Rows with errors">
            <TableHead sticky>
              <TableRow>
                <TableHeader>Row</TableHeader>
                <TableHeader>Where</TableHeader>
                <TableHeader>Problem</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {plan.errors.slice(0, LIST_CAP).map((error, index) => (
                <TableRow key={`${error.row}-${index}`}>
                  <TableCell numeric>{error.row || '—'}</TableCell>
                  <TableCell className="[overflow-wrap:anywhere]">{error.where || '—'}</TableCell>
                  <TableCell className="[overflow-wrap:anywhere]">{error.reason}</TableCell>
                </TableRow>
              ))}
              <More hidden={plan.errors.length - LIST_CAP} span={3} />
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export type ImportDialogProps = {
  onClose: () => void;
  /** Called after an import and after its undo, so the page can read the suggestions again. */
  onChanged?: () => void;
};

/**
 * "Import entries" (the mock's ImportDialog): a CSV or JSON file, or a JSON blob from any LLM, previewed by the host and added in one
 * undoable step. The page reads a chosen file as text and sends the text and a format hint, never a name or path (D72); the host
 * does every parse and every number in the preview.
 */
export function ImportDialog({ onClose, onChanged }: ImportDialogProps) {
  const port = usePort('extraction');
  const journal = useJournal();
  const prompts = useImportPrompts();
  const [text, setText] = useState('');
  const [hint, setHint] = useState<ImportFormat>();
  const [fileName, setFileName] = useState('');
  const [fileProblem, setFileProblem] = useState<string>();
  const [showExample, setShowExample] = useState(false);
  const [exampleFormat, setExampleFormat] = useState<ImportFormat>('json');
  const [adding, setAdding] = useState(false);
  const [addProblem, setAddProblem] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const reading = useRef(0);
  const committing = useRef(false);
  const limit = prompts.json?.maxBytes ?? IMPORT_MAX_BYTES;
  // Every character is at least one byte, so text longer than the limit is over it; it never goes to the host.
  const oversize = text.length > limit;
  const { plan, waiting, problem } = useImportPreview(oversize ? '' : text, hint);
  const env = useMemo(() => ({ journal, port, changed: onChanged }), [journal, port, onChanged]);
  const offered = !oversize && text.trim() && plan ? plan.offered : 0;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const example = prompts[exampleFormat]?.example ?? '';

  const choose = async (file: File) => {
    const mine = ++reading.current;
    setFileProblem(undefined);
    if (file.size > limit) {
      setFileProblem(tooBigSentence(limit));
      return;
    }
    try {
      const read = await readText(file);
      // A newer file, or typing, since this one began: its text is not wanted any more.
      if (mine !== reading.current || !alive.current) return;
      if (!read.trim()) {
        setFileProblem(read ? 'That file has only blank space in it.' : 'That file is empty.');
        return;
      }
      setText(read);
      setHint(hintFromName(file.name));
      setFileName(displayName(file.name));
    } catch {
      if (mine === reading.current && alive.current) setFileProblem('That file could not be read.');
    }
  };

  const copyPrompt = () => {
    const format = (text.trim() && plan?.format) || exampleFormat;
    const prompt = prompts[format];
    if (prompt) copy(prompt.prompt, 'Prompt copied. Paste it into your LLM, followed by the manuscript.');
    else overlay.toast('The prompt is not ready yet.', { tone: 'error' });
  };

  const add = async () => {
    if (!offered || waiting || committing.current) return;
    committing.current = true;
    setAdding(true);
    setAddProblem(undefined);
    let failure: string | undefined;
    try {
      const result = await importEntries(env, text, hint);
      if (!result.ok) failure = `Nothing was added: ${result.refusal.reason}`;
    } catch (error) {
      failure = `The import may not have finished (${readableFailure(error, 'the host did not say why')}). Check the Story Bible before adding again.`;
    }
    committing.current = false;
    if (!alive.current) {
      // The dialog was closed while the host worked: a failure has nowhere to be shown but a toast, and there is nothing to close.
      if (failure) overlay.toast(failure, { tone: 'error' });
      return;
    }
    setAdding(false);
    if (failure) setAddProblem(failure);
    else onClose();
  };

  return (
    <div className="flex flex-col gap-3.5">
      <p className="text-sm" style={MUTED}>
        A CSV or JSON file, or a JSON blob from any LLM you ran the manuscript through.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => fileInput.current?.click()}>
          Choose a file…
        </Button>
        {/* native-control-ok: the browser's file picker has no styled equivalent; it stays hidden behind the Choose a file button */}
        <input
          ref={fileInput}
          type="file"
          accept=".csv,.json"
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void choose(file);
          }}
        />
        {fileName && (
          <span className="text-sm [overflow-wrap:anywhere]" style={MUTED}>
            {fileName}
          </span>
        )}
        <span className="flex-1" />
        <IconButton action="copyPrompt" onClick={copyPrompt} />
        <IconButton action={showExample ? 'hideExample' : 'showExample'} aria-pressed={showExample} onClick={() => setShowExample(!showExample)} />
      </div>
      {fileProblem && (
        <p role="alert" className="text-sm" style={DANGER}>
          {fileProblem}
        </p>
      )}
      {showExample && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <ToggleGroup
              label="Example format"
              value={exampleFormat}
              onChange={(value) => setExampleFormat(value as ImportFormat)}
              options={FORMATS}
              look="segmented"
            />
            <span className="flex-1" />
            <IconButton action="copyExample" onClick={() => copy(example, 'Example copied.')} />
          </div>
          <pre
            tabIndex={0}
            aria-label="Format example"
            className="max-h-48 overflow-auto rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg)] p-3 font-mono text-xs [overflow-wrap:anywhere] whitespace-pre-wrap"
          >
            {example}
          </pre>
        </div>
      )}
      {/* native-control-ok: Field's textarea carries a visible label above it; the mock's paste box is named by aria-label alone */}
      <textarea
        aria-label="Paste JSON or CSV"
        placeholder="Or paste JSON (or CSV) here"
        value={text}
        spellCheck={false}
        onChange={(event) => {
          reading.current += 1;
          setText(event.target.value);
          setHint(undefined);
          setFileName('');
        }}
        className="box-border min-h-24 w-full resize-y rounded-[var(--control-radius)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2 font-mono text-xs leading-[1.35] text-[var(--text)]"
      />
      {oversize && (
        <p role="alert" className="text-sm" style={DANGER}>
          {tooBigSentence(limit)}
        </p>
      )}
      {!oversize && text.trim() && waiting && !problem && (
        <p role="status" className="text-sm" style={MUTED}>
          Checking the text with the host…
        </p>
      )}
      {problem && (
        <p role="alert" className="text-sm" style={DANGER}>
          The preview could not be made: {problem}
        </p>
      )}
      {text.trim() && plan && <Preview plan={plan} />}
      {addProblem && (
        <p role="alert" className="text-sm" style={DANGER}>
          {addProblem}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => void add()} pending={adding} disabled={!offered || waiting}>
          {addLabel(offered)}
        </Button>
      </div>
    </div>
  );
}
