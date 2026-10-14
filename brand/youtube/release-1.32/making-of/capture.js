// Records the release video of 1.32.0: the call of the real session that made it, followed live by the released app (the same recorder as the first video).
//   node capture.js <cues.js>      APP=<folder of the app to record>  SRC=<folder with the real records>  OUT=<folder>  SHOTS=<folder> (a picture every second, and what was said)
// The records are the real ones (the lead's file, one file per sub-agent, the second session), written again into a temporary folder at the times the cue sheet gives,
// each with the time it is written at: a time-lapse. Nothing is added to them and no text is changed; the cue sheet says which records are left out.
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const APP = process.env.APP, SRC = process.env.SRC, OUT = process.env.OUT || __dirname, SHOTS = process.env.SHOTS || '', PORT = 4799;
const puppeteer = require(path.join(APP, 'node_modules/puppeteer-core'));
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const W = +(process.env.W || 1440), H = W * 9 / 16, SCALE = 1920 / W;   // the page is 1440 x 810, recorded at 1920 x 1080
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'as-youtube-')), ROOT = path.join(tmp, 'projects');
for (const d of ['projects', 'characters']) fs.mkdirSync(path.join(tmp, d));
for (const f of ['you.png', 'you-talk.png']) fs.copyFileSync(path.join(process.env.CHARS, f), path.join(tmp, 'characters', f));   // the person is the vampire Arthur drew for himself; everyone else is the app's own cast
Object.assign(process.env, { AGENT_STANDUP_PROJECTS: ROOT, AGENT_STANDUP_CHARACTERS: path.join(tmp, 'characters'), AGENT_STANDUP_PREFS: path.join(tmp, 'prefs.json'), AGENT_STANDUP_CODEX: 'off', AGENT_STANDUP_VIBE: 'off' });

// ---- the real records, and where each stream is written again
const PROJ = '-Users-arthur-Documents-AgentStandup', MAIN = 'a97c23fb-4aa2-4c92-9eda-cc2e50582f6b', SECOND = process.env.SECOND;
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const streams = { main: { rec: read(MAIN + '.jsonl'), to: path.join(ROOT, PROJ, MAIN + '.jsonl') }, second: { rec: read(SECOND + '.jsonl'), to: path.join(ROOT, PROJ, SECOND + '.jsonl') } };
const subDir = path.join(SRC, MAIN, 'subagents');
for (const f of fs.readdirSync(subDir).filter((f) => f.endsWith('.jsonl'))) { const id = f.slice(6, -6); streams[id.slice(0, 4)] = { rec: read(path.join(MAIN, 'subagents', f)), to: path.join(ROOT, PROJ, MAIN, 'subagents', f), meta: path.join(subDir, f.replace('.jsonl', '.meta.json')) }; }
const KEEP = new Set(['user', 'assistant', 'queue-operation', 'ai-title']), left = {}; let clock = 0;
const drop = (name, i) => (left[name] = left[name] || new Set()).add(i);   // a record the video leaves out
function feed(name, from, to = from, at = 0) {   // records from..to of a stream, written now (at: a time in the past, for what happened before the call opens)
  const s = streams[name]; if (!s) throw new Error('no stream ' + name); fs.mkdirSync(path.dirname(s.to), { recursive: true });
  if (s.meta && !s.started) fs.copyFileSync(s.meta, s.to.replace('.jsonl', '.meta.json')); s.started = true;
  let out = ''; for (let i = from; i <= to; i++) { const r = s.rec[i]; if (!r || !KEEP.has(r.type) || (left[name] && left[name].has(i))) continue; clock = Math.max(clock + 1, at || Date.now()); out += JSON.stringify(r.timestamp ? { ...r, timestamp: new Date(clock).toISOString() } : r) + '\n'; }
  fs.appendFileSync(s.to, out);
}
const play = async (steps) => { const t0 = Date.now(); for (const [at, fn] of steps.slice().sort((a, b) => a[0] - b[0])) { const d = t0 + at * 1000 - Date.now(); if (d > 0) await sleep(d); fn(); } };
const find = (name, text, from = 0) => { const i = streams[name].rec.findIndex((r, i) => i >= from && JSON.stringify(r.message || r.content || '').includes(text)); if (i < 0) throw new Error('not found in ' + name + ': ' + text); return i; };

const PREFS = JSON.stringify({ lang: 'en', voice: true, vstyle: 'kokoro', vstyleChosen: true, office: false, music: false, epi: false, vanish: true, view: 'call', langChosen: true, banter: true, roster: true, reactions: false, charPack: 'folder', notify: false, notifyChosen: true });

