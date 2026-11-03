import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..', 'src')
const PRIMITIVES = join(SRC, 'ui', 'primitives') + sep

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : []
  })
}

/** Every form control comes from src/ui/primitives. A native element is allowed only with `native-control-ok: <why>` on the same line. */
describe('no raw form controls', () => {
  it('has no <input>, <select> or <textarea> outside src/ui/primitives', () => {
    const found: string[] = []
    for (const f of walk(SRC)) {
      if (f.startsWith(PRIMITIVES)) continue
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (/<(input|select|textarea)\b/.test(line) && !line.includes('native-control-ok')) found.push(relative(join(SRC, '..'), f) + ':' + (i + 1) + '  ' + line.trim().slice(0, 100))
      })
    }
    expect(found, 'Use Input, Select, Textarea, Slider or NumberInput from @/ui/primitives:\n' + found.join('\n')).toEqual([])
  })
})
