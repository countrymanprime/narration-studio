import { describe, expect, it } from 'vitest';
import { createdSentence, destinationFor } from './destination';

// #3271: the project's layout (flat, or Voice folders) is one setting, so every sentence that names where a chapter records follows it. Each layout is
// pinned over every message the function builds, so a flat sentence cannot show on a folders project or the other way round.
describe('destinationFor names where a chapter records from the project layout', () => {
  it('a flat project says track everywhere', () => {
    const d = destinationFor('flat');
    expect([
      d.notLinkedTitle('Ch 1'),
      d.severalTitle('Ch 1'),
      d.missingTitle('Ch 1'),
      d.notLinkedChip,
      d.severalChip,
      d.linkButton,
      d.pickerLabel('Ch 1'),
      d.recordWaits('Ch 1'),
      d.recordWaitsSeveral('Ch 1'),
      d.footerNoLink('Ch 1'),
      d.linkedToast('Ch 1'),
      d.chipNoTrack.words,
      d.chipNoTrack.sentence,
      d.chipSeveral.words,
      d.chipSeveral.sentence,
      d.noVoiceKeys('none'),
      d.editingUnlinked('Ch 1', 'REAPER'),
    ]).toEqual([
      'Ch 1 is not linked to a track',
      'Ch 1 is linked to more than one track',
      'Ch 1’s track is not in the project',
      'Not linked to a track',
      'Linked to several tracks',
      'Link track',
      'Track for Ch 1',
      "Record can't start until Ch 1 has a track to record on.",
      "Record can't start: a take needs exactly one track for Ch 1. Linking one replaces the others.",
      'Ch 1 has no track to record on. Press Record to link one.',
      'Ch 1 is linked to its track. Press Record when you are ready.',
      'no track',
      'this chapter has no track to record on',
      'several tracks',
      'this chapter is linked to several tracks',
      'This chapter records on one track. Voice keys choose a voice for a chapter linked to a folder of voices (the audio engine panel).',
      'Ch 1 is not linked to a track in REAPER, so there is no audio to edit.',
    ]);
  });

  it('a Voice folders project says folder everywhere, and never that a chapter records on one track', () => {
    const d = destinationFor('folders');
    const all = [
      d.notLinkedTitle('Ch 1'),
      d.severalTitle('Ch 1'),
      d.missingTitle('Ch 1'),
      d.notLinkedChip,
      d.severalChip,
      d.linkButton,
      d.pickerLabel('Ch 1'),
      d.recordWaits('Ch 1'),
      d.recordWaitsSeveral('Ch 1'),
      d.footerNoLink('Ch 1'),
      d.linkedToast('Ch 1'),
      d.chipNoTrack.words,
      d.chipNoTrack.sentence,
      d.chipSeveral.words,
      d.chipSeveral.sentence,
      d.noVoiceKeys('none'),
      d.noVoiceKeys('track'),
      d.noVoiceKeys('empty'),
      d.noVoiceKeys('unknown'),
      d.editingUnlinked('Ch 1', 'REAPER'),
    ];
    expect(all).toEqual([
      'Ch 1 is not linked to a folder',
      'Ch 1 is linked to more than one folder',
      'Ch 1’s folder is not in the project',
      'Not linked to a folder',
      'Linked to several folders',
      'Link folder',
      'Folder for Ch 1',
      "Record can't start until Ch 1 has a folder of voice tracks to record on.",
      "Record can't start: a take needs exactly one folder for Ch 1. Linking one replaces the others.",
      'Ch 1 has no folder to record on. Press Record to link one.',
      'Ch 1 is linked to its folder. Press Record when you are ready.',
      'no folder',
      'this chapter has no folder to record on',
      'several folders',
      'this chapter is linked to several folders',
      'This chapter is not linked to a folder of voices yet, so there is no voice to choose. Link or create its folder first.',
      'This chapter is linked to a single track, not a folder of voices, so there is no voice to choose. Link its folder in the audio engine panel.',
      'This chapter’s folder has no voice tracks yet, so there is no voice to choose. Add a track inside it in REAPER.',
      'The track linked to this chapter is no longer in the project, so there is no voice to choose. Link it again in the audio engine panel.',
      'Ch 1 is not linked to a folder in REAPER, so there is no audio to edit.',
    ]);
    expect(all.filter((sentence) => /records on one track/.test(sentence))).toEqual([]);
  });

  it('what the DAW made is named from its answer: a folder with its Narrator, or a plain track (an engine with no folders makes one in a folders project)', () => {
    const folder = { track: { name: 'Opening' }, voice: { guid: '{N}', name: 'Narrator', index: 4 } };
    const plain = { track: { name: 'Opening' } };
    expect(createdSentence(folder, 'Opening', 'REAPER')).toBe(
      'Folder “Opening” with a Narrator track added in REAPER and linked to Opening. Save the REAPER project to keep it.',
    );
    expect(createdSentence(plain, 'Opening', 'REAPER')).toBe('Track “Opening” added in REAPER and linked to Opening. Save the REAPER project to keep it.');
  });

  it('a link to a track the project does not hold gets one sentence in either layout (#3269)', () => {
    expect(destinationFor('flat').noVoiceKeys('unknown')).toBe(destinationFor('folders').noVoiceKeys('unknown'));
    expect(destinationFor('flat').noVoiceKeys('unknown')).not.toMatch(/records on one track/);
  });
});
