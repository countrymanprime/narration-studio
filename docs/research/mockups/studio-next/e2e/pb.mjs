// Pickups / Check dialog / Booth parity shots. APP_DIST=dist-pb node e2e/pb.mjs
import { launch, open, nav, mockState } from './lib.mjs'
import path from 'node:path'
const OUT = path.resolve(import.meta.dirname, '../../pbshots')
const b = await launch()
const scenes = {
  pickups: async (p) => { await nav(p, 'Pickups') },
  check: async (p) => { await nav(p, 'Pickups'); await p.click('#chk') },
  checkrun: async (p) => { await nav(p, 'Pickups'); await p.click('#chk'); await p.click('#ck-run'); await p.waitForTimeout(500) },
  addp: async (p) => { await nav(p, 'Pickups'); await p.click('#addp') },
  booth: async (p) => { await nav(p, 'Booth'); await p.waitForTimeout(500) },
  boothrec: async (p) => { await nav(p, 'Booth'); await p.keyboard.press(' '); await p.waitForTimeout(3600) },
  pick: async (p) => { await nav(p, 'Pickups'); await p.click('#rp'); await p.waitForTimeout(500) },
  builtin: async (p) => { await mockState(p, 'setup', 'builtin'); await nav(p, 'Booth'); await p.click('#baudio'); await p.waitForTimeout(300) },
  off: async (p) => { await mockState(p, 'setup', 'reaper-off'); await nav(p, 'Booth'); await p.click('#baudio'); await p.waitForTimeout(300) },
  text: async (p) => { await nav(p, 'Booth'); await p.click('#btext'); await p.waitForTimeout(300) },
}
const want = process.argv.slice(2)
for (const [name, fn] of Object.entries(scenes)) {
  if (want.length && !want.includes(name)) continue
  for (const [theme, w, h] of [['light', 1440, 900], ['dark', 1440, 900], ['light', 1100, 800]]) {
    for (const t of ['mock', 'app']) {
      const p = await open(b, t, { w, h, theme })
      try { await fn(p); await p.waitForTimeout(250) } catch (e) { console.log(name, t, 'ERR', String(e).slice(0, 120)) }
      await p.screenshot({ path: `${OUT}/${name}-${theme}-${w}-${t}.png` })
      if (p.errors.length) console.log(name, t, 'errors', p.errors.slice(0, 3))
      await p.context().close()
    }
  }
}
await b.close()
