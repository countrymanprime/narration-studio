// Serves a built site folder, optionally under a sub-path, to try the site the way GitHub Pages will serve it.
//   node scripts/site/serve.mjs [dir=dist-site] [--base /narration-utils/] [--port 4180]
// With --base, a request outside it is a 404, so a page that reaches for `/assets/x.js` fails here as it would on Pages.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, normalize, resolve, sep } from 'node:path';
import { contentType } from './siteFiles.mjs';

function startServer({ dir, base = '/', port = 0 }) {
  const root = resolve(dir);
  const prefix = base.endsWith('/') ? base : `${base}/`;
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    if (path.includes('\0') || !path.startsWith(prefix)) {
      response.statusCode = 404;
      return response.end('not under the base path');
    }
    let file = normalize(join(root, path.slice(prefix.length)));
    if (file !== root && !file.startsWith(root + sep)) {
      response.statusCode = 403;
      return response.end();
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) {
      response.statusCode = 404;
      return response.end('not found');
    }
    response.setHeader('content-type', contentType(file));
    response.end(readFileSync(file));
  });
  return new Promise((done) => server.listen(port, () => done(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
  const dir = args.find((arg, index) => !arg.startsWith('--') && !args[index - 1]?.startsWith('--')) ?? 'dist-site';
  const server = await startServer({ dir, base: option('--base', '/'), port: Number(option('--port', 4180)) });
  console.log(`site: http://localhost:${server.address().port}${option('--base', '/')}`);
}
