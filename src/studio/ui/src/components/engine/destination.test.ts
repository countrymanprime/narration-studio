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
      'This chapter records on one track, so voice keys do nothing. Link a folder in the audio engine panel.',
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
      d.noVoiceKeys('marked'),
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
      'This chapter is not linked to a folder of voices. Link or create one in the audio engine panel.',
      'This chapter has one track, not a folder of voices. Link a folder in the audio engine panel.',
      'This chapter’s folder has no voice tracks yet, so there is no voice to choose. Add one in REAPER.',
      'Every track in this chapter’s folder is turned off as not a voice. Turn one on in the Voices card.',
      'This chapter’s track is gone from the project, so no voice is listed. Link it in the audio engine panel.',
      'Ch 1 is not linked to a folder in REAPER, so there is no audio to edit.',
    ]);
    expect(all.filter((sentence) => /records on one track/.test(sentence))).toEqual([]);
  });

  it('says what the DAW made, that it is linked here and not saved yet, and what is left of a partly done create (#3748, #4095)', () => {
    const made = (name: string, index: number) => ({ guid: `{${index}}`, name, index, notVoice: name === 'Extras' });
    const folder = {
      track: { name: 'Opening' },
      voice: { guid: '{4}', name: 'Narrator', index: 4 },
      children: [made('Narrator', 4), made('Alice', 5), made('Extras', 6)],
    };
    expect(createdSentence(folder, 'REAPER')).toBe('Folder “Opening” is in REAPER, linked here. Save the REAPER project to keep it.');
    const partial = { ...folder, children: [made('Narrator', 4)], message: 'REAPER added 1 of the 3 tracks asked for. Add the rest in REAPER.' };
    expect(createdSentence(partial, 'REAPER')).toBe(
      'Folder “Opening” is in REAPER, linked here. Save the REAPER project to keep it. REAPER added 1 of the 3 tracks asked for. Add the rest in REAPER.',
    );
    expect(createdSentence({ track: { name: 'Opening' } }, 'REAPER')).toBe('Track “Opening” is in REAPER, linked here. Save the REAPER project to keep it.');
  });

  it('a folder whose every track is marked as not a voice names the switch in either layout, and in Flat the other fix (#3828)', () => {
    const flat = destinationFor('flat').noVoiceKeys('marked');
    const folders = destinationFor('folders').noVoiceKeys('marked');
    expect(flat).toContain('Turn one on in the Voices card');
    expect(flat).toContain('link one in the audio engine panel');
    expect(flat).not.toMatch(/records on one track/);
    expect(folders).toContain('Turn one on in the Voices card');
    expect(folders).not.toContain('link one');
  });

  it('a link to a track the project does not hold gets one sentence in either layout (#3269)', () => {
    expect(destinationFor('flat').noVoiceKeys('unknown')).toBe(destinationFor('folders').noVoiceKeys('unknown'));
    expect(destinationFor('flat').noVoiceKeys('unknown')).not.toMatch(/records on one track/);
  });
});

// #4113: a chapter or track name the narrator wrote in a right-to-left script is isolated (U+2068 … U+2069) in the toast sentences that carry it, so it cannot turn the sentence around; an English name
// is left as it is, and a name holding controls of its own cannot unbalance the pair.
describe('the toast sentences that carry a name isolate a right-to-left one (#4113)', () => {
  const FSI = '\u2068';
  const PDI = '\u2069';
  const arabic = '\u0627\u0644\u0641\u0635\u0644 \u0627\u0644\u0623\u0648\u0644'; // "the first chapter", in Arabic
  const isolates = (text: string) => text.match(/[\u2066-\u2069]/g)?.join('') ?? '';

  it('the linked message isolates an Arabic chapter name once and leaves an English one bare', () => {
    expect(destinationFor('flat').linkedToast(arabic)).toBe(`${FSI}${arabic}${PDI} is linked to its track. Press Record when you are ready.`);
    expect(destinationFor('folders').linkedToast(arabic)).toBe(`${FSI}${arabic}${PDI} is linked to its folder. Press Record when you are ready.`);
    expect(isolates(destinationFor('flat').linkedToast('Chapter 1'))).toBe('');
  });

  it('the created message isolates an Arabic track or folder name once', () => {
    expect(createdSentence({ track: { name: arabic } }, 'REAPER')).toBe(
      `Track “${FSI}${arabic}${PDI}” is in REAPER, linked here. Save the REAPER project to keep it.`,
    );
    expect(isolates(createdSentence({ track: { name: arabic }, voice: { guid: '{1}', name: 'Narrator', index: 1 } }, 'REAPER'))).toBe(`${FSI}${PDI}`);
  });

  it('a name with controls of its own is isolated by exactly one balanced pair', () => {
    const hostile = `\u202E${arabic}\u2069\u2066`;
    expect(isolates(destinationFor('flat').linkedToast(hostile))).toBe(`${FSI}${PDI}`);
    expect(isolates(createdSentence({ track: { name: hostile } }, 'REAPER'))).toBe(`${FSI}${PDI}`);
  });
});
