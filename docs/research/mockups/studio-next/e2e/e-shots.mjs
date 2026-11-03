// Editing (script as the editor): screenshots of every state the design shows, at 1440x900 and 1250x800, into scratchpad/studio2-shots/E.
import path from 'node:path'
import fs from 'node:fs'
import { launch, open, nav, SCRATCH } from './lib.mjs'
const out = path.join(SCRATCH, 'studio2-shots', 'E')
fs.mkdirSync(out, { recursive: true })
const only = process.env.ONLY ? process.env.ONLY.split(',') : null
const sizes = [[1440, 900], [1250, 800]]
const b = await launch()
const SETUPS = { reaper: null, builtin: 'Built-in recorder (recordings live in the app)', audacity: 'Audacity (recordings live in the DAW)' }
async function start(w, h, setup = 'reaper', theme = 'light') {
  const p = await open(b, 'app', { w, h, theme })
  if (SETUPS[setup]) {
    await p.click('#mockbtn')
    await p.getByText(SETUPS[setup], { exact: true }).first().click()
    await p.keyboard.press('Escape')
    await p.mouse.click(w / 2, 5)
  }
  await nav(p, 'Editing')
  await p.click('#chapsel')
  await p.locator('.pop button.item', { hasText: 'Advice' }).first().click()
  await p.waitForTimeout(200)
  return p
}
const word = (p, key) => p.locator(`[data-k="${key}"]`)
const shot = async (p, name, w) => { await p.waitForTimeout(250); await p.screenshot({ path: path.join(out, `${name}-${w}.png`) }); console.log('shot', name, w, p.errors.length ? 'ERRORS ' + p.errors.join(' | ') : '') }
const scrollTo = (p, pid) => p.evaluate((id) => { const c = document.querySelector('.sx-scroll'); const el = c.querySelector(`[data-pid="${id}"]`); c.scrollTop = Math.max(0, el.offsetTop - c.clientHeight * 0.1) }, pid)
const drag = async (p, a, z) => {
  const A = await word(p, a).boundingBox(); const Z = await word(p, z).boundingBox()
  await p.mouse.move(A.x + 2, A.y + A.height / 2); await p.mouse.down(); await p.mouse.move(Z.x + Z.width - 2, Z.y + Z.height / 2, { steps: 6 }); await p.mouse.up()
}
const run = (name, fn) => (!only || only.includes(name)) ? fn : null
const states = {
  idle: async (p) => { await scrollTo(p, '5-3'); await word(p, '5-3:15').click(); await p.keyboard.press('Space'); await p.waitForTimeout(900) },
  'extra-delete': async (p, w, setup) => { await scrollTo(p, '5-3'); await drag(p, '5-3:x0', '5-3:x3'); await p.keyboard.press('Delete'); await p.waitForSelector('#cutdlg') },
  'fx-menu': async (p) => { await scrollTo(p, '5-3'); await drag(p, '5-3:21', '5-3:26'); await p.keyboard.press('f'); await p.waitForSelector('.pop.ctx'); await p.locator('.pop.ctx button.item', { hasText: 'Voice polish' }).first().hover().catch(() => {}) },
  'fx-preview': async (p) => { await scrollTo(p, '5-3'); await drag(p, '5-3:21', '5-3:26'); await p.keyboard.press('f'); await p.waitForSelector('.pop.ctx'); await p.locator('.pop.ctx button.item').nth(1).click(); await p.waitForSelector('#fxdlg') },
  'takes-open': async (p) => { await scrollTo(p, '5-9'); await p.click('[data-tchip="ps5-9"]') },
  'takes-stacked': async (p) => { await p.click('#drawertoggle'); await p.click('[aria-label="How retries are kept in this chapter"] button:nth-child(1)'); await p.click('#drawerclose'); await scrollTo(p, '5-5'); await p.click('[data-tchip="ps5-5"]'); await p.click('#tstack'); await p.click('#stackgo'); await p.waitForTimeout(300); await scrollTo(p, '5-5') },
  'low-word': async (p) => { await scrollTo(p, '5-3'); await word(p, '5-3:31').click() },
  drawer: async (p) => { await scrollTo(p, '5-3'); await p.click('#drawertoggle') },
  'drawer-effects': async (p) => { await p.click('#drawertoggle'); await p.click('[role="tab"][data-tab="effects"]') },
  strip: async (p) => { await scrollTo(p, '5-9'); await p.click('[data-tchip="ps5-9"]').catch(() => {}); await word(p, '5-9:8').click(); await p.keyboard.press('s') },
  dup: async (p) => { await scrollTo(p, '5-15'); await word(p, '5-15:x0').click(); await p.keyboard.press('Enter') },
}
for (const [w, h] of sizes) {
  for (const [name, fn] of Object.entries(states)) {
    if (only && !only.includes(name)) continue
    const setups = name === 'extra-delete' ? ['reaper', 'audacity', 'builtin'] : ['reaper']
    for (const setup of setups) {
      const p = await start(w, h, setup)
      if (setup === 'audacity') { await p.click('#drawertoggle'); await p.click('[role="tab"][data-tab="backups"]'); await p.getByText('Keep backups', { exact: true }).click(); await p.click('#drawerclose'); await p.keyboard.press('Escape') }
      try { await fn(p, w, setup) } catch (e) { console.log('FAIL', name, setup, String(e).split('\n')[0]) }
      await shot(p, name + (setup === 'reaper' ? '' : '-' + setup), w)
      await p.context().close()
    }
  }
}
await b.close()
