import { Fragment, useCallback, useEffect, useState, type ReactNode } from 'react';
import { useApi } from '../../api/ApiContext';
import { describeApiError } from '../../api/errorMessage';
import { useChapterSync } from '../../hooks/useChapterSync';
import type { ChapterSyncPreview } from '../../api/contracts/chapterSync';
import type { TrackMapping } from '../../api/contracts/chapterTrackMap';
import type { Track } from '../../types';
import type { Notify } from '../primitives/Toast';
import { retryAction } from '../primitives/Toast';
import { useChapterLinkActions } from '../chapterTracks/useChapterLinkActions';
import { Button } from '../primitives/Button';
import { IconButton } from '../primitives/IconButton';
import { Panel } from '../primitives/Panel';
import { InsetCard } from '../primitives/InsetCard';
import { SectionLabel } from '../primitives/SectionLabel';
import { TrackSelect } from '../mapping/TrackSelect';
import { plainTrackChoices, rankedChoices, type TrackChoice } from '../mapping/trackChoices';
import { useChapterTrackState } from '../chapterTracks/ChapterTrackState';
import { useChapterNameOf } from '../chapterTracks/useChapterNameOf';
import { StatusBadge } from '../primitives/StatusBadge';
import {
  chapterSyncBackgroundWaitText,
  chapterSyncPanelNotChaptersText,
  chapterSyncPanelReasonText,
  chapterSyncSummaryFacts,
  type ChapterSyncDaw,
} from './chapterSyncText';

/**
 * Chapter sync's own section of the engine panel the on/off state and last-sync summary, the Needs you list with an inline Link
 * (chapterTrackSet, the same binding as Chapter links below), and the tracks sync could not place. The Sync activity log is in
 * Settings (Recording & DAW › Advanced). Nothing here shows before the consent dialog has been answered (`ask`) - that is the narrator's first
 * decision, not a second copy of it here. `daw` is the DAW the project records with, which its text names.
 */
