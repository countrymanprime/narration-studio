import type {
  ChapterSyncBackgroundWait,
  ChapterSyncBatch,
  ChapterSyncChapter,
  ChapterSyncNeedsYou,
  ChapterSyncPickupTrack,
  ChapterSyncTrackRef,
} from '../../api/contracts/chapterSync';

/**
 * Why a chapter is in Needs you, as the consent dialog says it. The
 * engine panel's list says two of them its own way (`chapterSyncPanelReasonText`).
 */
export function chapterSyncReasonText(item: ChapterSyncNeedsYou): string {
  switch (item.reason) {
    case 'ambiguous': {
      const names = item.candidates.map((candidate) => `“${candidate.trackName}”`);
      if (names.length === 0) return 'More than one track looks like it.';
      if (names.length === 1) return `${names[0]} looks like it.`;
      return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} both look like it.`;
    }
    case 'uncertain':
      return item.best ? `“${item.best.trackName}” is close, but not a confident match.` : 'No track is a confident match.';
    case 'region':
      return 'Only a project region names this chapter, not a track.';
    case 'rejected':
      return 'You unlinked this chapter before; sync will not relink it on its own.';
    case 'not-mutual':
      return item.best ? `“${item.best.trackName}” matches another chapter better.` : 'Its closest track matches another chapter better.';
  }
}

/** "Tracks that are not chapters": unmatched track names plus any pickup tracks, with a note singling
 * the pickup tracks out (they are kept for take review, never a chapter link). */
export function chapterSyncNotChaptersText(unmatched: ChapterSyncTrackRef[], pickupTracks: ChapterSyncPickupTrack[]): { names: string; note: string } {
  const names = [...unmatched.map((track) => track.name), ...pickupTracks.map((pickup) => pickup.trackName)];
  if (names.length === 0) return { names: 'None.', note: '' };
  const subject = pickupTracks.length === 1 ? 'The last one is' : `The last ${pickupTracks.length} are`;
  const object = pickupTracks.length === 1 ? `${pickupTracks[0].chapterTitle}'s pickup track` : 'their chapters’ pickup tracks';
  const note = pickupTracks.length > 0 ? `${subject} kept as ${object}.` : '';
  return { names: names.join(', '), note };
}

const COUNT_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];

function quotedList(names: string[]): string {
  const quoted = names.map((name) => `“${name}”`);
  return quoted.length < 2 ? (quoted[0] ?? '') : `${quoted.slice(0, -1).join(', ')} and ${quoted[quoted.length - 1]}`;
}

/** Why a chapter is in the engine panel's Needs you: a tie and a guess in the panel's own words, the rest as the dialog says them. */
export function chapterSyncPanelReasonText(item: ChapterSyncNeedsYou): string {
  if (item.reason === 'ambiguous' && item.candidates.length >= 2) {
    const count = COUNT_WORDS[item.candidates.length] ?? String(item.candidates.length);
    return `${count} tracks match: ${quotedList(item.candidates.map((candidate) => candidate.trackName))}. A chapter is checked from one track.`;
  }
  if (item.reason === 'uncertain' && item.best) return `Closest track “${item.best.trackName}” is not a confident match, so it was not linked on its own.`;
  return chapterSyncReasonText(item);
}

