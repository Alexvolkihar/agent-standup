// Renders the thumbnail of the first video: thumbnail.svg -> thumbnail.png (1280 x 720) and thumbnail-small.png (320 x 180, the size YouTube shows in a list).
//   node brand/youtube/first-video/render-thumbnail.js        from the repo root; needs puppeteer-core, a Chrome (CHROME_PATH) and the network for the font
const fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const here = __dirname, W = 1280, H = 720, SMALL = 320;
const CHROME = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser', '/usr/bin/chromium'].find((p) => p && fs.existsSync(p));
if (!CHROME) { console.error('no Chrome found (set CHROME_PATH)'); process.exit(1); }
const out = (name, data) => { fs.writeFileSync(path.join(here, name), data); console.log('  ' + name + '  ' + (data.length / 1024).toFixed(1) + ' KB'); };

(async () => {
  const svg = fs.readFileSync(path.join(here, 'thumbnail.svg'), 'utf8');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--hide-scrollbars'] }), page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Gabarito:wght@800&display=swap" rel="stylesheet"><body style="margin:0;overflow:hidden;background:#121a22">${svg}`, { waitUntil: 'load' });
  // the words are in Gabarito: the font must really be there, or the picture is refused
  const ok = await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('800 20px Gabarito') && [...document.fonts].some((f) => f.status === 'loaded'); });
  if (!ok) throw new Error('the font did not load (network?): thumbnail.png not written');
  const words = await page.evaluate(() => { const b = document.querySelector('#tv_scene text').getBBox(); return [b.x, b.y, b.x + b.width, b.y + b.height].map(Math.round); });
  console.log('  words box  ' + words.join(' '));
  const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: W, height: H } });
  out('thumbnail.png', png);
  // the small copy is the big picture scaled down, as YouTube does, not the drawing rendered small
  const small = await page.evaluate(async (b64, w, h) => {
    const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
    let c = document.createElement('canvas'); c.width = im.width / 2; c.height = im.height / 2; let g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, c.width, c.height);
    const d = document.createElement('canvas'); d.width = w; d.height = h; g = d.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, w, h);
    return d.toDataURL('image/png').split(',')[1];
  }, png.toString('base64'), SMALL, SMALL * H / W);
  out('thumbnail-small.png', Buffer.from(small, 'base64'));
  await browser.close();
})().catch((e) => { console.error(e.message || e); process.exit(1); });
