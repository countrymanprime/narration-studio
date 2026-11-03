// Turn the single-file build (a full HTML document) into the page content an Artifact expects:
// title, fonts link, one <style>, a root element and one inline module script. No doctype/html/head/body tags.
import fs from 'node:fs'
const [, , input = 'dist-single/index.html', output = 'artifact.html'] = process.argv
const html = fs.readFileSync(input, 'utf8')
const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? 'Narration Studio'
const links = [...html.matchAll(/<link[^>]*(?:preconnect|fonts\.googleapis\.com)[^>]*>/g)].map((m) => m[0]).join('\n')
const styles = [...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0]).join('\n')
const scripts = [...html.matchAll(/<script[^>]*type="module"[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0]).join('\n')
if (!scripts) throw new Error('no inline module script found; build with SINGLE=1')
const out = `<title>${title}</title>\n${links}\n${styles}\n<div id="root"></div>\n${scripts}\n`
fs.writeFileSync(output, out)
console.log(output, (out.length / 1024).toFixed(0) + ' KB')
