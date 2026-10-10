// node e2e/prod-shots.mjs  : captures Production/Schedule in the mock and the app for several states
import { launch, open, nav, mockState } from './lib.mjs'
const out = 'shots-prod/'
const b = await launch()
const states = [
  ['base', []], ['reaperoff', [['setup', 'reaper-off']]], ['builtin', [['setup', 'builtin']]], ['nomanu', [['manuscript', 'none']]],
  ['tight', [['deadline', 'tight']]], ['behind', [['deadline', 'behind']]], ['hd40', [['book', '40']]],
]
const sizes = [[1440, 900, 'd'], [1100, 800, 's']]
for (const [w, h, sn] of sizes) for (const theme of ['light', 'dark']) for (const [name, sets] of states) for (const pg of ['Production', 'Schedule']) {
  if (sn === 's' && name !== 'base') continue
  for (const t of ['mock', 'app']) {
    const p = await open(b, t, { w, h: sn === 'd' ? 1700 : h, theme })
    for (const [n, v] of sets) await mockState(p, n, v)
    await nav(p, pg)
    await p.waitForTimeout(200)
    await p.screenshot({ path: `${out}${pg[0]}-${name}-${sn}-${theme}-${t}.png` })
    if (p.errors.filter((e) => !/CERT|ERR_/.test(e)).length) console.log(t, name, pg, p.errors)
    await p.context().close()
  }
}
await b.close()
