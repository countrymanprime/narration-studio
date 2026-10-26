import { Fragment } from 'react';
import type { ComingUpWord } from './nearby';
import { DIM_CLASS, SideSection } from './SideSection';

/**
 * Names in the next phrases with how each is said, so none is a surprise mid-take. One grid for all the rows, so every pronunciation
 * starts in one column and sits on its name's baseline (alignment audit XBO-23).
 */
export function ComingUp({ words }: { words: readonly ComingUpWord[] }) {
  return (
    <SideSection title="Coming up">
      {words.length ? (
        <div data-coming-up="" className="grid grid-cols-[max-content_minmax(0,1fr)_auto] items-baseline gap-x-2 gap-y-1.5">
          {words.map((word) => (
            <Fragment key={word.word}>
              <b>{word.word}</b>
              <span className="font-mono text-xs">{word.say || '—'}</span>
              <span className={DIM_CLASS}>{word.set ? 'set' : 'not set'}</span>
            </Fragment>
          ))}
        </div>
      ) : (
        <div className={DIM_CLASS}>No marked words ahead.</div>
      )}
    </SideSection>
  );
}
