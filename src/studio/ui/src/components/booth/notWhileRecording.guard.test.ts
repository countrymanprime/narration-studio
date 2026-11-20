import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The Booth's refusal while a take records, and the sentences it says about a take, are each written once (`notWhileRecording`, `takeWords.ts`): a take the DAW started
// is stopped there, so a hand-written "Stop recording first." or "Take saved" in one more hook would tell the narrator to do what the app cannot.
const ROOT = __dirname;
const sources: { file: string; text: string }[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name) && name !== 'testPage.tsx')
      sources.push({ file: path.slice(ROOT.length + 1), text: readFileSync(path, 'utf8') });
  }
};
walk(ROOT);
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

describe('the refusal while recording and the take sentences are written once', () => {
  it.each([
    ['a refusal that tells the narrator to stop the take here', /Stop recording first|Stop the take first/, []],
    ['the sentence for a take that ended', /The take ended in |'The take ended'|Take saved/, ['record/takeWords.ts']],
    ['the sentence that the DAW records a take now', /is recording a take now/, ['record/takeWords.ts']],
  ])('%s appears in no Booth source beyond its one home', (_name, pattern, homes) => {
    expect(sources.length).toBeGreaterThan(50);
    const found = sources.filter(({ file, text }) => !homes.includes(file) && pattern.test(code(text))).map(({ file }) => file);
    expect(found).toEqual([]);
  });
});
