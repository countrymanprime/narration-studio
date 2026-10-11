// Batch I screenshots: Story Bible analysis tools. node e2e/i-shots.mjs (APP_DIST=dist-I)
import { launch, open, nav } from './lib.mjs'
import path from 'node:path'
const OUT = path.resolve(process.env.SHOTS || '../studio2-shots/I')
const b = await launch()
for (const [w, h] of [[1440, 900], [1250, 800]]) {
  const p = await open(b, 'app', { w, h })
  const shot = async (name) => { await p.waitForTimeout(350); await p.screenshot({ path: `${OUT}/${name}-${w}.png` }) }
  const settings = async () => { await nav(p, 'Settings'); await p.locator('#analysis').scrollIntoViewIfNeeded(); await p.evaluate(() => document.getElementById('analysis').scrollIntoView({ block: 'start' })) }
  // First-use prompt on the Story Bible.
  await nav(p, 'Story Bible')
  await p.click('#sbscan')
  await shot('first-use-prompt')
  await p.click('#ap-download')
  await shot('consent-pair')
  await p.keyboard.press('Escape')
  // Settings section, consent, progress.
  await settings()
  await shot('settings')
  await p.click('[data-comp-install="booknlp-big"]')
  await shot('consent-single')
  await p.click('#consent-go')
  await p.waitForTimeout(1300)
  await shot('progress')
  await p.click('[data-comp-cancel="booknlp-big"]')
  // Blocked host, then low disk (through the Mock states panel).
  await p.click('#mockbtn'); await p.getByText('Download blocked', { exact: true }).click(); await p.mouse.click(5, 5)
  await p.click('[data-comp-install="gliner"]'); await p.click('#consent-go'); await p.waitForTimeout(900)
  await shot('failed-blocked')
  await p.click('#mockbtn'); await p.getByText('Low disk space', { exact: true }).click(); await p.mouse.click(5, 5)
  await p.click('[data-comp-dismiss="gliner"]')
  await p.click('[data-comp-install="booknlp-big"]'); await p.click('#consent-go'); await p.waitForTimeout(500)
  await shot('failed-lowdisk')
  await p.click('[data-comp-dismiss="booknlp-big"]')
  await p.click('#mockbtn'); await p.getByText('Reachable', { exact: true }).click(); await p.mouse.click(5, 5)
  // Install GLiNER and BookNLP small, then scan.
  for (const id of ['gliner', 'booknlp-small']) {
    await p.click(`[data-comp-install="${id}"]`); await p.click('#consent-go')
    await p.waitForSelector(`[data-component="${id}"][data-status="installed"]`, { timeout: 15000 })
  }
  await shot('installed')
  await nav(p, 'Story Bible')
  await p.click('#sbscan')
  await p.waitForTimeout(500)
  await p.click('[data-sbe="the-pigeon"]')
  await shot('scan-pigeon')
  await p.click('[data-sbe="the-caterpillar"]')
  await shot('scan-caterpillar')
  await p.click('#sbverify')
  await p.waitForTimeout(200)
  await p.click('[data-sbs]').catch(() => {})
  await shot('scan-verify-queue')
  if (p.errors.length) console.log(w, 'errors:', p.errors.slice(0, 5))
  await p.context().close()
}
await b.close()
