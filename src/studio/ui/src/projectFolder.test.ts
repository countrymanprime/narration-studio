// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { folderKey, isSameProject, projectStorageKey, readProjectStorage, writeProjectStorage } from './projectFolder';
import { loadChapterPlace, loadLastPlace, saveLastPlace } from './components/booth/page/lastPlace';
import { loadEditingChapter, saveEditingChapter } from './components/editing/lastChapter';
import { loadSharedChapter, saveSharedChapter } from './components/masterqc/page/sharedChapter';
import { forgetProofMemory, recallSelection, rememberSelection } from './components/proof/proofMemory';

afterEach(() => {
  window.localStorage.clear();
  forgetProofMemory();
  vi.restoreAllMocks();
});

describe('folderKey: one folder is one key (#4099)', () => {
  it.each([
    ['backslashes (a drive path is folded to lower case)', 'C:\\Projects\\X', 'c:/projects/x'],
    ['a trailing separator', 'C:/Projects/X/', 'c:/projects/x'],
    ['a trailing backslash', 'C:\\Projects\\X\\', 'c:/projects/x'],
    ['a doubled separator', 'C:/Projects//X', 'c:/projects/x'],
    ['a drive path differing only in case', 'c:\\PROJECTS\\x', 'c:/projects/x'],
    ['a POSIX path keeps its case', '/Books/X', '/Books/X'],
    ['the root folder is the root, not no project', '/', '/'],
    ['a drive root keeps its separator', 'C:\\', 'c:/'],
    ['a drive without a separator is not its root', 'C:', 'c:'],
    ['the root folder spelled with a backslash', '\\', '/'],
    ['the root folder with repeated separators', '///', '//'],
    ['a network share keeps its leading pair', '\\\\server\\share\\X\\', '//server/share/x'],
    ['empty', '', ''],
    ['spaces and Unicode', 'C:\\My Books\\日本\\', 'c:/my books/日本'],
  ])('%s', (_name, folder, expected) => {
    expect(folderKey(folder)).toBe(expected);
  });
  it('a network share and a rooted path are two folders, and so are two POSIX cases', () => {
    expect(folderKey('//s/x')).not.toBe(folderKey('/s/x'));
    expect(folderKey('/home/X')).not.toBe(folderKey('/home/x'));
    expect(folderKey('C:/X')).toBe(folderKey('c:/x'));
    expect(folderKey('//Srv/Share')).toBe(folderKey('\\\\srv\\SHARE'));
  });
  it('a drive and its root are two folders', () => {
    expect(isSameProject('C:', 'C:/')).toBe(false);
    expect(isSameProject('C:/', 'c:\\')).toBe(true);
  });
  it('the root folder is a project, not no project', () => {
    expect(isSameProject('/', '')).toBe(false);
    expect(isSameProject('\\', '')).toBe(false);
    expect(isSameProject('/', '\\')).toBe(true);
  });
});

describe('projectStorageKey', () => {
  it('builds the key from the normalised folder', () => {
    expect(projectStorageKey('booth.lastPlace', 'C:\\P\\X\\')).toBe('narration.booth.lastPlace.c:/p/x');
  });
});

const RAW = 'C:\\Projects\\X';
const NORM = 'C:/Projects/X';
const NORM_KEY = 'c:/projects/x'; // the folder part of the key the stores write

// Each store: the key prefix, a value an earlier build wrote, a different value, how to read what the store shows, and how to save one.
const stores = [
  {
    name: 'Booth last place',
    key: 'narration.booth.lastPlace.',
    legacy: JSON.stringify({ chapterId: 'old', paragraphId: 'p1', word: 1 }),
    fresh: JSON.stringify({ chapterId: 'new', paragraphId: 'p2', word: 2 }),
    read: (f: string) => loadLastPlace(f)?.chapterId ?? '',
    save: (f: string, id: string) => saveLastPlace(f, { chapterId: id, paragraphId: 'p', word: 0 }),
  },
  {
    name: 'Booth chapter places',
    key: 'narration.booth.chapterPlaces.',
    legacy: JSON.stringify({ c1: { paragraphId: 'old', word: 1, at: 1 } }),
    fresh: JSON.stringify({ c1: { paragraphId: 'new', word: 2, at: 1 } }),
    read: (f: string) => loadChapterPlace(f, 'c1')?.paragraphId ?? '',
    save: (f: string, id: string) => saveLastPlace(f, { chapterId: 'c1', paragraphId: id, word: 0 }),
  },
  { name: 'Editing chapter', key: 'narration.editing.lastChapter.', legacy: 'old', fresh: 'new', read: loadEditingChapter, save: saveEditingChapter },
  { name: 'Proof and Master & QC chapter', key: 'narration.proof.lastChapter.', legacy: 'old', fresh: 'new', read: loadSharedChapter, save: saveSharedChapter },
];

