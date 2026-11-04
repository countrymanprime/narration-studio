import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { useApi } from '../../api/ApiContext';
import { Button } from '../primitives/Button';
import { InsetCard } from '../primitives/InsetCard';
import { Panel } from '../primitives/Panel';
import { SlideOver } from '../primitives/SlideOver';
import type { Notify } from '../primitives/Toast';
import { useStageRecommendations } from '../stages/useStageRecommendations';
import { AudacityLinkCard } from './AudacityLinkCard';
import { CheckLine } from '../layout/CheckLine';
import { ChapterLinksTable } from './ChapterLinksTable';
import { ChapterSyncPanel } from './ChapterSyncPanel';
import { TrackList } from './TrackList';
import { LayoutToggle, VoicesCard } from './VoicesCard';
import { VoiceLayoutContext } from './voiceLayout';
import { useVoiceTracks } from './useVoiceTracks';
import { DAW_TOOL_GROUPS } from './dawTools';
import { DawToolsMenu } from './DawToolsMenu';
import { useChapterLinks } from './useChapterLinks';
import { useAudacityLink } from './useAudacityLink';
import { useLiveTracks } from './useLiveTracks';
import { LiveTracksRefresh, LiveTracksStatus } from './LiveTracksStatus';
import type { Track, TracksDiscovery, TracksProject } from '../../types';

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

// The folder a file is in, as the path writes it (no trailing separator).
function folderOf(path: string): string {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return cut > 0 ? path.slice(0, cut) : '';
}

const NO_TRACKS: Track[] = [];

export type EngineLinkState = {
  dawFileLinked: boolean;
  /** Whether a live REAPER heartbeat has been seen recently; false also covers "unknown". */
  dawReachable: boolean;
  /** Whether that heartbeat's open project is the linked file; only meaningful when dawReachable is true. */
  dawProjectMatches: boolean;
  /** When those three facts were last read from the host (Unix ms); null before the first read. */
  checkedAt: number | null;
  /** The visible Check again: reads the facts from the host now. */
  onCheckAgain: () => void;
  /** The shared "link a REAPER project file" action (also used by Settings' DAW category and an import). */
  onLinkDawFile: () => void;
  linkingDawFile: boolean;
};

/**
 * The engine panel, opened from the header's engine
 * chip on any page. It holds what the Tracks page held that is about REAPER rather than a stage: the linked `.rpp` (link,
 * relink, or choose between several), the REAPER tools, chapter sync, and the track list with each track's chapter and the Chapter links table. The Tracks page's player
 * is gone: a chapter is heard in its Proof chapter view. Everything loads when the panel opens (a closed SlideOver is not
 * mounted), so the panel costs nothing on a page that never opens it.
 */
export function EnginePanel({ open, onClose, notify, link }: { open: boolean; onClose: () => void; notify: Notify; link: EngineLinkState }) {
  return (
    <SlideOver open={open} title="Audio engine" closeLabel="Close the engine panel" size="wide" headingLevel={2} onClose={onClose}>
      <EnginePanelBody notify={notify} link={link} />
    </SlideOver>
  );
}