/** The engine panel's "Tracks that are not chapters" line: "Room tone · Pickups · Chapter 3 (pickups), kept as Chapter 3’s pickup track". */
export function chapterSyncPanelNotChaptersText(unmatched: ChapterSyncTrackRef[], pickupTracks: ChapterSyncPickupTrack[]): string {
  const names = [...unmatched.map((track) => track.name), ...pickupTracks.map((pickup) => pickup.trackName)].join(' · ');
  if (pickupTracks.length === 0) return names;
  return `${names}, kept as ${pickupTracks.length === 1 ? `${pickupTracks[0].chapterTitle}’s pickup track` : 'their chapters’ pickup tracks'}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** When a sync ran, as the Sync activity dates it: "10:42" today, "Yesterday", then "22 Sep" (with the year when it is not this one). */
export function chapterSyncTimeLabel(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const day = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((day(now) - day(at)) / 86_400_000);
  if (days === 0) return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  if (days === 1) return 'Yesterday';
  const dayMonth = `${at.getDate()} ${MONTHS[at.getMonth()]}`;
  return at.getFullYear() === now.getFullYear() ? dayMonth : `${dayMonth} ${at.getFullYear()}`;
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

/**
 * Which DAW chapter sync reads, so its text names that one. For REAPER it is the saved .rpp the host reports as `projectFile`. An
 * Audacity project has no .rpp: the host reads the snapshot taken while Audacity answered (or, with none yet, whatever .rpp
 * discovery finds), so the text names `linkedFile`, the narrator's linked .aup3 (null when none is linked), and never `projectFile`.
 */
export type ChapterSyncDaw = { daw: 'REAPER' } | { daw: 'Audacity'; linkedFile: string | null };

/** The project chapter sync reads, as a sentence's subject: "Alice.rpp", "Book One.aup3", "The open Audacity project". */
export function chapterSyncProjectName(projectFile: string, daw: ChapterSyncDaw): string {
  if (daw.daw === 'Audacity') return daw.linkedFile ? basename(daw.linkedFile) : 'The open Audacity project';
  return projectFile;
}

const chapters = (count: number) => `${count} chapter${count === 1 ? '' : 's'}`;

/** Chapter sync's facts, one per row of its card: when it last synced and from which project (`daw` says which one to name), and how many chapters it and you linked. */
export function chapterSyncSummaryFacts(
  state: { lastSync: string | null; projectFile: string; chapters: Pick<ChapterSyncChapter, 'origin'>[]; linked: number; daw: ChapterSyncDaw },
  now: Date = new Date(),
): { synced: string; links: string } {
  const when = state.lastSync ? chapterSyncTimeLabel(state.lastSync, now) || 'At an unknown time' : 'Not synced yet';
  let file = '';
  if (state.lastSync && state.daw.daw === 'Audacity') {
    file = state.daw.linkedFile ? `, from ${basename(state.daw.linkedFile)} in Audacity` : ', from the open Audacity project';
  } else if (state.lastSync && state.projectFile) {
    file = `, from the saved ${basename(state.projectFile)}`;
  }
  let links: string;
  if (state.chapters.length === 0) {
    links = `${chapters(state.linked)} linked`;
  } else {
    const auto = state.chapters.filter((chapter) => chapter.origin === 'auto').length;
    const manual = state.chapters.filter((chapter) => chapter.origin === 'manual').length;
    if (auto > 0) links = `${chapters(auto)} linked automatically${manual > 0 ? `, ${manual} by you` : ''}`;
    else if (manual > 0) links = `${chapters(manual)} linked by you`;
    else links = 'No chapters linked';
  }
  return { synced: `${when}${file}`, links };
}

/**
 * Chapter sync's Background checks row (`daw` names the DAW a recording wait is for): why a changed
 * chapter is not being re-checked on its own right now. '' when there is nothing worth telling the narrator: checks
 * are off, another check (the narrator's own or another background pick) is already running, or nothing has
 * changed since its last check.
 */
export function chapterSyncBackgroundWaitText(background: { enabled: boolean; wait: ChapterSyncBackgroundWait }, daw: ChapterSyncDaw['daw']): string {
  if (!background.enabled) return '';
  const REASONS: Partial<Record<ChapterSyncBackgroundWait, string>> = {
    recording: `Waiting: ${daw} is recording.`,
    battery: 'Waiting for mains power.',
    quiet: 'Waiting for things to settle down.',
    model: 'Waiting for the Whisper model.',
  };
  return REASONS[background.wait] ?? '';
}

/** One line of the Sync activity list. `undoTrackGuid` is the automatic link Undo would remove ('' for a line with no Undo). */
export type ChapterSyncActivityRow = { key: string; at: string; text: string; undoTrackGuid: string };

/**
 * The Sync activity list newest first as the host keeps it: the first
 * sync as one line ("First sync: 8 chapters linked"), then a line per link a later sync made ("Linked “Ch. 11” to Chapter 11",
 * with Undo) and per new track that is not a chapter. A batch with neither (an Undo's own sync) adds no line.
 */
export function chapterSyncActivityRows(activity: ChapterSyncBatch[], trackName: (guid: string) => string): ChapterSyncActivityRow[] {
  return activity.flatMap((batch, index) => {
    if (batch.trigger === 'consent') {
      return batch.linked.length > 0
        ? [{ key: `${index}:first`, at: batch.at, text: `First sync: ${chapters(batch.linked.length)} linked`, undoTrackGuid: '' }]
        : [];
    }
    const linked = batch.linked.map((link) => {
      const name = trackName(link.trackGuid);
      return {
        key: `${index}:link:${link.trackGuid}`,
        at: batch.at,
        text: name ? `Linked “${name}” to ${link.chapterTitle}` : `Linked a track to ${link.chapterTitle}`,
        undoTrackGuid: link.origin === 'auto' ? link.trackGuid : '',
      };
    });
    const added = batch.newTracks.map((track) => ({
      key: `${index}:new:${track.guid}`,
      at: batch.at,
      text: `New track “${track.name}”, not a chapter`,
      undoTrackGuid: '',
    }));
    return [...linked, ...added];
  });
}
