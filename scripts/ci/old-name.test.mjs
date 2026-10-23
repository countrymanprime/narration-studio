import assert from 'node:assert/strict';
import test from 'node:test';

import { OLD_NAME, findIn, scan } from './old-name.mjs';

// The retired name, assembled so this file does not hold it.
const old = (separator, word = 'narration') => `${word}${separator}${'uti'}ls`;

test('OLD_NAME matches every spelling of the retired name and nothing near it', () => {
  for (const spelling of [old('-'), old('_'), old(' ', 'Narration'), old('', 'Narration'), old('_').toUpperCase(), old('')]) {
    assert.ok(OLD_NAME.test(spelling), spelling);
  }
  for (const fine of ['narration-studio', 'NarrationStudio', 'test-utils', 'narration_common', 'string utils']) assert.ok(!OLD_NAME.test(fine), fine);
});

test('findIn reports a hit in the path and on each line, with the line number', () => {
  assert.deepEqual(findIn(`bin/${old('-')}.exe`, null), [`bin/${old('-')}.exe: (in the path)`]);
  assert.deepEqual(findIn('a.md', `fine\nsee ${old(' ', 'Narration')} here\n`), [`a.md:2: see ${old(' ', 'Narration')} here`]);
});

test('no tracked file names the retired product name, in its path or its text', () => {
  assert.deepEqual(scan(), [], 'rename it to Narration Studio (narration-studio, NarrationStudio); see scripts/ci/old-name.mjs');
});