function EnginePanelBody({ notify, link }: { notify: Notify; link: EngineLinkState }) {
  const api = useApi();
  // An Audacity project has no .rpp: its card replaces the REAPER project section, the REAPER tools are not shown, and the tracks come
  // from the snapshot the host takes while Audacity answers.
  const audacity = useAudacityLink();
  const forAudacity = audacity.link?.chosen === true;
  // The tracks are read again whenever the Audacity card hears from the host (a change, or Check again), since the snapshot they come
  // from is taken while Audacity answers.
  const audacityHeard = forAudacity ? audacity.receivedAt : undefined;
  const [discovery, setDiscovery] = useState<TracksDiscovery>();
  // An Audacity project's tracks: the snapshot the host takes while Audacity answers.
  const [audacityProject, setAudacityProject] = useState<TracksProject>();
  const [error, setError] = useState('');
  // Bumped by the chapter-sync panel's own actions (toggle, Link, Undo), so the track list and the Chapter links table re-read
  // the mapping they don't otherwise hear about (chapterTrackSet and chapterSyncSetEnabled send no event of their own).
  const [refresh, setRefresh] = useState(0);
  // A REAPER project's tracks as REAPER has them now, saved or not (#2840): read when the panel opens, when the linked file or the link
  // facts change (Check again, a relink), on focus and on a timer, and by the Refresh in Chapter links and the Link chapters dialog.
  const live = useLiveTracks({
    enabled: !forAudacity && !!discovery?.selected,
    readKey: `${discovery?.selected ?? ''}|${link.checkedAt ?? ''}|${link.dawFileLinked}|${link.dawProjectMatches}`,
    notify,
  });
  const project = forAudacity ? audacityProject : live.project;
  const voices = useVoiceTracks(notify);
  // Chapter sync draws the layout switch as its Layout row while it is drawn at all; otherwise the Voices card does.
  const [layoutInSync, setLayoutInSync] = useState(false);
  // The one reader of the chapter links: the Link chapters button and dialog, the Tracks card and the Chapter links section all use it.
  const links = useChapterLinks(project?.tracks ?? NO_TRACKS, refresh, () => setRefresh((count) => count + 1));
  // Read-only here, so onStatus is a no-op; a Link or a Change below is exactly
  // what resolves an unmapped_track/unconfirmed_mapping cause.
  const stages = useStageRecommendations({ refreshKey: String(refresh), notify, onStatus: () => {} });
  const unmappedCount = Array.from(stages.state.byChapter.values()).filter(
    (chapter) => chapter.causes.includes('unmapped_track') || chapter.causes.includes('unconfirmed_mapping'),
  ).length;

  useEffect(() => {
    let active = true;
    void api
      .tracksDiscover()
      .then((next) => {
        if (active) setDiscovery(next);
      })
      .catch((reason) => {
        if (active) setError(String(reason));
      });
    return () => {
      active = false;
    };
  }, [api, audacityHeard]);

  useEffect(() => {
    if (!forAudacity || !discovery?.selected) return;
    let active = true;
    void api
      .tracksList()
      .then((next) => {
        if (active) {
          setAudacityProject(next);
          setError('');
        }
      })
      .catch((reason) => {
        if (active) setError(String(reason));
      });
    return () => {
      active = false;
    };
  }, [api, forAudacity, discovery?.selected, audacityHeard]);

  const selectRpp = (path: string) => {
    setError('');
    void api
      .tracksSelect(path)
      .then((next) => setDiscovery(next))
      .catch((reason) => setError(String(reason)));
  };

  const hasTracks = !!project && project.tracks.length > 0;
  // A REAPER project whose tracks have not been read yet (the first read is running, or failed and was a toast with Retry): Chapter links'
  // header holds the status and the Refresh until they are, so the narrator always has a way to read them again (UX rule 7, breaker B1).
  const awaitingTracks = !forAudacity && !!discovery?.selected && !project;

  return (
    // The gap between cards is the slide-over body's own padding (1.1rem), so the space above the first card and between cards match (R3EN2-16).
    <VoiceLayoutContext.Provider value={forAudacity ? 'flat' : null}>
      <div className="space-y-[1.1rem]">
        {forAudacity ? (
          <Panel title="Audacity project">
            <AudacityLinkCard view={audacity} notify={notify} />
          </Panel>
        ) : (
          <ProjectSection discovery={discovery} link={link} onSelectRpp={selectRpp} />
        )}
        {forAudacity && discovery && !discovery.selected && (
          <p role="status" className="text-sm" style={{ color: 'var(--text-muted)' }}>
            No tracks have been read from Audacity yet. They appear here once Audacity answers with this project open.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm" style={{ color: 'var(--danger-text)' }}>
            {error}
          </p>
        )}
        {hasTracks && !forAudacity && (
          <Panel title="REAPER tools">
            {/* The tools, their gates and their dialogs come from the DAW tools registry; Link chapters stays out while the book has no chapters (ENX-9: equal cells). */}
            <DawToolsMenu label="REAPER tools" groups={DAW_TOOL_GROUPS} links={links} live={live} forAudacity={forAudacity} whenUnsupported="hide" />
          </Panel>
        )}
        <ChapterSyncPanel
          notify={notify}
          onChanged={() => setRefresh((count) => count + 1)}
          daw={forAudacity ? { daw: 'Audacity', linkedFile: audacity.link?.linkedFile ?? null } : { daw: 'REAPER' }}
          layout={hasTracks && !forAudacity ? <LayoutToggle layout={voices.setup.layout} onLayout={voices.setLayout} /> : undefined}
          onLayoutShown={setLayoutInSync}
        />
        {project && project.tracks.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {forAudacity
              ? 'Audacity has no audio tracks yet, or has not answered since this project opened. The tracks shown here are read from the last time it did.'
              : 'This REAPER project has no tracks yet.'}
          </p>
        )}
        {hasTracks && <TrackList tracks={project.tracks} mappings={links.mappings} />}
        {project && unmappedCount > 0 && (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {unmappedCount === 1
              ? 'One chapter can’t get a stage suggestion until its track link is confirmed below.'
              : `${unmappedCount} chapters can’t get a stage suggestion until their track links are confirmed below.`}
          </p>
        )}
        {project && <ChapterLinksTable links={links} notify={notify} live={forAudacity ? undefined : live} />}
        {awaitingTracks && (
          <Panel title="Chapter links" flush subtitle={<LiveTracksStatus live={live} />} actions={<LiveTracksRefresh live={live} />}>
            {null}
          </Panel>
        )}
        {hasTracks && !forAudacity && (
          <VoicesCard
            tracks={project.tracks}
            chapters={links.chapters}
            mappings={links.mappings}
            setup={voices.setup}
            characters={voices.characters}
            onLayout={voices.setLayout}
            onTrackCharacters={voices.setTrackCharacters}
            onNarratorCharacter={voices.setNarratorCharacter}
            layoutInCard={!layoutInSync}
          />
        )}
      </div>
    </VoiceLayoutContext.Provider>
  );
}

