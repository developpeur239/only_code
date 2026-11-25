// lookdev.mjs - renders lookdev/boite.html in headless Chromium and saves the canvas.
// node tools/lookdev.mjs <rt|pt> <out.png> [width] [height] [samples] [extra query]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');   // the machine's own Playwright
import fs from 'node:fs'; import path from 'node:path'; import url from 'node:url';
const [mode = 'rt', out = 'out/lookdev.png', w = '1280', h = '720', spp = '1', extra = ''] = process.argv.slice(2);
const here = path.dirname(url.fileURLToPath(import.meta.url));
const page_url = url.pathToFileURL(path.join(here, '../lookdev/boite.html')).href + `?mode=${mode}&w=${w}&h=${h}&cap=1${extra ? '&' + extra : ''}`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('console', m => console.log('page:', m.text()));
page.on('pageerror', e => console.log('page error:', e.message));
page.setDefaultTimeout(0);
await page.goto(page_url);
await page.waitForFunction(() => window.__READY || window.__ERR, null, { timeout: 0 });
const err = await page.evaluate(() => window.__ERR);
if (err) { console.log('shader error:\n' + err); process.exit(1); }
const n = +spp, chunk = mode === 'pt' ? 1 : 1, t0 = Date.now();
let done = 0;
while (done < n) {
  const r = await page.evaluate(k => window.__render(k), Math.min(chunk, n - done));
  done += Math.min(chunk, n - done);
  if (mode === 'pt' && (done % 8 === 0 || done === n)) {
    console.log(`${done}/${n} samples, ${(r.ms / 1000).toFixed(1)} s/sample, ${((Date.now() - t0) / 1000).toFixed(0)} s total`);
    const png = await page.evaluate(() => document.getElementById('c').toDataURL('image/png'));
    fs.writeFileSync(out, Buffer.from(png.split(',')[1], 'base64'));
  }
}
if (mode !== 'pt') {
  const png = await page.evaluate(() => document.getElementById('c').toDataURL('image/png'));
  fs.writeFileSync(out, Buffer.from(png.split(',')[1], 'base64'));
}
console.log('wrote', out, ((Date.now() - t0) / 1000).toFixed(1) + ' s');
await browser.close();
