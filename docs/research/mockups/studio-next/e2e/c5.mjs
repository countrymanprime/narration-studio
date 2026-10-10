import { launch, open, mockState } from './lib.mjs'
const b = await launch()
for (const theme of ['light','dark']) {
  const p = await open(b, 'app', { w: 420, h: 900, theme })
  await mockState(p, 'win', 'companion'); await p.waitForTimeout(250)
  await p.screenshot({ path: `../shots-bsc/app5-Companion-${theme}.png` })
  if (theme==='light') { await p.click('[data-cd=waive]'); await p.click('#cnext'); await p.waitForTimeout(200); await p.screenshot({ path: `../shots-bsc/app5-Companion-after.png` }) }
  await p.context().close()
}
await b.close()
