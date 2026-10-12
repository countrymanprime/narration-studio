import { useEffect, useState } from 'react';
import { overlay } from '../../../../../overlay/overlayService';
import { Button } from '../../../../primitives/Button';
import { IconButton } from '../../../../primitives/IconButton';
import { InsetCard } from '../../../../primitives/InsetCard';
import { SectionLabel } from '../../../../primitives/SectionLabel';
import { StatusBadge } from '../../../../primitives/StatusBadge';
import { TextField } from '../../../../primitives/TextField';
import { PronSourceTag } from '../../../../storybible/source/PronSourceTag';
import { usePronunciationSources } from '../../../../storybible/source/usePronunciationSources';
import { useScriptCommands, useScriptPrep } from '../../data/useScriptData';
import type { LineRange } from '../../data/scriptCommands';
import { DefinitionBlock } from './DefinitionBlock';
import { ExternalLinks } from './ExternalLinks';
import { statusLabel, statusTone } from './wordStatus';
import type { WordsHost } from './wordsHost';

/**
 * One word: its status, how I will say it with the source it came from, the definition from the chosen source, the fixed web look-ups and
 * "Add to my words" for a word the chapter has no flag for. Hear and Record are toasts, as in the mock: there is no clip to play.
 */
export function WordCard({ word, host, selection }: { word: string; host: WordsHost; selection?: LineRange }) {
  const prep = useScriptPrep();
  const commands = useScriptCommands();
  const { sources } = usePronunciationSources();
  const status = prep.pronStatus(word);
  const saved = prep.pronOfWord(word);
  const [say, setSay] = useState(saved.say);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setSay(saved.say), [saved.say]);

  const save = async (value: string, source?: string) => {
    const own = (id: string | undefined) => !id || id === 'manual';
    if (value.trim() === saved.say && (source === saved.source || (own(source) && own(saved.source)))) return;
    setBusy(true);
    try {
      await commands.saveSay(word, value, source);
    } finally {
      setBusy(false);
    }
  };

  const pick = async (id: string) => {
    setNote('');
    const source = sources.find((row) => row.id === id);
    if (!source) return;
    if (source.kind === 'manual') return void (await save(say, 'manual'));
    const candidate = await host.candidate(word, id);
    if (!candidate.ok) return setNote(candidate.reason);
    setSay(candidate.say);
    await save(candidate.say, id);
  };

  return (
    <InsetCard fill className="space-y-3" aria-label={`Word: ${word}`} role="group">
      <div className="flex items-center gap-2">
        <h3 className="m-0 text-base font-semibold">{word}</h3>
        <StatusBadge tone={statusTone(status)} label={statusLabel(status)} />
        <span className="flex-1" />
        <IconButton action="hear" onClick={() => overlay.toast(`Playing “${word}” reference clip`)} />
        <IconButton action="record" onClick={() => overlay.toast('Recording your own pronunciation')} />
      </div>
      <div className="flex items-center gap-2">
        <SectionLabel>How I will say it</SectionLabel>
        <span className="flex-1" />
        <PronSourceTag src={saved.source} sources={sources} word={word} onPick={(id) => void pick(id)} disabled={busy} />
      </div>
      <div className="flex items-center gap-2">
        <TextField
          label="How I will say it"
          mono
          placeholder="for example: kroh-KAY"
          value={say}
          onChange={setSay}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void save(say, 'manual');
          }}
        />
        <Button variant="secondary" pending={busy} onClick={() => void save(say, 'manual')}>
          Save
        </Button>
      </div>
      {note && (
        <p role="status" className="m-0 text-xs text-[var(--text-muted)]">
          {note}
        </p>
      )}
      <DefinitionBlock word={word} source={host.definitionSource} host={host} onUse={(value, id) => void (setSay(value), save(value, id))} />
      <SectionLabel as="div">Look up on the web</SectionLabel>
      <ExternalLinks word={word} open={(source, w) => void host.openLookup(source, w)} />
      {status === 'not_flagged' && selection && (
        <div>
          <IconButton action="add" label="Add to my words" onClick={() => void commands.flagWord(selection)} />
        </div>
      )}
    </InsetCard>
  );
}
