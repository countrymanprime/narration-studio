import assert from 'node:assert/strict';
import test from 'node:test';

import { compare, latestCandidate, problem } from './explicit-version.mjs';

const TAGS = ['v0.3.9-rc', 'v0.3.557-rc', 'v0.3.100-rc', 'v0.2.0', 'other-tag'];

test('versions compare by number, not as text', () => {
  assert.equal(compare('0.3.557', '0.3.9'), 1);
  assert.equal(compare('1.0.0', '0.99.999'), 1);
  assert.equal(compare('1.2.3', '1.2.3'), 0);
  assert.equal(compare('1.2.3', '1.10.0'), -1);
});

test('the latest candidate is the highest rc tag, ignoring stable and unrelated tags', () => {
  assert.equal(latestCandidate(TAGS), '0.3.557');
  assert.equal(latestCandidate(['v0.2.0', 'x']), null);
  assert.equal(latestCandidate([]), null);
});

test('1.0.0 above the latest candidate is accepted', () => {
  assert.equal(problem('1.0.0', TAGS), null);
  assert.equal(problem('0.4.0', TAGS), null);
  assert.equal(problem('0.3.558', TAGS), null);
  assert.equal(problem('1.0.0', []), null);
});

test('anything but a plain X.Y.Z is refused, so the input cannot carry a suffix, a v or shell text', () => {
  for (const bad of ['v1.0.0', '1.0', '1.0.0-rc', '1.0.0+build', '01.0.0', '1.0.0 ', '1.0.0; rm -rf /', '', undefined, '$(id)']) {
    assert.match(problem(bad, TAGS), /not a plain X\.Y\.Z version/, String(bad));
  }
});

test('a version at or below the latest candidate is refused', () => {
  assert.match(problem('0.3.557', TAGS.filter((tag) => tag !== 'v0.3.557-rc').concat('v0.3.600-rc')), /not higher than the latest release candidate, 0\.3\.600/);
  assert.match(problem('0.3.1', TAGS), /not higher than the latest release candidate, 0\.3\.557/);
});

test('a version already tagged as a candidate or a stable release is refused', () => {
  assert.match(problem('0.3.557', TAGS), /v0\.3\.557 is already tagged/);
  assert.match(problem('2.0.0', [...TAGS, 'v2.0.0']), /v2\.0\.0 is already tagged/);
  assert.match(problem('2.0.0', [...TAGS, 'v2.0.0-rc']), /v2\.0\.0 is already tagged/);
});
