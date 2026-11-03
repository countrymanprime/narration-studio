import { launch, open, nav } from './lib.mjs'
const b = await launch()
for (const t of ['mock', 'app']) {
  const p = await open(b, t, {})
  await nav(p, process.argv[2] || 'Proof')
  const r = await p.evaluate((sels) => sels.map((s) => { const e = document.querySelector(s); if (!e) return s + ' none'; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return s + ' ' + [r.x, r.y, r.width, r.height].map((n) => Math.round(n * 10) / 10).join(',') + ' lh=' + cs.lineHeight + ' fs=' + cs.fontSize + ' ff=' + cs.fontFamily.slice(0, 20) }), process.argv.slice(3))
  console.log(t, '\n' + r.join('\n'))
}
await b.close()
