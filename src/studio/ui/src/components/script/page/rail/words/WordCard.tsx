import { overlay } from '../../../../../overlay/overlayService';
import { hearNameAction } from '../../../../../icons.catalog';
import { Button } from '../../../../primitives/Button';
import { Icon } from '../../../../primitives/Icon';
import { IconButton } from '../../../../primitives/IconButton';
import { InsetCard } from '../../../../primitives/InsetCard';
import { SectionLabel } from '../../../../primitives/SectionLabel';
import { StatusBadge } from '../../../../primitives/StatusBadge';
import type { Notify } from '../../../../primitives/Toast';
import { NamePronunciation, NAMES_GRID } from '../../../../storybible/source/NamePronunciation';
import { usePronunciationSources } from '../../../../storybible/source/usePronunciationSources';
import { wordKey } from '../../data/script.selectors';
import type { LineRange } from '../../data/scriptCommands';
import { useEntries, useScriptCommands } from '../../data/useScriptData';
import { useScriptHear } from '../../data/useScriptHear';
import { DefinitionBlock } from './DefinitionBlock';
import { ExternalLinks } from './ExternalLinks';
import { statusLabel, statusTone, type WordStatus } from './wordStatus';
import type { WordsHost } from './wordsHost';

const NO_PRONUNCIATION_REASON = 'No pronunciation exists for this name yet.';
const NOT_A_WORD_REASON = 'Add it to your words first.';

/**
 * One word: its status, how I will say it, the definition from the chosen source, the fixed web look-ups and "Add to my words" for a word no
 * Story Bible entry names. How it is said is the Story Bible name's own pronunciation (#2595), shown and edited through the Story Bible's row
 * (`NamePronunciation`) and its journalled commands, so the two pages cannot disagree. Record is a toast, as in the mock: there is no clip.
 */
export function WordCard({ word, host, selection }: { word: string; host: WordsHost; selection?: LineRange }) {
  const entries = useEntries();
  const commands = useScriptCommands();
  const sources = usePronunciationSources();
  const hearOf = useScriptHear();
  const name = entries.nameByKey(wordKey(word));
  const entry = name ? entries.entryById(name.entryId) : undefined;
  const status: WordStatus = name?.status ?? 'not_flagged';
  const hear = name && hearOf(name.entryId, status === 'set', name.aliasIndex);
  const toast: Notify = (text, tone) => overlay.toast(text, tone ? { tone } : undefined);

  return (
    <InsetCard fill className="space-y-3" aria-label={`Word: ${name?.name ?? word}`} role="group">
      <div className="flex items-center gap-2">
        <h3 className="m-0 text-base font-semibold">{name?.name ?? word}</h3>
        <StatusBadge tone={statusTone(status)} label={statusLabel(status)} />
        <span className="flex-1" />
        <IconButton
          action={hearNameAction(hear?.playing)}
          label={`${hear?.playing ? 'Stop' : 'Hear'} ${name?.name ?? word}`}
          aria-pressed={hear?.playing}
          pending={hear?.loading}
          onClick={hear?.onPress}
          disabledReason={hear ? undefined : name ? NO_PRONUNCIATION_REASON : NOT_A_WORD_REASON}
        />
        <IconButton action="record" onClick={() => overlay.toast('Recording your own pronunciation')} />
      </div>
      {name && entry && (
        <div className="@container">
          <div role="group" aria-label="How I will say it" className={`${NAMES_GRID.shared} ${NAMES_GRID.edit}`}>
            <NamePronunciation
              entityId={entry.id}
              row={{ name: name.name, aliasIndex: name.aliasIndex, pronunciation: name.pronunciation }}
              editing
              locked={entry.locked}
              sources={sources}
              reload={async () => undefined}
              notify={toast}
              primary
            />
          </div>
        </div>
      )}
      <DefinitionBlock
        word={word}
        source={host.definitionSource}
        host={host} // An answer from the definition source is the narrator's own value, as the Story Bible's "Use this" saves it.
        onUse={name ? (value) => void commands.pronounceName(name, value) : undefined}
      />
      <SectionLabel as="div">Look up on the web</SectionLabel>
      <ExternalLinks word={word} open={(source, w) => void host.openLookup(source, w)} />
      {!name && selection && (
        // A labelled button, not a lone `+` under the look-ups that reads as one of them (XSC-12).
        <Button variant="secondary" size="sm" onClick={() => void commands.addWord(selection)}>
          <Icon name="add" />
          Add to my words
        </Button>
      )}
    </InsetCard>
  );
}
