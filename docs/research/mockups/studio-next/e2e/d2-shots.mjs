// Batch D2 screenshots: Booth, Proof (a window being resized, sticky footer), Editing. APP_DIST=dist-X node e2e/d2-shots.mjs
import { launch, open, nav } from './lib.mjs'
import path from 'node:path'
const OUT = path.resolve(process.env.SHOTS || '../studio2-shots/D2')
const b = await launch()
const errs = []
const chapter = async (p, re) => { await p.click('#chapsel'); await p.locator('.pop').getByText(re).first().click(); await p.waitForTimeout(200) }
for (const [w, h] of [[1440, 900], [1250, 800]]) {
  const p = await open(b, 'app', { w, h })
  const shot = async (name) => { await p.mouse.move(w - 5, 5); await p.waitForTimeout(350); await p.screenshot({ path: `${OUT}/${name}-${w}.png` }) }
  // Booth
  await nav(p, 'Booth'); await p.waitForTimeout(400)
  await shot('booth')
  await p.click('#blevels'); await p.waitForTimeout(300)
  await shot('booth-levels')
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await p.waitForTimeout(300)
  // Proof: chapter 5, drag the right edge of the window
  await nav(p, 'Proof'); await p.waitForTimeout(300)
  await p.click('[data-cs="5"]'); await p.waitForTimeout(300)
  await p.click('[data-wf]').catch(() => {})
  await p.click('tr[data-r="2"]'); await p.waitForTimeout(300)
  const e = await p.locator('[data-edge="end"]').boundingBox()
  await p.mouse.move(e.x + e.width / 2, e.y + e.height / 2)
  await p.mouse.down()
  await p.mouse.move(e.x + e.width / 2 + 120, e.y + e.height / 2, { steps: 6 })
  await p.waitForTimeout(250)
  await p.screenshot({ path: `${OUT}/proof-resizing-${w}.png` })
  await p.mouse.up()
  await shot('proof')
  await p.keyboard.press('Escape')
  // Editing
  await nav(p, 'Editing'); await p.waitForTimeout(300)
  await chapter(p, /Advice from a Caterpillar/)
  await p.click('tr[data-ps="ps5-5"]'); await p.waitForTimeout(300)
  await p.keyboard.press('Shift+ArrowUp'); await p.waitForTimeout(200)
  await shot('editing')
  errs.push(...p.errors.filter((x) => !/ERR_CERT/.test(x)))
  await p.close()
}
// Proof at about 900: the key hints stay at the bottom, scrolled and not
for (const [w, h] of [[900, 800], [1100, 800]]) {
  const p = await open(b, 'app', { w, h })
  await nav(p, 'Proof'); await p.waitForTimeout(300)
  await p.click('[data-cs="5"]'); await p.waitForTimeout(300)
  await p.screenshot({ path: `${OUT}/proof-top-${w}.png` })
  await p.evaluate(() => { document.querySelector('#main').scrollTop = 99999 })
  await p.waitForTimeout(300)
  await p.screenshot({ path: `${OUT}/proof-bottom-${w}.png` })
  errs.push(...p.errors.filter((x) => !/ERR_CERT/.test(x)))
  await p.close()
}
// Booth dark and Proof dark
{
  const p = await open(b, 'app', { w: 1440, h: 900, theme: 'dark' })
  await nav(p, 'Booth'); await p.waitForTimeout(400)
  await p.mouse.move(1435, 5); await p.waitForTimeout(300)
  await p.screenshot({ path: `${OUT}/booth-dark-1440.png` })
  await nav(p, 'Proof'); await p.click('[data-cs="5"]'); await p.waitForTimeout(400)
  await p.screenshot({ path: `${OUT}/proof-dark-1440.png` })
  errs.push(...p.errors.filter((x) => !/ERR_CERT/.test(x)))
}
console.log('errors:', errs)
await b.close()
