// Renders the thumbnail of the Halloween pack video: thumbnail.png (1280 x 720), thumbnail-small.png (320 x 180, the size YouTube shows in a list) and thumbnail-no-price.png (the same without the price).
//   node brand/youtube/halloween-pack/render-thumbnail.js        from the repo root; needs puppeteer-core and a Chrome (CHROME_PATH), and the pack built in halloween-src/pack
// The layout is the one of the first video (brand/youtube/first-video): the words on top in Gabarito, the lead in the large framed tile, the others in small tiles. Here the lead is the pumpkin,
// and the small tiles are the rest of the cast in their rooms, three of them skeletons dressed three ways.
// The pictures of the pack are read at render time and are not kept in a drawing here: the pack is sold, only this finished picture is public.
const fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const here = __dirname, root = path.join(here, '../../..'), pack = path.join(root, 'halloween-src/pack'), W = 1280, H = 720, SMALL = 320;
const CHROME = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser', '/usr/bin/chromium'].find((p) => p && fs.existsSync(p));
if (!CHROME) { console.error('no Chrome found (set CHROME_PATH)'); process.exit(1); }
if (!fs.existsSync(path.join(pack, 'lead.png'))) { console.error('the pack is not built: node halloween-src/rooms.js && python3 halloween-src/build.py'); process.exit(1); }
const out = (name, data) => { fs.writeFileSync(path.join(here, name), data); console.log('  ' + name + '  ' + (data.length / 1024).toFixed(1) + ' KB'); };
const data = (f, type = 'image/png') => `data:${type};base64,` + fs.readFileSync(f).toString('base64'), pic = (f) => data(path.join(pack, f));

const INK = '#121a22', CREAM = '#f6f2ea', GOLD = '#f5c04a', PUMPKIN = '#f58a1f';
// a tile, as the app shows it: the room, the character's sheet over it, what it wears, its hands (and its laptop over them, when it has it out), then the room again from the desk line down
let n = 0;
function tile(x, y, w, h, name, worn = [], frame = '') {
  const id = 't' + ++n, r = Math.round(Math.min(w, h) * .1), box = `x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"`, img = (f) => `<image href="${pic(f)}" ${box}/>`;
  return `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/></clipPath><clipPath id="${id}d"><rect x="${x}" y="${y + h * 62 / 75}" width="${w}" height="${h}"/></clipPath>
    <g clip-path="url(#${id})">${img(name + '-bg.png')}${img(name + '.png')}${img(name + '-head.png')}${worn.filter((k) => !/^(laptop|sticker)/.test(k)).map((k) => img(`${name}+${k}.png`)).join('')}${img(name + '-hands.png')}${worn.includes('laptop') ? img(name + '-desk-dark.png') + worn.filter((k) => /^sticker/.test(k)).map((k) => img(`${name}+${k}.png`)).join('') : ''}<g clip-path="url(#${id}d)">${img(name + '-bg.png')}</g></g>
    ${frame ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="none" stroke="${frame}" stroke-width="6"/>` : ''}`;
}
// the lead on the left, nine tiles on the right: three columns, three rows
const BX = 44, BY = 172, BW = 452, BH = 514, GX = 528, GAP = 12, TW = Math.floor((W - 32 - GX - 2 * GAP) / 3), TH = Math.floor((BH - 2 * GAP) / 3);
const GRID = [['you'], ['ghost'], ['skeleton', ['hat-4', 'moustache-1']], ['cat'], ['skeleton', ['hat-2', 'glasses-1', 'eyes-1']], ['bat'], ['witch', ['laptop', 'sticker1-1', 'sticker2-3', 'sticker3-2']], ['wolf'], ['skeleton', ['hat-1', 'glasses-3']]];
const svg = (price) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${INK}"/>
  <text id="words" x="${BX - 6}" y="132" font-family="Gabarito" font-weight="800" font-size="164" letter-spacing="-3" fill="${CREAM}"><tspan fill="${PUMPKIN}">Halloween</tspan> pack</text>
  ${tile(BX, BY, BW, BH, 'lead', [], GOLD)}
  ${GRID.map(([name, worn], i) => tile(GX + (i % 3) * (TW + GAP), BY + Math.floor(i / 3) * (TH + GAP), TW, TH, name, worn)).join('\n  ')}
  ${price ? `<g transform="translate(${BX + BW - 56} ${BY + 66}) rotate(-10)"><circle r="78" fill="${GOLD}" stroke="${INK}" stroke-width="8"/><text y="26" text-anchor="middle" font-family="Gabarito" font-weight="800" font-size="76" fill="${INK}">2 €</text></g>` : ''}
</svg>`;

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--hide-scrollbars'] }), page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  const font = `<style>@font-face { font-family: Gabarito; src: url(${data(path.join(root, 'website/static/fonts/gabarito.woff2'), 'font/woff2')}) format('woff2'); font-weight: 400 900; }</style>`;   // the website's own copy of the font: no network needed
  const shoot = async (price) => {
    n = 0; await page.setContent(`<!doctype html><meta charset="utf-8">${font}<body style="margin:0;overflow:hidden;background:${INK}">${svg(price)}`, { waitUntil: 'load' });
    // the words are in Gabarito: the font must really be there, or the picture is refused
    const ok = await page.evaluate(async () => { await document.fonts.load('800 20px Gabarito'); await document.fonts.ready; return document.fonts.check('800 20px Gabarito'); });
    if (!ok) throw new Error('the font did not load: nothing written');
    const words = await page.evaluate(() => { const b = document.querySelector('#words').getBBox(); return [b.x, b.y, b.x + b.width, b.y + b.height].map(Math.round); });
    if (words[2] > W - 20) throw new Error('the words do not fit: ' + words.join(' '));
    console.log('  words box  ' + words.join(' ')); return page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: W, height: H } });
  };
  const png = await shoot(true); out('thumbnail.png', png);
  // the small copy is the big picture scaled down, as YouTube does, not the drawing rendered small
  const small = await page.evaluate(async (b64, w, h) => {
    const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
    let c = document.createElement('canvas'); c.width = im.width / 2; c.height = im.height / 2; let g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, c.width, c.height);
    const d = document.createElement('canvas'); d.width = w; d.height = h; g = d.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, w, h);
    return d.toDataURL('image/png').split(',')[1];
  }, png.toString('base64'), SMALL, SMALL * H / W);
  out('thumbnail-small.png', Buffer.from(small, 'base64'));
  out('thumbnail-no-price.png', await shoot(false));
  await browser.close();
})().catch((e) => { console.error(e.message || e); process.exit(1); });
