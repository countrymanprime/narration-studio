// Batch C1 screenshots: Booth states for the DAW plumbing. node e2e/c1-shots.mjs  (APP_DIST=dist-X, SHOTS=dir)
import { launch, open, nav } from './lib.mjs'
import path from 'node:path'
const OUT = path.resolve(process.env.SHOTS || '../studio2-shots/C1')
const b = await launch()
const chapter = async (p, re) => { await p.click('#chapsel'); await p.locator('.pop').getByText(re).first().click(); await p.waitForTimeout(200) }
const mock = async (p, text) => { await p.click('#mockbtn'); await p.getByText(text, { exact: true }).first().click(); await p.keyboard.press('Escape'); await p.mouse.click(5, 5) }
for (const [w, h] of [[1440, 900], [1250, 800]]) {
  let p = await open(b, 'app', { w, h })
  const shot = async (name) => { await p.evaluate(() => (document.activeElement)?.blur?.()); await p.mouse.move(w - 5, 400); await p.waitForTimeout(400); await p.screenshot({ path: `${OUT}/${name}-${w}.png` }) }
  const fresh = async () => { await p.close(); p = await open(b, 'app', { w, h }); await nav(p, 'Booth') }
  await nav(p, 'Booth')
  await shot('booth')
  await chapter(p, /Mad Tea-Party/)
  await shot('booth-resume-chip')
  await chapter(p, /Alice’s Evidence/)
  await shot('booth-no-track')
  await chapter(p, /Who Stole the Tarts/)
  await shot('booth-several-tracks')
  await chapter(p, /Opening credits/)
  await shot('booth-credits')
  await fresh()
  await mock(p, 'REAPER not running')
  await shot('booth-reaper-off')
  await fresh()
  await p.keyboard.press('Space'); await p.waitForTimeout(300)
  await p.keyboard.press('Escape'); await p.waitForTimeout(300)
  await shot('booth-stop-recording-dialog')
  await p.getByRole('button', { name: 'Keep recording' }).click()
  await p.keyboard.press('Space')
  await fresh()
  await mock(p, 'Audacity (recordings live in the DAW)')
  await shot('booth-audacity')
  await p.keyboard.press('Space'); await p.waitForTimeout(400)
  await p.keyboard.press('r'); await p.waitForTimeout(300)
  await shot('booth-roll-confirm')
  await p.getByRole('button', { name: 'Keep recording' }).click()
  await p.keyboard.press('Space')
  await fresh()
  // a take over the flagged places, then the side panel
  if (w < 1300) await p.click('#brailbtn')
  await p.keyboard.press('Space')
  await p.evaluate(() => { document.querySelectorAll('#tele p')[11]?.querySelector('.bu')?.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  await p.waitForTimeout(500)
  await p.keyboard.press('Space'); await p.waitForTimeout(500)
  await shot('booth-suspected')
  console.log(w, p.errors.filter((e) => !/ERR_CERT/.test(e)))
  await p.close()
}
// Mock states panel
const p = await open(b, 'app', { w: 1440, h: 900 })
await p.click('#mockbtn'); await p.waitForTimeout(300)
await p.screenshot({ path: `${OUT}/mock-panel-1440.png` })
await b.close()
