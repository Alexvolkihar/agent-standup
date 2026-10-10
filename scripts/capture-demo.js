// Makes the screenshots and the demo video used in the README / website / Marketplace, from the built-in demo session.
//   npm i --no-save puppeteer-core     (and have Chrome + ffmpeg installed)
//   node scripts/capture-demo.js [stills|video|all]
// Output goes to docs/media/. Nothing here touches your real Claude Code sessions: it only uses the fictional demo.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
let puppeteer; try { puppeteer = require('puppeteer-core'); } catch { puppeteer = require(path.join(process.env.PUPPETEER_DIR || '/tmp/as/pp', 'node_modules/puppeteer-core')); }
const root = path.join(__dirname, '..'), out = path.join(root, 'docs/media'), PORT = 4796;
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
fs.mkdirSync(out, { recursive: true });
const prefs = (lang) => JSON.stringify({ lang, voice: false, sfx: false, music: false, epi: false, vanish: true, view: 'call', langChosen: true });

const STILLS = [   // [file, query, viewport]
  ['hero', 'at=35', [1280, 720]], ['hero-fr', 'at=35&lang=fr', [1280, 720]],
  ['terminal', 'at=8', [1280, 720]], ['terminal-output', 'at=18', [1280, 720]],
  ['editor-diff', 'at=19', [1280, 720]], ['editor-read', 'at=6', [1280, 720]],
  ['todo', 'at=2', [1280, 720]], ['tree', 'at=38&view=tree', [1280, 720]], ['recap', 'at=47&recap=1', [1280, 720]],
];

(async () => {
  const mode = process.argv[2] || 'all';
  const server = require('../server.js').start(PORT); await new Promise((r) => server.once('listening', r));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument((p) => { try { localStorage.setItem('cc.prefs', p); } catch {} }, prefs('en'));
  if (mode === 'stills' || mode === 'all') {
    for (const [name, q, [w, h]] of STILLS) {
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1.5 });
      await page.goto(`http://localhost:${PORT}/?demo=1&${q}`, { waitUntil: 'networkidle0' });
      await new Promise((r) => setTimeout(r, 1500));
      await page.screenshot({ path: path.join(out, name + '.jpg'), type: 'jpeg', quality: 88 });
      console.log('still', name);
    }
  }
  if (mode === 'video' || mode === 'all') {
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    await page.goto(`http://localhost:${PORT}/?demo=1&speed=1.8`, { waitUntil: 'networkidle0' });
    const raw = path.join(out, 'raw.webm');
    const rec = await page.screencast({ path: raw });
    await page.evaluate(() => run(0));
    await page.waitForFunction(() => !S.playing, { timeout: 240000, polling: 500 });
    await new Promise((r) => setTimeout(r, 1500)); await rec.stop();
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-movflags', '+faststart', '-an', path.join(out, 'demo.mp4')]);
    fs.unlinkSync(raw); console.log('video demo.mp4');
  }
  await browser.close(); server.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