// The linked `.rpp` and its link action. The panel reads the project folder's `.rpp`
// through its own discovery flow, independent of the manifest link, so the link button is an extra "point at a different file"
// action beside it, not a gate (one binding, three call sites: here, Settings' DAW category, an import).
function ProjectSection({ discovery, link, onSelectRpp }: { discovery?: TracksDiscovery; link: EngineLinkState; onSelectRpp: (path: string) => void }) {
  const mismatch = link.dawFileLinked && link.dawReachable && !link.dawProjectMatches;
  // While the picker asks which of several files to read, the list is the choice: a second "link a file" route above it is left out (R3EN2-5).
  const picking = !!discovery && !discovery.selected && discovery.candidates.length > 1;
  return (
    <Panel
      title="REAPER project"
      actions={
        picking ? undefined : (
          // A short label of one width either way (ENX-25); the card's title already says it is the REAPER project file.
          <Button variant="secondary" pending={link.linkingDawFile} onClick={link.onLinkDawFile}>
            {link.dawFileLinked ? 'Change file…' : 'Link file…'}
          </Button>
        )
      }
    >
      <div className="space-y-3 text-sm">
        {discovery?.selected && (
          <div className="min-w-0">
            <div className="font-medium [overflow-wrap:anywhere]">{basename(discovery.selected)}</div>
            <div className="font-['IBM_Plex_Mono',ui-monospace,monospace] text-xs [overflow-wrap:anywhere]" style={{ color: 'var(--text-muted)' }}>
              {discovery.selected}
            </div>
          </div>
        )}
        {mismatch && (
          // A problem, so a callout with its two ways out beside it, not coloured body text (R3EN2-4, ENX-25). Link the open project is the
          // shared link action, as the Booth's same notice names it.
          <InsetCard tone="warn" fill className="space-y-2">
            <p role="status" className="flex items-start gap-2" style={{ color: 'var(--warn-text)' }}>
              <FontAwesomeIcon icon={faTriangleExclamation} className="mt-[0.2rem] flex-none" aria-hidden="true" />
              <span>REAPER has a different project open than the one linked here. Link the open project, or switch REAPER to the linked file.</span>
            </p>
            <CheckLine waiting="Waiting for REAPER to open the linked project" unknown="REAPER has the linked project open" checkedAt={link.checkedAt} />
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" pending={link.linkingDawFile} onClick={link.onLinkDawFile}>
                Link the open project…
              </Button>
              <Button variant="secondary" onClick={link.onCheckAgain}>
                Check again
              </Button>
            </div>
          </InsetCard>
        )}
        {!discovery && <p role="status">Looking for the REAPER project file…</p>}
        {discovery && discovery.candidates.length === 0 && (
          <p style={{ color: 'var(--text-muted)' }}>
            <b className="font-semibold" style={{ color: 'var(--text)' }}>
              No REAPER project file found.
            </b>{' '}
            This project folder doesn&rsquo;t contain a .rpp file. Save your REAPER project into the folder, then open this panel again.
          </p>
        )}
        {picking && <RppPicker discovery={discovery} onSelect={onSelectRpp} />}
      </div>
    </Panel>
  );
}

// Each file is a row to press: its name first, in bold, where the files differ, and its folder under it (R3EN2-5).
function RppPicker({ discovery, onSelect }: { discovery: TracksDiscovery; onSelect: (path: string) => void }) {
  return (
    <div>
      <p style={{ color: 'var(--text-muted)' }}>More than one .rpp file was found in this project folder. Choose which one to read tracks from.</p>
      <ul aria-label="REAPER project files" className="mt-2 space-y-1.5">
        {discovery.candidates.map((path) => (
          <li key={path}>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left hover:border-[var(--accent)] hover:bg-[var(--surface-2)]"
              onClick={() => onSelect(path)}
            >
              <span className="min-w-0 flex-1">
                <span className="block font-semibold [overflow-wrap:anywhere]">{basename(path)}</span>
                <span className="block font-['IBM_Plex_Mono',ui-monospace,monospace] text-xs [overflow-wrap:anywhere]" style={{ color: 'var(--text-muted)' }}>
                  {folderOf(path)}
                </span>
              </span>
              <span aria-hidden="true" className="flex-none text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
                Use
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
