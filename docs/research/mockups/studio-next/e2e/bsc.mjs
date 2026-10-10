import { launch, open, nav, mockState } from './lib.mjs'
const out = process.argv[2]
const b = await launch()
for (const [target, label] of [['mock', 'Story Bible'], ['app', 'Story Bible'], ['mock', 'Settings'], ['app', 'Settings']]) {
  for (const theme of ['light', 'dark']) for (const [w, h] of [[1440, 900], [1100, 800]]) {
    const p = await open(b, target, { theme, w, h })
    await nav(p, label)
    await p.waitForTimeout(250)
    await p.screenshot({ path: `${out}/${target}-${label.replace(/\W/g, '')}-${theme}-${w}.png` })
    if (p.errors.length) console.log(target, label, p.errors.slice(0, 3))
    await p.context().close()
  }
}
// Settings dict states
for (const target of ['mock', 'app']) {
  const p = await open(b, target, { w: 1440, h: 900 })
  await nav(p, 'Settings')
  await mockState(p, 'dict', 'missing'); await mockState(p, 'net', 'offline')
  await p.waitForTimeout(200)
  await p.screenshot({ path: `${out}/${target}-Settings-dict-1440.png` })
  await p.context().close()
}
// Companion at 5 (mock hard-codes ch 5)
for (const target of ['mock', 'app']) for (const theme of ['light', 'dark']) {
  const p = await open(b, target, { w: 420, h: 900, theme })
  await mockState(p, 'win', 'companion')
  if (target === 'app') await p.evaluate(() => 0)
  await p.waitForTimeout(250)
  await p.screenshot({ path: `${out}/${target}-Companion-${theme}.png` })
  if (p.errors.length) console.log(target, 'companion', p.errors.slice(0, 3))
  await p.context().close()
}
await b.close()
