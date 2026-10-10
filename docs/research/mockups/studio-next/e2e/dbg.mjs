import { launch, open, nav } from './lib.mjs'
const [w='1278', h='800', page='Settings'] = process.argv.slice(2)
const b = await launch(); const p = await open(b, 'app', { w:+w, h:+h })
await nav(p, page); await p.waitForTimeout(300)
console.log(await p.evaluate(() => {
  const de = document.documentElement
  const out = { docScroll: [de.scrollHeight, de.clientHeight], body: [document.body.scrollHeight, document.body.clientHeight], app: (()=>{const a=document.getElementById('app').getBoundingClientRect();return [a.top,a.height]})(), main: (()=>{const m=document.getElementById('main');return [m.scrollHeight,m.clientHeight]})() }
  const far = []
  document.querySelectorAll('body *').forEach(el => { const r = el.getBoundingClientRect(); if (r.bottom > de.clientHeight + 1 && !el.closest('#main') ) far.push(el.tagName+'.'+el.className+' '+Math.round(r.bottom)) })
  out.far = far.slice(0,8); return out }))
await b.close()
