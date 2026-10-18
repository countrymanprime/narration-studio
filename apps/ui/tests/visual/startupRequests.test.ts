import { describe, expect, it } from 'vitest';
import { startupRequestProblems } from './lib/startupRequests';

const ORIGIN = 'http://localhost:4173';

describe('startupRequestProblems', () => {
  it('passes the app shell, its bundled assets and its icon', () => {
    const urls = [
      `${ORIGIN}/`,
      `${ORIGIN}/assets/index-abc123.js`,
      `${ORIGIN}/assets/barlow-latin-400.woff2`,
      `${ORIGIN}/favicon.png`,
      'data:image/svg+xml;base64,AAAA',
      'blob:http://localhost:4173/1',
    ];
    expect(startupRequestProblems(urls, ORIGIN)).toEqual([]);
  });

  it('names a request to another host', () => {
    const problems = startupRequestProblems(['https://fonts.googleapis.com/css2?family=Barlow'], ORIGIN);
    expect(problems).toEqual(['request to another origin: https://fonts.googleapis.com/css2?family=Barlow']);
  });

  it('names a request to another port or scheme of the same host', () => {
    expect(startupRequestProblems(['http://localhost:9999/x.js', 'https://localhost:4173/'], ORIGIN)).toHaveLength(2);
  });

  it('names a path nobody listed, including the browser default favicon', () => {
    const problems = startupRequestProblems([`${ORIGIN}/favicon.ico`, `${ORIGIN}/api/ping`, `${ORIGIN}/assets/sub/x.js`], ORIGIN);
    expect(problems).toHaveLength(3);
    expect(problems.every((problem) => problem.startsWith('request to an unexpected path'))).toBe(true);
  });
});
