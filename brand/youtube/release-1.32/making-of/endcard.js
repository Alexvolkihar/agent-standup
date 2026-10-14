// The last picture of the video: the team at the office (brand/link-preview.svg) with the two lines a convinced viewer needs.   node endcard.js <repo> <out.png>
const fs = require('fs'), path = require('path'), [repo, out] = process.argv.slice(2), puppeteer = require(path.join(repo, 'node_modules/puppeteer-core'));
(async () => {
  const svg = fs.readFileSync(path.join(repo, 'brand/link-preview.svg'), 'utf8').replace(/<svg([^>]*) width="\d+" height="\d+"/, '<svg$1 width="1920" height="960"');
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--hide-scrollbars'] }), page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Figtree:wght@500;600&family=Gabarito:wght@800&display=swap" rel="stylesheet">
<body style="margin:0;overflow:hidden;background:#1b242d;font-family:Figtree,sans-serif"><div style="height:960px;overflow:hidden">${svg}</div>
<div style="height:120px;display:flex;align-items:center;justify-content:space-between;padding:0 64px;color:#f6f2ea;font-size:33px;font-weight:600"><span>Agent Standup 1.32 <span style="color:#f5c04a">·</span> free and open source <span style="color:#f5c04a">·</span> agent-standup.com</span><span style="font:500 26px ui-monospace,Menlo,monospace;color:#f5c04a">npx @double_geste/agent-standup --open</span></div>`, { waitUntil: 'load' });
  const ok = await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('800 20px Gabarito') && document.fonts.check('600 20px Figtree'); });
  if (!ok) throw new Error('the fonts did not load');
  fs.writeFileSync(out, await page.screenshot({ type: 'png' })); await browser.close(); console.log(out);
})();
