import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..', 'src')
const FIXTURES = join(SRC, 'fixtures') + sep
const CODES = ['ALICE', 'FIVE', 'SEVEN', 'QUEEN', 'DUCHESS', 'RABBIT', 'KNAVE']

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|css)$/.test(p) ? [p] : []
  })
}

/** Speakers come from the Story Bible. The sample book's speaker codes live only in src/fixtures. 'NARR' (narration) is allowed. */
describe('no hard-coded speakers', () => {
  it('names no sample speaker code outside src/fixtures', () => {
    const re = new RegExp('\\b(' + CODES.join('|') + ')\\b')
    const found: string[] = []
    for (const f of walk(SRC)) {
      if (f.startsWith(FIXTURES)) continue
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (re.test(line)) found.push(relative(join(SRC, '..'), f) + ':' + (i + 1) + '  ' + line.trim().slice(0, 100))
      })
    }
    expect(found, 'Derive speakers from the Story Bible:\n' + found.join('\n')).toEqual([])
  })
})
