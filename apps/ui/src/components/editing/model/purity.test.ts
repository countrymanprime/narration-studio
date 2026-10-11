import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = __dirname;
const sources = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.test.ts'));

describe('the editing model', () => {
  it('no-react-no-host: imports no React, api/, ports/ or studio/', () => {
    expect(sources.length).toBeGreaterThan(0);
    for (const f of sources) {
      const imports = [...readFileSync(join(dir, f), 'utf8').matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const spec of imports) {
        expect(spec, `${f} imports ${spec}`).not.toMatch(/^react($|\/)|^react-dom|\/api(\/|$)|\/ports(\/|$)|\/studio(\/|$)|wailsjs/);
        expect(spec.startsWith('.'), `${f} imports ${spec}`).toBe(true);
      }
    }
  });
});
