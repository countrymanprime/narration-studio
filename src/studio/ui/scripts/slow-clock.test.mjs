import assert from 'node:assert/strict';
import { test } from 'node:test';
import { slowClock } from './slow-clock.mjs';

const html = '<!doctype html><html><head><title>x</title></head><body></body></html>';

test('a mock build with a rate below 1 injects the script first in <head>', () => {
  const [plugin] = slowClock('mock', '0.7');
  assert.equal(plugin.name, 'slow-clock');
  const out = plugin.transformIndexHtml(html);
  assert.match(out, /<head><script>\(function\(\)\{if\(Date\.__slowClock\)return;/);
  assert.match(out, /\*0\.7;/);
});

test('the injected clock runs at the rate of real time', () => {
  const [plugin] = slowClock('mock', '0.5');
  const script = /<script>(.*)<\/script>/.exec(plugin.transformIndexHtml(html))[1];
  const realNow = Date.now;
  let t = 1_000_000;
  Date.now = () => t;
  try {
    new Function(script)();
    const start = Date.now();
    t += 2000;
    assert.equal(Date.now() - start, 1000);
  } finally {
    Date.now = realNow;
    delete Date.__slowClock;
  }
});

test('the clock is slowed once, by whichever script runs first', () => {
  const [plugin] = slowClock('mock', '0.5');
  const script = /<script>(.*)<\/script>/.exec(plugin.transformIndexHtml(html))[1];
  const realNow = Date.now;
  let t = 1_000_000;
  Date.now = () => t;
  try {
    new Function(script)();
    new Function(script)();
    const start = Date.now();
    t += 2000;
    assert.equal(Date.now() - start, 1000, 'a second run did not slow it to a quarter');
  } finally {
    Date.now = realNow;
    delete Date.__slowClock;
  }
});

test('a product build, no rate, or a rate that is not between 0 and 1 injects nothing', () => {
  for (const [mode, rate] of [
    ['production', '0.7'],
    ['mock', undefined],
    ['mock', ''],
    ['mock', '1'],
    ['mock', '0'],
    ['mock', '2'],
    ['mock', 'fast'],
  ]) {
    assert.deepEqual(slowClock(mode, rate), [], `${mode} ${rate}`);
  }
});
