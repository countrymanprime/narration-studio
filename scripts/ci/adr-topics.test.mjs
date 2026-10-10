import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { ADR_DIR, readAdrs } from './adr-index.mjs';
import { TOPICS_CONFIG, TOPICS_FILE, compileTopics, configProblems, groupAdrs, renderTopics, statusWord, topicOf } from './adr-topics.mjs';
import { REPO_ROOT } from './layout.mjs';

const adr = (number, title, status = 'Accepted') => ({ number, file: `${number}-x.md`, title, status });
const topics = (...defs) => compileTopics({ topics: defs });

test('statusWord keeps the first word, so an amended ADR groups with its status', () => {
  assert.equal(statusWord('Accepted (amended by ADR 0412)'), 'Accepted');
  assert.equal(statusWord('Proposed'), 'Proposed');
  assert.equal(statusWord('Superseded by ADR-0100'), 'Superseded');
});

test('topicOf returns the first topic whose pattern hits the title, ignoring case', () => {
  const t = topics({ id: 'a', match: ['reaper'] }, { id: 'b', match: ['reaper', 'daw'] });

  assert.equal(topicOf(adr('0001', 'The REAPER bridge'), t), 'a');
  assert.equal(topicOf(adr('0002', 'A DAW port'), t), 'b');
  assert.equal(topicOf(adr('0003', 'Nothing relevant'), t), undefined);
});

test('a pin beats a pattern in an earlier topic', () => {
  const t = topics({ id: 'a', match: ['reaper'] }, { id: 'b', pins: ['0001'] });

  assert.equal(topicOf(adr('0001', 'The REAPER bridge'), t), 'b');
});

test('groupAdrs lists each ADR once, in number order, and returns the ones no topic claims', () => {
  const t = topics({ id: 'a', match: ['reaper'] }, { id: 'b', match: ['reaper', 'daw'] });
  const { groups, unclaimed } = groupAdrs([adr('0003', 'A DAW port'), adr('0001', 'REAPER one'), adr('0002', 'REAPER two'), adr('0004', 'Other')], t);

  assert.deepEqual(groups.get('a').map((a) => a.number), ['0001', '0002']);
  assert.deepEqual(groups.get('b').map((a) => a.number), ['0003']);
  assert.deepEqual(unclaimed.map((a) => a.number), ['0004']);
});

test('configProblems names a pin that is not an ADR and a repeated topic id', () => {
  const t = topics({ id: 'a', pins: ['0099'] }, { id: 'a' });

  assert.deepEqual(configProblems(t, [adr('0001', 'x')]), ['a pins 0099, which is not an ADR', 'topic id a is used twice']);
});

test('renderTopics shows a count per topic and one row per ADR with its status word', () => {
  const t = topics({ id: 'a', title: 'Alpha', summary: 'About a.', match: ['reaper'] });
  const text = renderTopics([adr('0001', 'REAPER bridge', 'Accepted (amended by ADR 0002)')], t);

  assert.match(text, /\| \[Alpha\]\(#a\) \| 1 \|/);
  assert.match(text, /\| \[0001\]\(0001-x\.md\) \| REAPER bridge \| Accepted \|/);
});

test('the shipped topics file is current and every ADR has a topic', () => {
  const adrs = readAdrs(join(REPO_ROOT, ADR_DIR));
  const shipped = compileTopics(JSON.parse(readFileSync(join(REPO_ROOT, TOPICS_CONFIG), 'utf8')));

  assert.deepEqual(configProblems(shipped, adrs), []);
  assert.deepEqual(groupAdrs(adrs, shipped).unclaimed.map((a) => `${a.number} ${a.title}`), []);
  assert.equal(
    readFileSync(join(REPO_ROOT, TOPICS_FILE), 'utf8'),
    renderTopics(adrs, shipped),
    `${TOPICS_FILE} is stale. Run: node scripts/ci/adr-topics.mjs --write`,
  );
});
