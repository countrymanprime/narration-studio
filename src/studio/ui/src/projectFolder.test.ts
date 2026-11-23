// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { folderKey, projectStorageKey, readProjectStorage, writeProjectStorage } from './projectFolder';
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
    ['backslashes', 'C:\\Projects\\X', 'C:/Projects/X'],
    ['a trailing separator', 'C:/Projects/X/', 'C:/Projects/X'],
    ['a trailing backslash', 'C:\\Projects\\X\\', 'C:/Projects/X'],
    ['a doubled separator', 'C:/Projects//X', 'C:/Projects/X'],
    ['a network share keeps its leading pair', '\\\\server\\share\\X\\', '//server/share/X'],
    ['the case is kept', 'C:/Projects/X', 'C:/Projects/X'],
    ['empty', '', ''],
    ['spaces and Unicode', 'C:\\My Books\\日本\\', 'C:/My Books/日本'],
  ])('%s', (_name, folder, expected) => {
    expect(folderKey(folder)).toBe(expected);
  });
  it('a network share and a rooted path are two folders, and so are two cases', () => {
    expect(folderKey('//s/x')).not.toBe(folderKey('/s/x'));
    expect(folderKey('C:/X')).not.toBe(folderKey('C:/x'));
  });
});

describe('projectStorageKey', () => {
  it('builds the key from the normalised folder', () => {
    expect(projectStorageKey('booth.lastPlace', 'C:\\P\\X\\')).toBe('narration.booth.lastPlace.C:/P/X');
  });
});

const RAW = 'C:\\Projects\\X';
const NORM = 'C:/Projects/X';

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
    expect(window.localStorage.getItem(key + NORM)).toBe(legacy);
    expect(window.localStorage.getItem(key + RAW)).toBe(legacy);
  });
  it('the other spelling of that folder then finds it', () => {
    window.localStorage.setItem(key + RAW, legacy);
    read(RAW);
    expect(read(NORM)).toBe('old');
  });
  it('the normalised key wins when both exist', () => {
    window.localStorage.setItem(key + RAW, legacy);
    window.localStorage.setItem(key + NORM, fresh);
    expect(read(RAW)).toBe('new');
    expect(read(NORM)).toBe('new');
  });
  it('one folder in two spellings shares one place', () => {
    save(NORM, 'c1');
    expect(read(RAW + '\\')).toBe(read(NORM));
    expect(read(NORM)).not.toBe('');
  });
  it('a different folder, or the same folder in another case, does not share it', () => {
    save(NORM, 'c1');
    expect(read('C:/Projects/Y')).toBe('');
    expect(read('C:/projects/x')).toBe('');
  });
  it('an empty folder reads nothing and never leaks into a project', () => {
    expect(read('')).toBe('');
    save('', 'c1');
    expect(read(NORM)).toBe('');
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
    window.localStorage.setItem('narration.booth.lastPlace.C:/X', '{');
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