export function ChapterSyncPanel({
  notify,
  onChanged,
  daw,
  layout,
  onLayoutShown,
}: {
  notify: Notify;
  onChanged: () => void;
  daw: ChapterSyncDaw;
  /** The project's chapter layout control (docs/research/mockups/booth-voices/), drawn as the card's Layout row in both states. */
  layout?: ReactNode;
  /** Whether this card is drawing `layout`, so the Voices card draws it instead while Chapter sync shows nothing. */
  onLayoutShown?: (shown: boolean) => void;
}) {
  const api = useApi();
  const actions = useChapterLinkActions();
  const state = useChapterSync(api);
  // The picker offers every track of the project, each labelled with the chapter that holds it, as the other pickers do (owner answer 2 on #3398):
  // the shared state's tracks and links, so a link made elsewhere shows here, and the names the manuscript's current headings.
  const [preview, setPreview] = useState<ChapterSyncPreview>();
  // Read only while there is a Needs-you list to pick from, and never for another DAW's project.
  const trackState = useChapterTrackState({ enabled: daw.daw === 'REAPER', when: (preview?.needsYou.length ?? 0) > 0 });
  // The picker's "(linked to X)" and the sentence after a Link name a chapter by the same current heading.
  const nameOf = useChapterNameOf(Boolean(preview?.needsYou.length));
  const [toggling, setToggling] = useState(false);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [linkingChapterId, setLinkingChapterId] = useState('');

  // Reading the preview changes nothing, so a failed read is an error toast with Retry (issue #2919).
  const loadPreview = useCallback(async (): Promise<void> => {
    try {
      setPreview(await api.chapterSyncPreview());
    } catch (error) {
      notify(
        describeApiError(error),
        'error',
        retryAction(() => void loadPreview()),
      );
    }
  }, [api, notify]);

  useEffect(() => {
    if (state?.consent === 'on' && state.project === 'ready') void loadPreview();
  }, [state?.consent, state?.project, state?.lastSync, loadPreview]);

  const drawn = Boolean(state && state.project === 'ready' && state.consent !== 'undecided');
  const hasLayout = Boolean(layout);
  useEffect(() => {
    onLayoutShown?.(drawn && hasLayout);
  }, [drawn, hasLayout, onLayoutShown]);

  if (!state || !drawn) return null;

  const toggle = async (on: boolean) => {
    setToggling(true);
    try {
      await api.chapterSyncSetEnabled(on);
      onChanged();
    } catch (error) {
      notify(describeApiError(error), 'error');
    } finally {
      setToggling(false);
    }
  };

  // The on/off button is in the card's header in both states, so it never moves and the card keeps its header (alignment audit ENX-8).
  const toggleButton = (on: boolean) => (
    <IconButton
      action={on ? 'turnOn' : 'turnOff'}
      label={on ? 'Turn on chapter sync' : 'Turn off chapter sync'}
      pending={toggling}
      onClick={() => void toggle(on)}
    />
  );

  if (state.consent === 'off') {
    return (
      <Panel title="Chapter sync" actions={toggleButton(true)}>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Chapter sync is off.
        </p>
        {layout && (
          <div className="mt-2">
            <SyncFacts rows={[{ label: 'Layout', value: layout }]} />
          </div>
        )}
      </Panel>
    );
  }

  const link = async (chapterId: string, trackGuid: string) => {
    if (!trackGuid) return;
    setLinkingChapterId(chapterId);
    try {
      // A track another chapter holds moves to this one, so say whose link went (#3053), as the Chapter links list does.
      const { linkedNotice } = await actions.set(chapterId, trackGuid, nameOf);
      notify(linkedNotice);
      await loadPreview();
      onChanged();
    } catch (error) {
      notify(describeApiError(error), 'error');
    } finally {
      setLinkingChapterId('');
    }
  };

  const notChapters = preview ? chapterSyncPanelNotChaptersText(preview.unmatched, preview.pickupTracks) : '';
  const notChaptersCount = preview ? preview.unmatched.length + preview.pickupTracks.length : 0;

  const facts = chapterSyncSummaryFacts({
    lastSync: state.lastSync,
    projectFile: state.projectFile,
    chapters: state.chapters,
    linked: state.counts.linked,
    daw,
  });
  const background = chapterSyncBackgroundWaitText(state.background, daw.daw);

  // One fact per row, label beside value (R3EN2-3): the status, when and from what it last synced, the links, background checks while they
  // wait, and the tracks it found that are not chapters, which used to be a second column under a rule.
  return (
    <Panel title="Chapter sync" actions={toggleButton(false)}>
      <SyncFacts
        rows={[
          { label: 'Status', value: <StatusBadge tone="success" label="On" /> },
          ...(layout ? [{ label: 'Layout', value: layout }] : []),
          { label: 'Last synced', value: facts.synced },
          { label: 'Links', value: facts.links },
          ...(background ? [{ label: 'Background checks', value: background }] : []),
          ...(notChapters ? [{ label: `Not chapters (${notChaptersCount})`, value: <span className="[overflow-wrap:anywhere]">{notChapters}</span> }] : []),
        ]}
      />
      {/* Only REAPER's heartbeat carries an edit count, and the line names REAPER. */}
      {state.unsavedEdits && daw.daw === 'REAPER' && (
        <p role="status" className="mt-2 text-sm" style={{ color: 'var(--warn-text)' }}>
          REAPER has changes that aren&rsquo;t saved yet. Sync reads the saved project, so it picks them up when you save.
        </p>
      )}
      {preview && preview.needsYou.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
          <SectionLabel as="h3">Needs you ({preview.needsYou.length})</SectionLabel>
          {preview.needsYou.map((item) => {
            const fallback = item.best?.trackGuid ?? item.candidates[0]?.trackGuid ?? '';
            const choices = syncChoices(item, trackState.project?.tracks, trackState.mappings, nameOf);
            // A pick (or suggestion) whose track the picker does not offer is no pick: the select shows its placeholder and Link waits.
            const wanted = picked[item.chapterId] ?? fallback;
            const selected = choices.some((choice) => choice.guid === wanted) ? wanted : '';
            return (
              <InsetCard key={item.chapterId} tone="accent" className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{nameOf(item.chapterId) ?? item.chapterTitle}</div>
                  <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {chapterSyncPanelReasonText(item)}
                  </div>
                </div>
                {choices.length > 0 && (
                  <div className="flex w-full min-w-0 items-center gap-2">
                    <TrackSelect
                      label={`Track for ${nameOf(item.chapterId) ?? item.chapterTitle}`}
                      choices={choices}
                      fullWidth
                      value={selected}
                      onChange={(value) => setPicked((current) => ({ ...current, [item.chapterId]: value }))}
                    />
                    <Button
                      pending={linkingChapterId === item.chapterId}
                      disabledReason={selected ? '' : 'Choose a track for this chapter first.'}
                      onClick={() => void link(item.chapterId, selected)}
                    >
                      Link
                    </Button>
                  </div>
                )}
              </InsetCard>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// Chapter sync's facts as label and value rows on one grid: the labels muted in their own column, so status and a background wait no longer
// read as one grey run-on line.
function SyncFacts({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1.5 text-sm">
      {rows.map((row) => (
        <Fragment key={row.label}>
          <dt style={{ color: 'var(--text-muted)' }}>{row.label}</dt>
          <dd className="m-0 min-w-0">{row.value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

/**
 * What the sync panel's picker offers for a chapter: the sync's own candidates first, its best match under "Best match", then every other track of
 * the project; each track another chapter holds says so. Before the tracks have been read it offers the candidates alone, as the sync named them.
 */
function syncChoices(
  item: ChapterSyncPreview['needsYou'][number],
  tracks: readonly Track[] | undefined,
  mappings: readonly TrackMapping[],
  nameOf: (chapterId: string) => string | undefined,
): TrackChoice[] {
  // The project's tracks once read; before that (or when unreadable) the candidates the sync named, as tracks, so the same labels apply.
  const listed =
    tracks && tracks.length > 0
      ? tracks
      : item.candidates.map((c) => ({ guid: c.trackGuid, name: c.trackName, index: c.trackIndex, depth: 0, isFolder: false, items: [] }) as unknown as Track);
  const best = item.best?.trackGuid ?? item.candidates[0]?.trackGuid ?? null;
  return rankedChoices(
    plainTrackChoices(listed, mappings, item.chapterId, nameOf),
    item.candidates.map((candidate) => candidate.trackGuid),
    best,
  );
}
