import assert from 'node:assert/strict';
import test from 'node:test';
import { decide } from './storybook-build.mjs';

test('without a prebuilt copy it builds, as it always has', () => {
  assert.equal(decide({ prebuilt: false, hasIndex: false }), 'build');
  assert.equal(decide({ prebuilt: false, hasIndex: true }), 'build');
});

test('with a prebuilt copy it uses it and builds nothing', () => {
  assert.equal(decide({ prebuilt: true, hasIndex: true }), 'use');
});

test('a prebuilt copy that is not there is an error, not a quiet second build', () => {
  assert.equal(decide({ prebuilt: true, hasIndex: false }), 'missing');
});