describe.each(stores)('$name: kept per project by the folder, not its spelling (#4099)', ({ key, legacy, fresh, read, save }) => {
  it('reads what an earlier build kept under the raw folder, copies it to the normalised key and leaves the old key', () => {
    window.localStorage.setItem(key + RAW, legacy);
    expect(read(RAW)).toBe('old');
    expect(window.localStorage.getItem(key + NORM_KEY)).toBe(legacy);
    expect(window.localStorage.getItem(key + RAW)).toBe(legacy);
  });
  it.each([
    ['only the backslash key, read by the forward-slash spelling first', RAW, NORM],
    ['only the forward-slash key, read by the backslash spelling', NORM, RAW],
    ['only a trailing-slash key', `${NORM}/`, NORM],
    ['only a trailing-backslash key', `${RAW}\\`, NORM],
    ['only a backslash key, read by a trailing-slash spelling', RAW, `${NORM}/`],
  ])('finds what an earlier build kept: %s', (_name, written, readBy) => {
    window.localStorage.setItem(key + written, legacy);
    expect(read(readBy)).toBe('old');
    expect(window.localStorage.getItem(key + NORM_KEY)).toBe(legacy);
    expect(window.localStorage.getItem(key + written)).toBe(legacy);
  });
  it('the other spelling of that folder then finds it', () => {
    window.localStorage.setItem(key + RAW, legacy);
    read(RAW);
    expect(read(NORM)).toBe('old');
  });
  it('the normalised key wins when both exist', () => {
    window.localStorage.setItem(key + RAW, legacy);
    window.localStorage.setItem(key + NORM_KEY, fresh);
    expect(read(RAW)).toBe('new');
    expect(read(NORM)).toBe('new');
  });
  it('with the normalised key and an old spelling both present, the normalised one wins, even if the old one is newer (nothing orders them)', () => {
    window.localStorage.setItem(key + NORM_KEY, fresh);
    window.localStorage.setItem(key + RAW, legacy);
    expect(read(NORM)).toBe('new');
  });
  it('one folder in two spellings shares one place', () => {
    save(NORM, 'c1');
    expect(read(RAW + '\\')).toBe(read(NORM));
    expect(read(NORM)).not.toBe('');
  });
  it('a different folder does not share it, a drive path in another case does, a POSIX path in another case does not', () => {
    save(NORM, 'c1');
    expect(read('C:/Projects/Y')).toBe('');
    expect(read('c:/PROJECTS/x')).not.toBe('');
    save('/books/x', 'c2');
    expect(read('/books/X')).toBe('');
    expect(read('/books/x')).not.toBe('');
  });
  it('the root folder keeps a place of its own, apart from no project', () => {
    save('/', 'c1');
    expect(read('\\')).not.toBe('');
    expect(read('')).toBe('');
  });
  it.each([
    ['repeated separators', 'C:\\\\Projects\\\\X'],
    ['doubled forward slashes', 'C://Projects//X'],
    ['mixed separators', 'C:/Projects\\X'],
    ['double trailing separators', 'C:\\Projects\\X\\\\'],
    ['another case', 'c:\\projects\\x'],
  ])('finds what an earlier build kept under %s', (_name, written) => {
    window.localStorage.setItem(key + written, legacy);
    expect(read(NORM)).toBe('old');
    expect(window.localStorage.getItem(key + NORM_KEY)).toBe(legacy);
    expect(window.localStorage.getItem(key + written)).toBe(legacy);
  });
  it('a key kept for another folder is not taken', () => {
    window.localStorage.setItem(key + 'C:\\Projects\\Y', legacy);
    expect(read(NORM)).toBe('');
  });
  it('an empty folder keeps nothing, so it never leaks into a project', () => {
    save('', 'c1');
    expect(read('')).toBe('');
    expect(read(NORM)).toBe('');
    expect(window.localStorage.length).toBe(0);
  });
  it.each([
    ['very long', 'C:\\' + 'long\\'.repeat(300) + 'x'],
    ['spaced, Unicode and emoji', 'C:\\My Books\\日本 🦎'],
    ['a network share', '\\\\srv\\share\\X'],
  ])('keeps a %s folder in either spelling', (_name, folder) => {
    save(folder, 'c1');
    expect(read(folder.replace(/\\/g, '/'))).not.toBe('');
  });
  it('reads nothing and writes nothing, without throwing, when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(() => save('C:/X', 'c1')).not.toThrow();
    expect(read('C:/X')).toBe('');
  });
});

