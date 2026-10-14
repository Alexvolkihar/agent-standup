// The thumbnail of the artifacts video: the bingo card pinned in the call (a frame of the take), with the words.   node thumbnail.js   (from anywhere; needs Chrome and the network for the font)
const fs = require('fs'), path = require('path'), puppeteer = require(path.join(__dirname, '../../../../../node_modules/puppeteer-core'));
(async () => {
  const img = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(__dirname, 'bingo-frame.jpg')).toString('base64');
  const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' }), p = await b.newPage();
  await p.setViewport({ width: 1280, height: 720 });
  await p.setContent(`<!doctype html><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Gabarito:wght@800&display=swap" rel="stylesheet">
<body style="margin:0;width:1280px;height:720px;overflow:hidden;background:#10282f;font-family:Gabarito,sans-serif;position:relative">
<div style="position:absolute;inset:0;background:url(${img}) no-repeat;background-size:1834px auto;background-position:-470px -120px"></div>
<div style="position:absolute;inset:0;background:linear-gradient(90deg,#10282f 0%,#10282f 46%,#10282f00 56%)"></div>
<div style="position:absolute;left:56px;top:70px;color:#f6f2ea;font-weight:800;line-height:.95;letter-spacing:-2px">
<div style="font-size:120px;color:#f5c04a">Your agents</div><div style="font-size:120px">publish.</div><div style="font-size:120px;margin-top:22px">The call</div><div style="font-size:120px">shows it.</div></div>
<div style="position:absolute;left:60px;bottom:52px;background:#e8845f;color:#2c2f40;font-weight:800;font-size:40px;padding:8px 22px;border-radius:14px">Agent Standup 1.32</div></body>`, { waitUntil: 'load' });
  if (!(await p.evaluate(async () => { await document.fonts.ready; return document.fonts.check('800 20px Gabarito'); }))) throw new Error('the font did not load');
  fs.writeFileSync(path.join(__dirname, '../thumbnail.png'), await p.screenshot({ type: 'png' })); await b.close(); console.log('thumbnail.png');
})();
