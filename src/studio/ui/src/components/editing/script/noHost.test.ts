// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const DIR = new URL('.', import.meta.url);
const sources = readdirSync(DIR).filter((f) => /\.tsx?$/.test(f) && !/\.(test|stories)\./.test(f));

describe('no-host-in-components', () => {
  it('reaches the host only through usePort and imports no api module', () => {
    expect(sources.length).toBeGreaterThan(5);
    for (const file of sources) {
      const text = readFileSync(new URL(file, DIR), 'utf8');
      expect(text, file).not.toMatch(/\buseApi\s*\(/);
      expect(text, file).not.toMatch(/from '(\.\.\/)+api\//);
      expect(text, file).not.toMatch(/wailsjs|wailsClient/);
    }
  });
});
