// node e2e/edit-shots.mjs <out.png> [theme] [w] [h] [tab] [chapterText] [setupLabel] [action]
// Opens Editing on a chapter and tab; setupLabel is a Mock states radio label; action: add | addcap | confirm | keep | remove
import { launch, open, nav } from './lib.mjs'
const [out, theme = 'light', w = '1440', h = '900', tab = 'takes', chapter = 'Advice', setup = '', action = ''] = process.argv.slice(2)
const b = await launch()
const p = await open(b, 'app', { theme, w: +w, h: +h })
if (setup) {
  await p.click('#mockbtn')
  await p.getByText(setup, { exact: true }).first().click()
  await p.keyboard.press('Escape')
  await p.mouse.click(+w / 2, 5)
}
await nav(p, 'Editing')
await p.click('#chapsel')
await p.locator('.pop button.item', { hasText: chapter }).first().click()
await p.click(`[role="tab"][data-tab="${tab}"]`)
if (action === 'add' || action === 'addcap') {
  await p.click('#fxnew')
  if (action === 'addcap') { await p.fill('#fxstart', '100'); await p.fill('#fxend', '190'); await p.keyboard.press('Enter') }
}
if (action === 'keep') { await p.click('[data-tkeep="T05-2"]') }
if (action === 'wide' ) { await p.click('#fxnew'); await p.click('#fxscope'); await p.getByRole('option', { name: 'Whole track' }).click() }
await p.waitForTimeout(400)
await p.screenshot({ path: out })
if (p.errors.length) console.log('errors:', p.errors.filter((e) => !/CERT/.test(e)).slice(0, 5))
await b.close()
