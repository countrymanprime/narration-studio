// Batch F screenshots: Production (target popover, readiness slide-over, report dialog), Proof (takes at a spot, recording check card).
import { launch, open, nav } from './lib.mjs'
import path from 'node:path'
const OUT = path.resolve(process.env.SHOTS || '../studio2-shots/F')
const b = await launch()
for (const [w, h] of [[1440, 900], [1250, 800]]) {
  let p = await open(b, 'app', { w, h })
  const shot = async (name) => { await p.evaluate(() => (document.activeElement)?.blur?.()); await p.waitForTimeout(350); await p.screenshot({ path: `${OUT}/${name}-${w}.png` }) }
  const esc = async () => { await p.keyboard.press('Escape'); await p.mouse.click(5, 5); await p.waitForTimeout(200) }
  // Production
  await shot('prod')
  await p.click('#target-info'); await p.waitForTimeout(300); await shot('prod-target-popover'); await esc()
  await p.click('[data-rchip="2"]'); await p.waitForTimeout(300); await shot('prod-readiness-ready')
  await p.click('#rd-confirm'); await p.waitForTimeout(300); await shot('prod-readiness-confirmed')
  await p.click('#rd-revert'); await p.waitForTimeout(300); await p.keyboard.press('Escape'); await p.waitForTimeout(200)
  await p.click('[data-rchip="3"]'); await p.waitForTimeout(300); await shot('prod-readiness-changed'); await p.keyboard.press('Escape')
  await p.click('[data-rchip="4"]'); await p.waitForTimeout(300); await shot('prod-readiness-notready'); await p.keyboard.press('Escape')
  await p.click('#exp'); await p.waitForTimeout(400); await shot('prod-report-dialog')
  await p.locator('[data-section="amount"]').click().catch(() => {}); await p.locator('[data-section="chapters"]').click(); await p.waitForTimeout(200); await shot('prod-report-dialog-toggled')
  await p.getByRole('button', { name: 'JSON' }).click(); await p.waitForTimeout(200); await shot('prod-report-json'); await esc()
  await p.keyboard.press('Escape')
  // Proof
  await nav(p, 'Proof')
  await p.click('[data-cs="5"]'); await p.waitForTimeout(300)
  await p.click('[data-wf]').catch(() => {})
  await p.click('tr[data-r="2"]'); await p.waitForTimeout(400)
  await shot('proof-takes-spot')
  await p.click('tr[data-r="1"]'); await p.waitForTimeout(400)
  await shot('proof-one-take')
  await p.click('tr[data-r="2"]'); await p.waitForTimeout(300)
  await p.click('#cc-check'); await p.waitForTimeout(900); await shot('proof-check-checking')
  await p.waitForTimeout(2500); await shot('proof-check-current')
  await p.click('#cc-findings'); await p.waitForTimeout(300); await shot('proof-check-findings')
  await p.locator('[data-accept]').first().click(); await p.waitForTimeout(300); await shot('proof-check-accepted')
  await p.close()
  p = await open(b, 'app', { w, h })
  await nav(p, 'Proof'); await p.click('[data-cs="5"]'); await p.waitForTimeout(400); await shot('proof-check-stale')
  await p.click('#chapsel'); await p.locator('.pop').getByText(/Mad Tea-Party/).first().click(); await p.waitForTimeout(400); await shot('proof-check-none')
  console.log(w, 'errors', p.errors.join(' | ') || 'none')
  await p.close()
}
await b.close()
