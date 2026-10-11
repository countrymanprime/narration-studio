import type { NearbyVoice } from './nearby';
import { DIM_CLASS, ROW_CLASS, SideSection } from './SideSection';

/** The speakers in and around the current phrase, each with the Story Bible's note on how they talk. */
export function VoicesNearby({ voices }: { voices: readonly NearbyVoice[] }) {
  return (
    <SideSection title="Voices in this scene">
      {voices.length ? (
        voices.map((voice) => (
          <div className={ROW_CLASS} key={voice.id}>
            <span className="flex flex-col gap-0.5">
              {voice.aliases.map((alias) => (
                <span className="rounded-full bg-[var(--surface-muted)] px-2 text-xs" key={alias} data-speaker={alias}>
                  {alias}
                </span>
              ))}
            </span>
            <span className="flex-1">{voice.voice || 'No voice note yet'}</span>
          </div>
        ))
      ) : (
        <div className={DIM_CLASS}>No one speaks nearby.</div>
      )}
    </SideSection>
  );
}