describe('readProjectStorage and writeProjectStorage', () => {
  it('returns a legacy value even when copying it fails, and reports a failed write', () => {
    window.localStorage.setItem('narration.a.C:\\X', 'v');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(readProjectStorage('a', 'C:\\X')).toBe('v');
    expect(writeProjectStorage('a', 'C:\\X', 'w')).toBe(false);
  });
  it('a corrupt value under the normalised key still wins over a legacy one', () => {
    window.localStorage.setItem('narration.booth.lastPlace.C:\\X', JSON.stringify({ chapterId: 'old' }));
    window.localStorage.setItem('narration.booth.lastPlace.c:/x', '{');
    expect(loadLastPlace('C:\\X')).toBeNull();
  });
});

describe('Proof remembers the selected note by the folder, not its spelling', () => {
  it('shares it across spellings and keeps folders apart', () => {
    rememberSelection('C:\\P\\X', 'all', 'f1');
    expect(recallSelection('C:/P/X/', 'all')).toBe('f1');
    expect(recallSelection('C:/P/Y', 'all')).toBeNull();
  });
});

describe('two old spellings that both kept a place (#4099)', () => {
  const places = (entries: Record<string, [string, number]>) =>
    JSON.stringify(Object.fromEntries(Object.entries(entries).map(([id, [paragraphId, at]]) => [id, { paragraphId, word: 0, at }])));
  const last = (chapterId: string) => JSON.stringify({ chapterId, paragraphId: 'p', word: 0 });

  it('chapter places are merged chapter by chapter, the one left most recently winning', () => {
    window.localStorage.setItem('narration.booth.chapterPlaces.C:\\Projects\\X', places({ c2: ['old2', 10], c3: ['only-back', 5] }));
    window.localStorage.setItem('narration.booth.chapterPlaces.C:/Projects/X/', places({ c2: ['new2', 5], c5: ['new5', 99] }));
    expect(loadChapterPlace('C:/Projects/X', 'c2')?.paragraphId).toBe('old2');
    expect(loadChapterPlace('C:/Projects/X', 'c3')?.paragraphId).toBe('only-back');
    expect(loadChapterPlace('C:/Projects/X', 'c5')?.paragraphId).toBe('new5');
    expect(Object.keys(JSON.parse(window.localStorage.getItem('narration.booth.chapterPlaces.c:/projects/x')!)).sort()).toEqual(['c2', 'c3', 'c5']);
  });
  it('the last place is the one whose chapter was left most recently', () => {
    window.localStorage.setItem('narration.booth.lastPlace.C:\\Projects\\X', last('chapter-2'));
    window.localStorage.setItem('narration.booth.chapterPlaces.C:\\Projects\\X', places({ 'chapter-2': ['p', 10] }));
    window.localStorage.setItem('narration.booth.lastPlace.C:/Projects/X/', last('chapter-5'));
    window.localStorage.setItem('narration.booth.chapterPlaces.C:/Projects/X/', places({ 'chapter-5': ['p', 99] }));
    expect(loadLastPlace('C:/Projects/X')?.chapterId).toBe('chapter-5');
    expect(window.localStorage.getItem('narration.booth.lastPlace.c:/projects/x')).toBe(last('chapter-5'));
  });
  it("values with nothing to compare (the chapter Editing and Proof keep) take the caller's own spelling, else the lowest key", () => {
    window.localStorage.setItem('narration.editing.lastChapter.C:\\Projects\\X', 'back');
    window.localStorage.setItem('narration.editing.lastChapter.C:/Projects/X/', 'slash');
    expect(loadEditingChapter('C:/Projects/X/')).toBe('slash');
    window.localStorage.removeItem('narration.editing.lastChapter.c:/projects/x');
    expect(loadEditingChapter('C:/Projects/X')).toBe('slash');
    window.localStorage.removeItem('narration.editing.lastChapter.c:/projects/x');
    expect(loadEditingChapter('c:/projects/x')).toBe('slash');
  });
  it('a storage with thousands of keys is read without scanning past its limit', () => {
    for (let i = 0; i < 6000; i += 1) window.localStorage.setItem(`other.${i}`, 'x');
    window.localStorage.setItem('narration.editing.lastChapter.C:\\Projects\\X', 'back');
    expect(loadEditingChapter('C:/Projects/X')).toBeTypeOf('string');
  });
});