(async () => {
  const cues = require(path.resolve(process.argv[2]))({ feed, find, drop, streams, sleep, play, MAIN, SECOND });
  cues.before();
  const kokoro = require(path.join(APP, 'kokoro.js')); kokoro.warm(); for (let i = 0; i < 240 && !kokoro.status().ready; i++) await sleep(500); if (!kokoro.status().ready) throw new Error('the voices are not ready: ' + JSON.stringify(kokoro.status()));
  const server = require(path.join(APP, 'server.js')).start(PORT); await new Promise((r) => server.once('listening', r));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--hide-scrollbars', '--force-device-scale-factor=' + SCALE] });
  const page = await browser.newPage(), errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.evaluateOnNewDocument((p) => { try { localStorage.setItem('cc.prefs', p); } catch {} }, PREFS);
  await page.setRequestInterception(true);
  let polled = 0; page.on('request', (req) => { if (/\/api\/board/.test(req.url())) polled = Date.now(); if (/\/api\/warm/.test(req.url())) req.respond({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); else if (/\/api\/translate|\/api\/quips/.test(req.url())) { let texts = []; try { texts = JSON.parse(req.postData() || '{}').texts || []; } catch {} req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ texts, ok: true }) }); } else req.continue(); });
  await page.setViewport({ width: W, height: H, deviceScaleFactor: SCALE });
  await page.goto(`http://localhost:${PORT}/?proj=${PROJ}&lang=en`, { waitUntil: 'load' }); await page.waitForFunction('typeof S !== "undefined" && document.querySelector("#gB")', { timeout: 15000 });
  await page.evaluate(() => document.querySelector('#gB').click()); await sleep(2500);   // no session yet: the page waits for one, and the Join button is behind that notice
  await page.evaluate(() => { const el = document.createElement('div'); el.id = 'vcur'; el.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24"><path d="M5 3l14 8-6 2-2 6z" fill="#fff" stroke="#10282f" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    el.style.cssText = 'position:fixed;left:1100px;top:600px;opacity:0;margin:-4px 0 0 -6px;z-index:2147483647;pointer-events:none;transition:left .7s cubic-bezier(.3,.7,.3,1),top .7s cubic-bezier(.3,.7,.3,1),opacity .3s;filter:drop-shadow(0 2px 3px rgba(0,0,0,.55))'; document.body.appendChild(el); });
  const point = async (sel, x = 0.5, y = 0.5) => { await page.evaluate((q, x, y) => { const r = q ? document.querySelector(q).getBoundingClientRect() : { left: 1100, top: 600, width: 0, height: 0 }, el = document.querySelector('#vcur'); el.style.opacity = q ? 1 : 0; el.style.left = r.left + r.width * x + 'px'; el.style.top = r.top + r.height * y + 'px'; }, sel, x, y); await sleep(900); };
  const click = async (sel) => { await point(sel); await page.click(sel); await sleep(500); point(''); };
  const seen = (fn, arg, ms = 60000) => page.waitForFunction(fn, { timeout: ms, polling: 100 }, arg), inSession = (id) => seen((k) => S.cur && S.cur.id === k, id);
  await page.evaluate(() => { window.__log = []; const o = window.startTalk, p = window.showPresent, t0 = Date.now(); window.__t0 = t0; window.startTalk = function (id, line) { window.__log.push(((Date.now() - window.__t0) / 1000).toFixed(1) + ' ' + id + ': ' + line); return o.apply(this, arguments); }; window.showPresent = function (id) { const was = S.present; const r = p.apply(this, arguments); if (S.present === id && was !== id) window.__log.push(((Date.now() - window.__t0) / 1000).toFixed(1) + ' [screen] ' + id + ' ' + document.querySelector('#ptitle').textContent); return r; }; });
  if (process.env.CAP) await page.evaluate((cap) => { const o = window.clipSpeech; window.clipSpeech = (t, c) => o(t, Math.min(c || 9999, cap)); }, +process.env.CAP);   // a time-lapse: each line is read up to about one sentence, as the app does when a call is behind (the bubble keeps the whole text)
  let shot = 0; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  for (const was = polled; polled === was;) await sleep(20); await sleep(1500);

  // sound: what the page plays for a video export (voices and sound effects), recorded beside the pictures
  await page.evaluate(() => { const rec = new MediaRecorder(AUD.rec.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 160000 }), chunks = []; rec.ondataavailable = (e) => e.data.size && chunks.push(e.data); window.__snd = { rec, chunks }; });
  const raw = path.join(tmp, 'call.webm'), rec = await page.screencast({ path: raw }); await page.evaluate(() => { window.__snd.rec.start(250); window.__t0 = Date.now(); });
  const t0 = Date.now(), marks = {}, mark = (k) => { marks[k] = (Date.now() - t0) / 1000; console.log('mark', k, marks[k].toFixed(1)); };
  const shots = SHOTS ? setInterval(() => { page.screenshot({ path: path.join(SHOTS, String(++shot).padStart(3, '0') + '.jpg'), type: 'jpeg', quality: 60 }).catch(() => {}); }, 1000) : null;
  const said = (text, ms = 60000) => seen((t) => window.__log.some((l) => l.includes(t)), text, ms);   // a line with these words has started
  const quiet = async (forMs = 500, ms = 90000) => { await page.evaluate(() => { window.__q = 0; clearInterval(window.__qi); window.__qi = setInterval(() => { window.__q = S.speakers.size ? 0 : window.__q + 100; }, 100); }); await seen((n) => window.__q >= n, forMs, ms); };   // nobody has spoken for that long
  await cues.run({ page, mark, seen, inSession, click, point, sleep, play, said, quiet, polled: () => polled, t0 });
  const total = (Date.now() - t0) / 1000;
  const snd = await page.evaluate(() => new Promise((res) => { const { rec, chunks } = window.__snd; rec.onstop = async () => { const b = new Uint8Array(await new Blob(chunks).arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768)); res(btoa(s)); }; rec.stop(); }));
  await rec.stop(); clearInterval(shots);
  const log = await page.evaluate(() => window.__log); await browser.close(); server.close(); require(path.join(APP, 'server.js')).shutdown(); kokoro.shutdown && kokoro.shutdown();
  if (errors.length) console.log('PAGE ERRORS: ' + errors.join(' | '));
  fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'voices.webm'), Buffer.from(snd, 'base64')); fs.copyFileSync(raw, path.join(OUT, 'call.webm'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-c', 'copy', path.join(OUT, 'call.mkv')]); const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(OUT, 'call.mkv')]).toString());
  fs.writeFileSync(path.join(OUT, 'take.json'), JSON.stringify({ total, dur, marks, log }, null, 1));
  console.log('take', total.toFixed(1) + 's', 'screencast', dur.toFixed(1) + 's'); console.log(log.join('\n'));
  fs.rmSync(tmp, { recursive: true, force: true }); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
