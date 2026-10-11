import { IconButton } from '../../primitives/IconButton';
import type { GuideEntity } from '../../../api/contracts/storyBible';
import { entityColour } from './decorations';
import { voiceNote } from './nearby';
import type { BoothReference } from './sections';
import { DIM_CLASS, ROW_CLASS, SideSection } from './SideSection';

const FIELD = 'text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]';

function Entry({ entry, onOpenEntry }: { entry: GuideEntity; onOpenEntry: (id: string) => void }) {
  const colour = entityColour(entry.category);
  const summary = entry.description.text.trim();
  const isCharacter = entry.category.toLowerCase() === 'character';
  const voice = voiceNote(entry);
  const names = [
    { text: entry.canonical_name, ipa: entry.pronunciation.ipa },
    ...entry.aliases.map((alias) => ({ text: alias.text, ipa: alias.pronunciation.ipa })),
  ];
  return (
    <div className="flex flex-col gap-2" data-ref="entry">
      <div className="flex items-center gap-2">
        <b>{entry.canonical_name}</b>
        <span
          className="rounded-full px-2 text-xs"
          style={{ background: `var(${colour}-soft, var(--surface-muted))`, color: `var(${colour}-text, var(${colour}))` }}
        >
          {entry.category}
        </span>
        <span className="flex-1" />
        <IconButton action="openInStoryBible" size="sm" onClick={() => onOpenEntry(entry.id)} />
      </div>
      <div className={`text-sm whitespace-pre-wrap ${summary ? '' : 'text-[var(--text-muted)]'}`}>{summary || '—'}</div>
      {isCharacter ? (
        <div className="flex flex-col gap-0.5">
          <span className={FIELD}>How they talk</span>
          <div className={`text-sm whitespace-pre-wrap ${voice ? '' : 'text-[var(--text-muted)]'}`}>{voice || '—'}</div>
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <span className={FIELD}>Names</span>
        {names.map((name) => (
          <div className={ROW_CLASS} key={name.text}>
            <span className="flex-1">{name.text}</span>
            <span className="font-mono text-xs">{name.ipa || '—'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** What was clicked in the text: the Story Bible entry and/or the note on a marked word. Read-only; the entry opens in the Story Bible. */
export function Reference({ reference, onOpenEntry }: { reference: BoothReference | null; onOpenEntry: (id: string) => void }) {
  if (!reference || (!reference.entry && !reference.note)) return null;
  const { entry, note } = reference;
  return (
    <SideSection title="Reference" id="booth-reference">
      {entry ? <Entry entry={entry} onOpenEntry={onOpenEntry} /> : null}
      {note ? (
        <div className="flex flex-col gap-1.5" data-ref="note">
          <div className="flex items-baseline gap-2">
            <b>{note.name}</b>
            <span className={DIM_CLASS}>“{note.quote}”</span>
          </div>
          {note.messages.map((message, index) => (
            <div className="text-sm" key={index}>
              {message.who ? <span className={DIM_CLASS}>{message.who}: </span> : null}
              {message.text}
            </div>
          ))}
        </div>
      ) : null}
    </SideSection>
  );
}
