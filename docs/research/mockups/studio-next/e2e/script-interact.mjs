import { launch, open, nav } from './lib.mjs'
const [target] = process.argv.slice(2)
const b = await launch()
const p = await open(b, target, { w: 1440, h: 900 })
await nav(p, 'Script'); await p.waitForTimeout(300)
const txt = (sel) => p.$$eval(sel, (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()))
// right-click a plain word
const w = await p.$('p[data-pid="8-3"]')
const box = await w.boundingBox()
await p.mouse.click(box.x + 60, box.y + 10, { button: 'right' }); await p.waitForTimeout(200)
console.log('ctx word:', JSON.stringify(await txt('.pop.ctx button.item, .pop.ctx .label')))
await p.hover('.pop.ctx button.item:has-text("Mark as")'); await p.waitForTimeout(200)
console.log('mark as:', JSON.stringify(await txt('.pop.ctx:nth-of-type(2) button.item')))
await p.screenshot({ path: `../shots-script/${target}-ctx.png` })
await p.keyboard.press('Escape'); await p.waitForTimeout(100)
// speaker chip click
const ph = await p.$('.phr-first[data-ph].phr-sug')
await ph.scrollIntoViewIfNeeded()
const rc = await ph.evaluate((el) => { const tn = (function f(n){for(const c of n.childNodes){if(c.nodeType===3&&c.textContent.trim())return c;if(c.nodeType===1){const r=f(c);if(r)return r}}return null})(el); const r=document.createRange(); r.setStart(tn,0); r.setEnd(tn,1); const q=r.getClientRects()[0]; return {l:q.left,t:q.top,h:q.height} })
await p.mouse.click(rc.l - 20, rc.t + rc.h / 2); await p.waitForTimeout(200)
console.log('chip menu:', JSON.stringify(await txt('.pop.ctx button.item, .pop.ctx .label')))
await p.keyboard.press('Escape')
// chapter list context
await p.click('#chlist [data-jump="5"]', { button: 'right' }); await p.waitForTimeout(150)
console.log('chapter ctx:', JSON.stringify(await txt('.pop.ctx button.item')))
await p.keyboard.press('Escape')
// click an annotation (pron) => words tab shows word
await p.click('.a-pron'); await p.waitForTimeout(150)
console.log('after pron click:', (await txt('#railbody .wordcard h3')).join('|'))
// Esc with find
await p.keyboard.press('Control+f'); await p.keyboard.type('queen'); await p.keyboard.press('Escape'); await p.waitForTimeout(100)
console.log('findbar hidden after Esc:', await p.$eval('#findbar', (e) => e.hidden))
// Alt+Arrow in script
const t0 = await p.$eval('#stk-t', (e) => e.textContent)
await p.focus('#rdscroll'); await p.keyboard.press('Alt+ArrowDown'); await p.waitForTimeout(300)
console.log('alt-down:', t0, '=>', await p.$eval('#stk-t', (e) => e.textContent))
console.log('errors', p.errors.filter((e) => !/CERT/.test(e)))
await b.close()
