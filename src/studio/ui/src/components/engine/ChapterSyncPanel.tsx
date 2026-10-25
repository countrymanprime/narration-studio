import { Fragment, useCallback, useEffect, useState, type ReactNode } from 'react';
import { useApi } from '../../api/ApiContext';
import { describeApiError } from '../../api/errorMessage';
import { useChapterSync } from '../../hooks/useChapterSync';
import type { ChapterSyncPreview } from '../../api/contracts/chapterSync';
import type { Notify } from '../primitives/Toast';
import { Button } from '../primitives/Button';
import { Panel } from '../primitives/Panel';
import { InsetCard } from '../primitives/InsetCard';
import { SectionLabel } from '../primitives/SectionLabel';
import { Select } from '../primitives/Select';
import { StatusBadge } from '../primitives/StatusBadge';
import { chapterSyncBackgroundWaitText, chapterSyncPanelNotChaptersText, chapterSyncPanelReasonText, chapterSyncSummaryFacts } from './chapterSyncText';

/**
 * Chapter sync's own section of the engine panel the on/off state and last-sync summary, the Needs you list with an inline Link
 * (chapterTrackSet, the same binding as Chapter links below), and the tracks sync could not place. The Sync activity log is in
 * Settings (Recording & DAW › Advanced). Nothing here shows before the consent dialog has been answered (`ask`) - that is the narrator's first
 * decision, not a second copy of it here.
 */
export function ChapterSyncPanel({ notify, onChanged }: { notify: Notify; onChanged: () => void }) {
  const api = useApi();
  const state = useChapterSync(api);
  const [preview, setPreview] = useState<ChapterSyncPreview>();
  const [toggling, setToggling] = useState(false);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [linkingChapterId, setLinkingChapterId] = useState('');

  const loadPreview = useCallback(async () => {
    try {
      setPreview(await api.chapterSyncPreview());
    } catch (error) {
      notify(describeApiError(error), 'error');
    }
  }, [api, notify]);

  useEffect(() => {
    if (state?.consent === 'on' && state.project === 'ready') void loadPreview();
  }, [state?.consent, state?.project, state?.lastSync, loadPreview]);

  if (!state || state.project !== 'ready' || state.consent === 'undecided') return null;

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
    <Button variant="secondary" pending={toggling} onClick={() => void toggle(on)}>
      {on ? 'Turn on' : 'Turn off'}
    </Button>
  );

  if (state.consent === 'off') {
    return (
      <Panel title="Chapter sync" actions={toggleButton(true)}>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Chapter sync is off.
        </p>
      </Panel>
    );
  }

  const link = async (chapterId: string, fallbackTrackGuid: string) => {
    const trackGuid = picked[chapterId] ?? fallbackTrackGuid;
    if (!trackGuid) return;
    setLinkingChapterId(chapterId);
    try {
      await api.chapterTrackSet(chapterId, trackGuid);
      notify('Track linked.');
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

  const facts = chapterSyncSummaryFacts({ lastSync: state.lastSync, projectFile: state.projectFile, chapters: state.chapters, linked: state.counts.linked });
  const background = chapterSyncBackgroundWaitText(state.background);

  // One fact per row, label beside value (R3EN2-3): the status, when and from what it last synced, the links, background checks while they
  // wait, and the tracks it found that are not chapters, which used to be a second column under a rule.
  return (
    <Panel title="Chapter sync" actions={toggleButton(false)}>
      <SyncFacts
        rows={[
          { label: 'Status', value: <StatusBadge tone="success" label="On" /> },
          { label: 'Last synced', value: facts.synced },
          { label: 'Links', value: facts.links },
          ...(background ? [{ label: 'Background checks', value: background }] : []),
          ...(notChapters ? [{ label: `Not chapters (${notChaptersCount})`, value: <span className="[overflow-wrap:anywhere]">{notChapters}</span> }] : []),
        ]}
      />
      {state.unsavedEdits && (
        <p role="status" className="mt-2 text-sm" style={{ color: 'var(--warn-text)' }}>
          REAPER has changes that aren&rsquo;t saved yet. Sync reads the saved project, so it picks them up when you save.
        </p>
      )}
      {preview && preview.needsYou.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
          <SectionLabel as="h3">Needs you ({preview.needsYou.length})</SectionLabel>
          {preview.needsYou.map((item) => {
            const fallback = item.best?.trackGuid ?? item.candidates[0]?.trackGuid ?? '';
            const selected = picked[item.chapterId] ?? fallback;
            return (
              <InsetCard key={item.chapterId} tone="accent" className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{item.chapterTitle}</div>
                  <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {chapterSyncPanelReasonText(item)}
                  </div>
                </div>
                {item.candidates.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Select
                      label={`Track for ${item.chapterTitle}`}
                      value={selected}
                      onChange={(value) => setPicked((current) => ({ ...current, [item.chapterId]: value }))}
                      options={item.candidates.map((candidate) => ({ value: candidate.trackGuid, label: candidate.trackName }))}
                    />
                    <Button pending={linkingChapterId === item.chapterId} disabled={!selected} onClick={() => void link(item.chapterId, fallback)}>
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
