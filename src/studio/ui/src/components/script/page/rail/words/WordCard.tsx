import { useState } from 'react';
import { overlay } from '../../../../../overlay/overlayService';
import { hearNameAction } from '../../../../../icons.catalog';
import { Button } from '../../../../primitives/Button';
import { IconButton } from '../../../../primitives/IconButton';
import { InsetCard } from '../../../../primitives/InsetCard';
import { SectionLabel } from '../../../../primitives/SectionLabel';
import { StatusBadge } from '../../../../primitives/StatusBadge';
import type { Notify } from '../../../../primitives/Toast';
import { NamePronunciation, NAMES_GRID } from '../../../../storybible/source/NamePronunciation';
import { CandidatesCheckAgain, PronunciationCandidateList, usePronunciationCandidates } from '../../../../storybible/source/PronunciationCandidates';
import { USER_DICTIONARY_MAX_SAY as MAX_SAY } from '../../../../../api/contracts/pronunciationSources';
import { TextField } from '../../../../primitives/TextField';
import { RailFieldRow } from '../RailOptionRow';
import { usePronunciationSources } from '../../../../storybible/source/usePronunciationSources';
import { wordKey } from '../../data/script.selectors';
import { useEntries, useScriptCommands } from '../../data/useScriptData';
import { useScriptHear } from '../../data/useScriptHear';
import { DefinitionBlock } from './DefinitionBlock';
import { ExternalLinks } from './ExternalLinks';
import { statusLabel, statusTone } from './wordStatus';
import type { WordsHost } from './wordsHost';

const NO_PRONUNCIATION_REASON = 'No pronunciation exists for this name yet.';

/**
 * One word (#2595). A Story Bible name (a character, place, item…) is its entry's record: How I will say it is the Story Bible's own row
 * (`NamePronunciation`), with the dictionaries' candidates to pick from, so the two pages cannot disagree. Any other word is never written
 * to the Story Bible: the card shows what the dictionaries say, each with its source and Hear, and only when none has it, Save to my
 * dictionary. Then the definition and the web look-ups. Record is a toast, as in the mock: there is no clip.
 */
export function WordCard({ word, host }: { word: string; host: WordsHost }) {
  const entries = useEntries();
  const commands = useScriptCommands();
  const sources = usePronunciationSources();
  const hearOf = useScriptHear();
  const name = entries.nameByKey(wordKey(word));
  const entry = name ? entries.entryById(name.entryId) : undefined;
  const hear = name && hearOf(name.entryId, name.status === 'set', name.aliasIndex);
  const lookup = usePronunciationCandidates(word, !name);
  const toast: Notify = (text, tone) => overlay.toast(text, tone ? { tone } : undefined);

  return (
    <InsetCard fill className="space-y-3" aria-label={`Word: ${name?.name ?? word}`} role="group">
      <div className="flex items-center gap-2">
        <h3 className="m-0 text-base font-semibold">{name?.name ?? word}</h3>
        {name && <StatusBadge tone={statusTone(name.status)} label={statusLabel(name.status)} />}
        {/* A locked entry's row cannot be changed here or in the Story Bible until it is unlocked there. */}
        {entry?.locked && <StatusBadge tone="neutral" label="Locked" />}
        <span className="flex-1" />
        {name && (
          <IconButton
            action={hearNameAction(hear?.playing)}
            label={`${hear?.playing ? 'Stop' : 'Hear'} ${name.name}`}
            aria-pressed={hear?.playing}
            pending={hear?.loading}
            onClick={hear?.onPress}
            disabledReason={hear ? undefined : NO_PRONUNCIATION_REASON}
          />
        )}
        {name && <IconButton action="record" onClick={() => overlay.toast('Recording your own pronunciation')} />}
      </div>
      {name && entry && (
        <div className="@container space-y-1.5">
          <SectionLabel as="div" id="word-say-label">
            How I will say it
          </SectionLabel>
          <div role="group" aria-labelledby="word-say-label" className={`${NAMES_GRID.shared} ${NAMES_GRID.edit}`}>
            <NamePronunciation
              entityId={entry.id}
              row={{ name: name.name, aliasIndex: name.aliasIndex, pronunciation: name.pronunciation }}
              editing
              locked={entry.locked}
              sources={sources}
              reload={async () => undefined}
              notify={toast}
              primary
              showName={false}
            />
          </div>
        </div>
      )}
      {!name && (
        <div className="space-y-1.5" aria-busy={lookup.status === 'loading' || undefined}>
          <SectionLabel as="div">From the dictionaries</SectionLabel>
          {lookup.status === 'error' ? (
            <CandidatesCheckAgain view={lookup} />
          ) : lookup.status === 'ready' && lookup.answer.candidates.length === 0 ? (
            <SaveToMyDictionary word={word} onSave={(say) => commands.saveToMyDictionary(word, say)} />
          ) : (
            <PronunciationCandidateList
              word={word}
              candidates={lookup.answer.candidates}
              onRemove={(candidate) => void commands.removeFromMyDictionary(word, candidate.say)}
            />
          )}
        </div>
      )}
      <DefinitionBlock
        word={word}
        source={host.definitionSource}
        host={host}
        // An answer from the definition source is the narrator's own value for a Story Bible name, as the Story Bible's "Use this" saves it.
        onUse={name ? (value) => void commands.pronounceName(name, value) : undefined}
      />
      <SectionLabel as="div">Look up on the web</SectionLabel>
      <ExternalLinks word={word} open={(source, w) => void host.openLookup(source, w)} />
    </InsetCard>
  );
}

/** A word no dictionary has: how the narrator says it, saved to their own dictionary (never the Story Bible). */
function SaveToMyDictionary({ word, onSave }: { word: string; onSave: (say: string) => Promise<boolean> }) {
  const [say, setSay] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!say.trim() || busy) return;
    setBusy(true);
    try {
      if (await onSave(say)) setSay('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <RailFieldRow
      field={
        <TextField
          label={`Pronunciation of ${word} for my dictionary`}
          mono
          maxLength={MAX_SAY}
          value={say}
          onChange={setSay}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void save();
          }}
        />
      }
      action={
        <Button variant="secondary" pending={busy} disabled={!say.trim()} onClick={() => void save()}>
          Save to my dictionary
        </Button>
      }
    />
  );
}
