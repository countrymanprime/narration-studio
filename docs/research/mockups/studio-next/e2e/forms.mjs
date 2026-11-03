// node e2e/forms.mjs [light|dark] : every page and each dialog/popover that holds controls, into shots-forms/
import { launch, open, nav } from './lib.mjs'
const theme = process.argv[2] || 'light'
const b = await launch()
const p = await open(b, 'app', { theme, w: 1440, h: 900 })
const out = (n) => `shots-forms/${n}-${theme}.png`
const step = async (name, fn) => { try { await fn(); await p.waitForTimeout(250); await p.screenshot({ path: out(name) }) } catch (e) { console.log('SKIP', name, String(e).split('\n').slice(0,12).join(' / ')) } }
const esc = async () => { await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await p.waitForTimeout(100); if (await p.$('.scrim')) await p.mouse.click(700, 4) }
const go = async (l) => { await esc(); await esc(); await nav(p, l) }
for (const l of ['Production', 'Schedule', 'Script', 'Story Bible', 'Proof', 'Pickups', 'Master & QC', 'Delivery', 'Settings']) {
  await step('page-' + l.replace(/\W+/g, ''), async () => { await go(l) })
}
await step('jump', async () => { await p.keyboard.press('Control+k') }); await esc()
await go('Production')
await step('import', async () => { await p.click('#repl') }); await esc()
await go('Script')
await step('reader-text', async () => { await p.click('#m-text') })
await step('reader-text-select-open', async () => { await p.click('#ts-f') }); await esc()
await step('speaker', async () => { await p.click('.phr-first[data-ph]', { button: 'left' }) }); await esc()
await go('Pickups')
await step('check', async () => { await p.click('#chk') })
await step('check-select-open', async () => { await p.click('#ck-m') }); await esc()
await step('addpickup', async () => { await p.click('#addp') }); await esc()
await go('Script')
await step('marks', async () => {
  await p.dblclick('.rd-scroll p >> nth=1'); await p.waitForTimeout(200)
  await p.click('.seltool [data-mk], .seltool button >> nth=0').catch(() => {})
  await p.click('[data-mm]')
})
await go('Delivery')
await step('delivery-custom', async () => { await p.click('#dprof'); await p.click('[role=menuitemradio]:has-text("Custom")') })
await go('Story Bible')
await step('bible-edit', async () => { await p.click('#sbedit') })
await go('Proof')
await step('proof-find', async () => { await p.click('#pfopen') })
await go('Script')
await step('script-find', async () => { await p.keyboard.press('Control+f') }); await p.keyboard.press('Escape')
await go('Schedule')
await step('schedule-bottom', async () => { await p.evaluate(() => document.querySelector('#msn')?.scrollIntoView()) })
await go('Settings')
await step('settings-bottom', async () => { await p.evaluate(() => document.querySelector('#sbtnew')?.scrollIntoView()) })
await go('Booth')
await step('booth', async () => {})
await step('booth-levels', async () => { await p.click('#blevels', { timeout: 3000 }) })
await step('booth-text', async () => { await p.mouse.click(600, 200); await p.click('#btext') })
await step('mock', async () => { await p.click('#mockbtn') }); await esc()
await step('project', async () => { await p.click('#projbtn') }); await esc()
console.log('errors', p.errors.filter((e) => !/CERT|ERR_/.test(e)))
await b.close()
