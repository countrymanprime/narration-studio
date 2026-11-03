import { launch, open, nav, mockState } from './lib.mjs'
const out = '../shots/'
const b = await launch()
const states = {
  'proof-all': async (p) => { await nav(p, 'Proof') },
  'proof-chapter': async (p) => { await nav(p, 'Proof'); await p.click('[data-cs="5"]') },
  'proof-zoom': async (p) => { await nav(p, 'Proof'); await p.click('[data-cs="5"]'); await p.click('#wzout'); await p.focus('#wmini'); await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight') },
  'proof-takes': async (p) => { await nav(p, 'Proof'); await p.click('tr[data-r="10"]') },
  'proof-takes-kept': async (p) => { await nav(p, 'Proof'); await p.click('tr[data-r="10"]'); await p.click('[data-tkeep="T05-2"]') },
  'proof-cleanup': async (p) => { await nav(p, 'Proof'); await p.click('[data-cs="5"]'); await p.click('#cleanup') },
  'master': async (p) => { await nav(p, 'Master & QC') },
  'delivery-blocked': async (p) => { await nav(p, 'Delivery') },
  'delivery-ready': async (p) => { await mockState(p, 'dl', 'ready'); await nav(p, 'Delivery'); await p.click('#dbuild') },
  'delivery-custom': async (p) => { await nav(p, 'Delivery'); await p.click('#dprof'); await p.click('.pop [role="menuitemradio"]:nth-child(2), .pop .item:nth-child(2)') },
}
const only = process.argv[2]
const sizes = [[1440, 900], [1100, 800]]
const themes = process.argv[3] ? [process.argv[3]] : ['light', 'dark']
for (const [name, fn] of Object.entries(states)) {
  if (only && !name.startsWith(only)) continue
  for (const target of ['mock', 'app']) for (const theme of themes) for (const [w, h] of sizes) {
    const p = await open(b, target, { theme, w, h }); p.setDefaultTimeout(4000)
    try { await fn(p); await p.waitForTimeout(350); await p.screenshot({ path: `${out}${name}-${target}-${theme}-${w}.png` }) } catch (e) { console.log('FAIL', name, target, String(e).split('\n')[0]) }
    if (p.errors.length) console.log(name, target, 'errors', p.errors.slice(0, 3))
    await p.context().close()
  }
}
await b.close()
