import type { ComingUpWord } from './nearby';
import { DIM_CLASS, ROW_CLASS, SideSection } from './SideSection';

/** Names in the next phrases with how each is said, so none is a surprise mid-take. */
export function ComingUp({ words }: { words: readonly ComingUpWord[] }) {
  return (
    <SideSection title="Coming up">
      {words.length ? (
        words.map((word) => (
          <div className={ROW_CLASS} key={word.word}>
            <b>{word.word}</b>
            <span className="flex-1 font-mono text-xs">{word.say || '—'}</span>
            <span className={DIM_CLASS}>{word.set ? 'set' : 'not set'}</span>
          </div>
        ))
      ) : (
        <div className={DIM_CLASS}>No marked words ahead.</div>
      )}
    </SideSection>
  );
}
