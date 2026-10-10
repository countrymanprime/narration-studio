// node e2e/d3-shots.mjs  -> scratchpad/studio2-shots/D3/*.png  (APP_DIST=dist-D3)
import path from 'node:path'
import { launch, open, nav, SCRATCH } from './lib.mjs'
const OUT = path.join(SCRATCH, 'studio2-shots', 'D3')
const b = await launch()
const sizes = [[1440, 900], [1250, 800]]
const setupBy = async (p, label) => { await p.click('#mockbtn'); await p.getByText(label, { exact: true }).first().click(); await p.keyboard.press('Escape'); await p.mouse.click(700, 5) }
async function start(w, h, setup) {
  const p = await open(b, 'app', { w, h })
  if (setup) await setupBy(p, setup)
  await nav(p, 'Editing')
  await p.click('#chapsel')
  await p.locator('.pop button.item', { hasText: 'Advice' }).first().click()
  await p.click('[role="tab"][data-tab="takes"]')
  return p
}
const shot = async (p, name, w) => { await p.waitForTimeout(350); await p.screenshot({ path: path.join(OUT, name + '-' + w + '.png') }) }
for (const [w, h] of sizes) {
  // Choice setting: default (leave), then stack
  let p = await start(w, h)
  await p.click('tr[data-ps="ps5-5"]')
  await shot(p, '1-setting-leave', w)
  await p.getByRole('button', { name: 'Stack', exact: true }).click()
  await shot(p, '2-setting-stack-before', w)
  await p.click('#stackall')
  await shot(p, '3-confirm-reaper', w)
  await p.click('#stackgo')
  await p.click('tr[data-ps="ps5-5"]')
  await shot(p, '4-after-stacking', w)
  console.log(w, 'errors', p.errors.filter((e) => !/CERT/.test(e)))
  await p.context().close()
  // Audacity
  p = await start(w, h, 'Audacity (recordings live in the DAW)')
  await p.getByRole('button', { name: 'Stack', exact: true }).click()
  await p.click('tr[data-ps="ps5-5"]')
  await shot(p, '5-audacity-no-backups', w)
  await p.click('[role="tab"][data-tab="backups"]')
  await p.getByRole('checkbox', { name: 'Keep backups' }).click()
  await p.click('[role="tab"][data-tab="takes"]')
  await p.click('tr[data-ps="ps5-5"]')
  await p.click('#stackall')
  await shot(p, '6-confirm-audacity', w)
  await p.click('#stackgo')
  await p.click('tr[data-ps="ps5-5"]')
  await shot(p, '7-audacity-after', w)
  console.log(w, 'errors', p.errors.filter((e) => !/CERT/.test(e)))
  await p.context().close()
  // Leave + clean up
  p = await start(w, h)
  await p.click('tr[data-ps="ps5-5"]')
  await p.click('[data-tkeep="T05-3"]')
  await shot(p, '8-leave-keep-cleanup', w)
  await p.click('#tclean')
  await shot(p, '9-confirm-cleanup', w)
  await p.context().close()
}
await b.close()
