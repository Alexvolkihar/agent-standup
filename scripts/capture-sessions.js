// Records the short video for 1.31.0 (under a minute, captioned, with original synthesised music): several sessions at once.
//   node scripts/capture-sessions.js                    → docs/media/promo-sessions.mp4       (needs puppeteer-core, Chrome and ffmpeg, like capture-promo.js)
//   CAPTURE_LANG=fr node scripts/capture-sessions.js    → docs/media/promo-sessions-fr.mp4
// What is on screen is the real app, followed live: three made-up Claude Code sessions of one project are written record by record, the way Claude Code writes them,
// into a temporary folder that the real server reads. The first one is the call: the lead and its three agents, a fix, the tests again, the files made for you.
// The second one stops on a question (the visitor, then the call goes there and comes back by its tab); the third one ends its turn.
// Nothing here reads your real sessions or settings: every folder the server looks at is a temporary one, and the drawn characters are used.
//   SESSIONS_VIDEO_SHOTS=<folder>   also saves a picture every second and prints what was said and shown, to check a change of the scenario
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
let puppeteer; try { puppeteer = require('puppeteer-core'); } catch { puppeteer = require(path.join(process.env.PUPPETEER_DIR || '/tmp/as/pp', 'node_modules/puppeteer-core')); }
const root = path.join(__dirname, '..'), out = path.join(root, 'docs/media'), PORT = 4798;
const LANG = process.env.CAPTURE_LANG === 'fr' ? 'fr' : 'en', SUF = LANG === 'fr' ? '-fr' : '', T = (en, fr) => (LANG === 'fr' ? fr : en);
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', SHOTS = process.env.SESSIONS_VIDEO_SHOTS || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'as-sessions-video-')), ROOT = path.join(tmp, 'projects');
for (const d of ['projects', 'characters']) fs.mkdirSync(path.join(tmp, d));
Object.assign(process.env, { AGENT_STANDUP_PROJECTS: ROOT, AGENT_STANDUP_CHARACTERS: path.join(tmp, 'characters'), AGENT_STANDUP_PREFS: path.join(tmp, 'prefs.json'), AGENT_STANDUP_KOKORO_DIR: path.join(tmp, 'kokoro'), AGENT_STANDUP_CODEX: 'off', AGENT_STANDUP_VIBE: 'off' });

// ---- a session being written: one record per line, each message with what it used, as Claude Code does
const PROJ = '-Users-dev-work-shop', WORK = '/Users/dev/work/shop', F = (f) => path.join(WORK, f); let nId = 0;
function session(id, title) {
  const main = path.join(ROOT, PROJ, id + '.jsonl'), subDir = path.join(ROOT, PROJ, id, 'subagents'), sub = (k) => path.join(subDir, `agent-a${k}.jsonl`), turns = {}; fs.mkdirSync(subDir, { recursive: true });
  const put = (o, r) => fs.appendFileSync(o.sub ? sub(o.sub) : main, JSON.stringify({ timestamp: new Date(o.at || Date.now()).toISOString(), cwd: WORK, sessionId: id, ...r }) + '\n');
  const msg = (o, content, stop) => { const k = (turns[o.sub || 0] = (turns[o.sub || 0] || 0) + 1), big = o.sub ? 1 : 2.4;   // what a message used grows with the conversation; most of it is read from the cache and is not in the headline
    put(o, { type: 'assistant', message: { id: o.id || 'msg_' + ++nId, role: 'assistant', model: o.sub ? 'claude-sonnet-5-5' : 'claude-opus-5-5', stop_reason: stop, usage: { input_tokens: Math.round(big * (1400 + 520 * k)), output_tokens: Math.round(big * (180 + (k * 137) % 420)), cache_read_input_tokens: Math.round(big * (21000 + 5200 * k)), cache_creation_input_tokens: 0 }, content } }); };
  const s = {
    id,
    user: (text, o = {}) => put(o, { type: 'user', message: { role: 'user', content: text } }),
    say: (text, o = {}) => msg(o, [{ type: 'text', text }], o.end ? 'end_turn' : 'tool_use'),
    think: (text, o = {}) => msg(o, [{ type: 'thinking', thinking: text, signature: 'x' }], 'tool_use'),
    tool: (name, input, o = {}) => { const tid = 'toolu_' + ++nId; msg(o, [{ type: 'tool_use', id: tid, name, input }], 'tool_use'); return tid; },
    result: (tid, text, o = {}) => put(o, { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tid, content: text, ...(o.err ? { is_error: true } : {}) }] } }),
    launch: (k, type, desc, prompt, o = {}) => { const tid = s.tool('Agent', { description: desc, prompt, subagent_type: type }, o); fs.writeFileSync(path.join(subDir, `agent-a${k}.meta.json`), JSON.stringify({ agentType: type, description: desc, toolUseId: tid })); put({ sub: k }, { type: 'user', message: { role: 'user', content: prompt } }); return tid; },
  };
  put({ at: Date.now() - 11 * 60e3 }, { type: 'ai-title', aiTitle: title }); return s;
}
// what happens, second by second: each step is written when its time comes
const play = async (steps) => { const t0 = Date.now(); for (const [at, fn] of steps.sort((a, b) => a[0] - b[0])) { const d = t0 + at * 1000 - Date.now(); if (d > 0) await sleep(d); fn(); } };

const A = { title: T('Ship the checkout redesign', 'Livrer la refonte du paiement') }, B = { title: T('Migrate billing to the new payments SDK', 'Migrer la facturation vers le nouveau SDK') }, C = { title: T('Write the onboarding docs', 'Écrire la doc d’onboarding') };
const PHONES = 'npx playwright test checkout --project=phones', SUMMARY = F('src/checkout/summary.js'), NOTES = F('docs/release-notes.md'), REVIEW = F('docs/checkout-review.md');
const FAIL = 'Running 42 tests using 4 workers\n\n  ✓  41 passed\n  ✘  1 failed\n\n  1) checkout.spec.js:88 › total with a coupon › iPhone SE\n     Expected: "€ 89.99"\n     Received: "€ 90.00"\n\n  1 failed, 41 passed (12.4s)';
const PASS = 'Running 42 tests using 4 workers\n\n  ✓  42 passed (11.8s)\n\n  iPhone SE · iPhone 15 · Pixel 8 · Galaxy S24';
const ROUND = 'export function summary(cart) {\n  const total = cartTotal(cart);\n  return { lines: cart.items.length, total: Math.round(total * 100) / 100 };\n}\n';
let a, b, c, jobs = {};

// 1. the order, three agents at work; a second and a third session start, the third one ends its turn and the second one asks its question
const first = (done, ask) => [
  [0.6, () => a.user(T('Ship the checkout redesign: review, phone tests, release notes.', 'Livre la refonte du paiement : relecture, tests sur téléphone, notes de version.'))],
  [2.4, () => { const o = { id: 'msg_fanout' }; a.say(T('Three jobs, three agents.', 'Trois tâches, trois agents.'), o);
    jobs.review = a.launch(1, 'code-reviewer', T('Review the checkout diff', 'Relire le diff du paiement'), T('Flag anything that changes a total.', 'Signale tout ce qui change un total.'), o);
    jobs.phones = a.launch(2, 'general-purpose', T('Test it on phones', 'Tester sur téléphone'), T('Run the checkout tests on phone screens. Report every failure.', 'Lance les tests du paiement sur écran de téléphone. Rapporte chaque échec.'), o);
    jobs.notes = a.launch(3, 'general-purpose', T('Write the release notes', 'Écrire les notes de version'), T('Write the release notes for 2.4.0 from the commits since 2.3.0.', 'Écris les notes de version de la 2.4.0 à partir des commits depuis la 2.3.0.'), o); }],
  [5.0, () => { jobs.r1 = a.tool('Read', { file_path: F('src/checkout/cart.js') }, { sub: 1 }); }],
  [5.4, () => { jobs.p2 = a.tool('Read', { file_path: F('test/checkout.spec.js') }, { sub: 2 }); }],
  [6.6, () => a.result(jobs.p2, 'test("total with a coupon", async ({ page }) => {\n  await expect(page.locator(".total")).toHaveText("€ 89.99");\n});\n', { sub: 2 })],
  [11.0, () => { jobs.p1 = a.tool('Bash', { command: PHONES, description: T('Run the checkout tests on phones', 'Lancer les tests du paiement sur téléphone') }, { sub: 2 }); }],
  [5.8, () => { jobs.n1 = a.tool('Bash', { command: 'git log --oneline v2.3.0..HEAD' }, { sub: 3 }); }],
  [6.3, () => a.result(jobs.r1, 'export function cartTotal(cart) {\n  const sum = cart.items.reduce((s, i) => s + i.price * i.qty, 0);\n  const off = cart.coupon ? sum * cart.coupon.percent / 100 : 0;\n  return Math.round((sum - off) * 100) / 100;\n}\n', { sub: 1 })],
  [6.8, () => { jobs.r2 = a.tool('Grep', { pattern: 'Math.round', path: F('src/checkout') }, { sub: 1 }); }],
  [7.2, () => a.result(jobs.n1, '9f2c1aa Checkout: one page instead of three\n51b07de Checkout: coupon field on the summary\n7ad3e02 Checkout: Apple Pay and Google Pay buttons\nc41e9b3 Checkout: address autocomplete\n02fd6c8 Checkout: keep the cart after a failed payment\ne8a7714 Checkout: larger tap targets on phones\n3b6d2f0 Fix: shipping estimate for islands', { sub: 3 })],
  [7.8, () => a.result(jobs.r2, 'src/checkout/cart.js:4:  return Math.round((sum - off) * 100) / 100;\nsrc/checkout/summary.js:3:  return { lines: cart.items.length, total: Math.round(total * 100) / 100 };', { sub: 1 })],
  [8.6, () => { jobs.n2 = a.tool('Read', { file_path: F('CHANGELOG.md') }, { sub: 3 }); }],
  [9.2, () => { a.think(T('The total is rounded in cart.js, then again in summary.js.\nTwo roundings can lose a cent.', 'Le total est arrondi dans cart.js, puis encore dans summary.js.\nDeux arrondis peuvent perdre un centime.'), { sub: 1, id: 'msg_twice' }); jobs.r3 = a.tool('Read', { file_path: SUMMARY }, { sub: 1, id: 'msg_twice' }); }],
  [10.0, () => a.result(jobs.n2, '# Changelog\n\n## 2.3.0\n- Wish lists\n- Faster search\n', { sub: 3 })],
  [10.4, () => a.result(jobs.r3, ROUND, { sub: 1 })],
  [11.4, () => { jobs.r4 = a.tool('Bash', { command: 'git diff main -- src/checkout | grep -c "^+"' }, { sub: 1 }); }],
  [12.4, () => { jobs.n3 = a.tool('Bash', { command: 'gh pr list --state merged --search "milestone:2.4.0"' }, { sub: 3 }); }],
  [14.0, () => a.result(jobs.p1, FAIL, { sub: 2, err: true })],
  [12.9, () => a.result(jobs.r4, '212', { sub: 1 })],
  [6.0, () => { b = session('billing', B.title); b.user(T('Migrate billing to the new payments SDK.', 'Migre la facturation vers le nouveau SDK de paiement.')); jobs.b1 = b.tool('Bash', { command: 'grep -rn "legacyPay" src/billing | wc -l' }); }],
  [7.2, () => { b.result(jobs.b1, '      37'); jobs.b2 = b.tool('Read', { file_path: F('src/billing/charge.js') }); }],
  [done - 3.4, () => { c = session('docs', C.title); c.user(T('Write the onboarding docs for new developers.', 'Écris la doc d’onboarding pour les nouveaux développeurs.')); jobs.c1 = c.tool('Read', { file_path: F('README.md') }); }],
  [done - 2.3, () => { c.result(jobs.c1, '# Shop\n'); jobs.c2 = c.tool('Write', { file_path: F('docs/onboarding.md'), content: '# Onboarding\n' }); }],
  [9.0, () => { b.result(jobs.b2, 'import { legacyPay } from "./legacy";\n'); jobs.b3 = b.tool('Grep', { pattern: 'refund', path: F('src/billing') }); }],
  [done - 1.3, () => { c.result(jobs.c2, 'File created'); jobs.c3 = c.tool('Bash', { command: 'npm run docs:build' }); }],
  [done, () => { c.result(jobs.c3, 'Built 14 pages'); c.say(T('The onboarding guide is written: five steps, from install to first deploy.', 'Le guide d’onboarding est écrit : cinq étapes, de l’installation au premier déploiement.'), { end: true }); }],
  [10.6, () => { b.result(jobs.b3, 'src/billing/refund.js:12\nsrc/billing/webhooks.js:40'); jobs.b6 = b.tool('Read', { file_path: F('src/billing/webhooks.js') }); }],
  [12.2, () => { b.result(jobs.b6, 'export function onRefund(event) {\n  return legacyPay.refund(event.id);\n}\n'); jobs.b7 = b.tool('Bash', { command: 'npm ls @acme/payments' }); }],
  [13.4, () => b.result(jobs.b7, 'shop@2.3.0\n└── @acme/payments@5.1.0')],
  [ask, () => { jobs.ask = b.tool('AskUserQuestion', { questions: [{ question: T('Keep the old refund webhook during the migration, or cut over at once?', 'Garder l’ancien webhook de remboursement une semaine, ou basculer ?'),   // 70 characters at most: the shared terminal shows the end of a longer one
      header: T('Refunds', 'Remboursements'), options: [{ label: T('Keep both for a week', 'Garder les deux une semaine'), description: '' }, { label: T('Cut over at once', 'Basculer d’un coup'), description: '' }], multiSelect: false }] }); }],
  [13.6, () => { const r = T('Found one: the total is rounded twice, in cart.js and again in summary.js.', 'J’en ai un : le total est arrondi deux fois, dans cart.js puis dans summary.js.'); a.say(r, { sub: 1, end: true }); a.result(jobs.review, r); }],
  [16.2, () => { const r = T('41 of 42 pass. One failure: the total is a cent off on the smallest phone.', '41 sur 42 passent. Un échec : le total est faux d’un centime sur le plus petit téléphone.'); a.say(r, { sub: 2, end: true }); a.result(jobs.phones, r); }],
];
// 2. the call is in the second session: the question gets its answer there, and that session goes on
const second = () => [
  [3.0, () => { b.result(jobs.ask, T('Keep both for a week', 'Garder les deux une semaine')); const o = { id: 'msg_both' }; b.say(T('Both for a week, then. I’ll migrate the charges first.', 'Les deux pendant une semaine, donc. Je migre d’abord les paiements.'), o); jobs.b4 = b.tool('Bash', { command: 'npm test -- billing/charge', description: T('Run the billing tests', 'Lancer les tests de facturation') }, o); }],
];
// 3. back in the first one: the notes come in, the lead writes down what the review found and fixes it, runs the tests again and hands over
const third = () => [
  [0.3, () => { a.result(jobs.n3, '#412  Checkout: one page instead of three\n#415  Checkout: coupon field on the summary\n#419  Checkout: Apple Pay and Google Pay buttons\n#421  Checkout: address autocomplete\n#424  Checkout: keep the cart after a failed payment\n#427  Checkout: larger tap targets on phones', { sub: 3 }); jobs.n4 = a.tool('Write', { file_path: NOTES, content: '# 2.4.0\n\n- Checkout on one page\n- Coupon field on the summary\n- Apple Pay and Google Pay\n- Address autocomplete\n- The cart is kept after a failed payment\n- Larger tap targets on phones\n\nFix: shipping estimate for islands\n' }, { sub: 3 }); }],
  [0.8, () => a.result(jobs.n4, 'File created', { sub: 3 })],
  [1.5, () => { const r = T('Release notes written: six changes and one fix.', 'Notes de version écrites : six nouveautés et un correctif.'); a.say(r, { sub: 3, end: true }); a.result(jobs.notes, r); }],
  [3.0, () => { const o = { id: 'msg_fix' }; a.say(T('Rounded twice: that is the failing test. I’ll fix it.', 'Arrondi deux fois : voilà le test en échec. Je corrige.'), o);
    jobs.note = a.tool('Write', { file_path: REVIEW, content: '# Checkout redesign: review\n\nOne finding: the total was rounded twice (cart.js, then summary.js).\n' }, o);
    jobs.fix = a.tool('Edit', { file_path: SUMMARY, old_string: '  return { lines: cart.items.length, total: Math.round(total * 100) / 100 };', new_string: '  return { lines: cart.items.length, total };   // cartTotal() has rounded it' }, o); }],
  [3.6, () => { a.result(jobs.note, 'File created'); a.result(jobs.fix, 'The file has been updated.'); }],
  [12.6, () => { jobs.again = a.tool('Bash', { command: PHONES, description: T('Run the phone tests again', 'Relancer les tests sur téléphone') }); }],
  [8.0, () => { b.result(jobs.b4, 'ok'); jobs.b5 = b.tool('Bash', { command: 'npm test -- billing/refund' }); }],
  [14.8, () => a.result(jobs.again, PASS)],
  [17.0, () => a.say(T('Ready to ship: the bug is fixed, all 42 phone tests pass. See `release-notes.md` and `checkout-review.md`.', 'Prêt à livrer : le bug est corrigé, les 42 tests sur téléphone passent. Voir `release-notes.md` et `checkout-review.md`.'), { end: true })],
];

const PREFS = JSON.stringify({ lang: LANG, voice: false, office: false, music: false, sfx: false, epi: false, vanish: true, view: 'call', langChosen: true, banter: true, roster: true, reactions: false, charPack: 'none', charYou: 'cast' });
const mp4 = (raw, to) => { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-vf', 'fps=30,scale=1280:720,setsar=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-an', to]); return parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', to]).toString()); };

(async () => {
  a = session('checkout', A.title); const ago = Date.now() - 10 * 60e3;   // the call opens on a session whose last turn is over: nothing is said until the order comes
  a.user(T('Create the checkout-redesign branch.', 'Crée la branche checkout-redesign.'), { at: ago }); a.say(T('The branch is ready.', 'La branche est prête.'), { at: ago + 5000, end: true });
  const server = require('../server.js').start(PORT); await new Promise((r) => server.once('listening', r));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  const page = await browser.newPage(), errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.evaluateOnNewDocument((p) => { try { localStorage.setItem('cc.prefs', p); } catch {} }, PREFS);
  await page.setRequestInterception(true);
  let polled = 0; page.on('request', (req) => { if (/\/api\/board/.test(req.url())) polled = Date.now(); if (/\/api\/warm/.test(req.url())) req.respond({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); else if (/\/api\/translate/.test(req.url())) { let texts = []; try { texts = JSON.parse(req.postData() || '{}').texts || []; } catch {} req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ texts, ok: true }) }); } else req.continue(); });   // the sessions are written in the language of the video: a text is its own translation, and no translation helper is started
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:${PORT}/?proj=${PROJ}&lang=${LANG}`, { waitUntil: 'load' }); await page.waitForFunction('typeof S !== "undefined" && S.cur', { timeout: 15000 });
  await page.click('#gB'); await sleep(2500);
  await page.evaluate(() => { const el = document.createElement('div'); el.id = 'vcur'; el.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24"><path d="M5 3l14 8-6 2-2 6z" fill="#fff" stroke="#10282f" stroke-width="1.6" stroke-linejoin="round"/></svg>';   // the pointer of a recording made without a screen: drawn, and moved to what is clicked
    el.style.cssText = 'position:fixed;left:900px;top:520px;margin:-4px 0 0 -6px;z-index:2147483647;pointer-events:none;transition:left .7s cubic-bezier(.3,.7,.3,1),top .7s cubic-bezier(.3,.7,.3,1);filter:drop-shadow(0 2px 3px rgba(0,0,0,.55))'; document.body.appendChild(el); });
  const point = async (sel, x = 0.5, y = 0.5) => { await page.evaluate((q, x, y) => { const r = q ? document.querySelector(q).getBoundingClientRect() : { left: 1040, top: 560, width: 0, height: 0 }, el = document.querySelector('#vcur'); el.style.left = r.left + r.width * x + 'px'; el.style.top = r.top + r.height * y + 'px'; }, sel, x, y); await sleep(900); };   // no selector: out of the way
  const click = async (sel) => { await point(sel); await page.click(sel); await sleep(500); point(''); };
  const seen = (fn, arg, ms = 40000) => page.waitForFunction(fn, { timeout: ms, polling: 100 }, arg), inSession = (id) => seen((k) => S.cur && S.cur.id === k, id);
  let shot = 0; const shots = SHOTS ? setInterval(() => { page.screenshot({ path: path.join(SHOTS, LANG + '-' + String(++shot).padStart(2, '0') + '.jpg'), type: 'jpeg', quality: 70 }).catch(() => {}); }, 1000) : null; if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.evaluate(() => { window.__log = []; const o = window.startTalk, p = window.showPresent, t0 = Date.now(); window.startTalk = function (id, line) { window.__log.push(((Date.now() - t0) / 1000).toFixed(1) + ' ' + id + ': ' + line); return o.apply(this, arguments); }; window.showPresent = function (id) { const was = S.present; const r = p.apply(this, arguments); if (S.present === id && was !== id) window.__log.push(((Date.now() - t0) / 1000).toFixed(1) + ' [screen] ' + id + ' ' + document.querySelector('#ptitle').textContent); return r; }; }); }

  for (const was = polled; polled === was;) await sleep(20); await sleep(2000);   // the recording starts 2 s after the page asked for the list of sessions: what follows that rhythm (see below) comes at the same second each time
  const raw = path.join(tmp, 'call.webm'), plain = path.join(tmp, 'call.mp4'), rec = await page.screencast({ path: raw }), t0 = Date.now(), marks = {}, mark = (k) => { marks[k] = (Date.now() - t0) / 1000; if (SHOTS) console.log(k, marks[k].toFixed(1)); };
  // A visitor comes when the list of sessions, which the page asks for every 3 s, shows a session that has been over for 6 s or has had a question open for 4 s. The third session ends and the second one asks
  // at times set on those requests, so that the two visitors come 3 s apart in every recording: first the one who says a session is done, then the one with the question.
  // When the call gets to a session it plays what is less than 10 s old there, and newer than the last thing it played where it was. The question is asked that late, after everything the first session writes
  // before the click: its lead then raises its hand and shares the question at once. An older question is on its tile as “Asking a question” only (see liveStart in public/index.html).
  const P = (polled + 3000 * Math.ceil((t0 + 17600 - polled) / 3000) - t0) / 1000;
  mark('call'); const one = play(first(P - 7.5, P - 2.2));
  await seen(() => document.querySelectorAll('#tabs .stab:not(.all)').length > 1); mark('tabs');
  await sleep(8200); mark('tokens'); await seen(() => !!document.querySelector('#visit.on')); mark('knock');   // the third session is done: a first visitor, then the one with the question
  await one; await seen(() => { const v = document.querySelector('#visit.on'); return v && v.classList.contains('blocked'); }); await sleep(2600);
  await click('#visit .vgo'); await inSession('billing'); mark('there'); await play(second()); await sleep(2000);
  await click('#tabs .stab:not(.on):not(.all)'); await inSession('checkout'); mark('back'); await play(third());
  await seen(() => !!document.querySelector('#files.on')); mark('files'); await sleep(1200); await point('#files .sfc[data-f]', 0.5, 0.8); await sleep(4200);
  if (SHOTS) console.log((await page.evaluate(() => window.__log)).join('\n'));
  const total = (Date.now() - t0) / 1000; await rec.stop(); clearInterval(shots); await browser.close(); server.close(); require('../server.js').shutdown();
  if (errors.length) throw new Error('the page reported errors: ' + errors.join(' | '));

  // the banner, then everything in a row with captions and music
  const dur = mp4(raw, plain), k = dur / total; for (const m in marks) marks[m] *= k;   // the screencast stretches time a little: the marks are scaled to the real length of the video
  const END = 3, t = { ...marks, end: dur }, all = dur + END;
  const cap = [
    ['call', 'tabs', T('One order, and the lead hands it to three agents', 'Une consigne, et Margot la confie à trois agents')],
    ['tabs', 'tokens', T('Other sessions start: one tab each, with its state', 'D’autres sessions démarrent : un onglet chacune, avec son état')],
    ['tokens', 'knock', T('What each agent uses, counted live', 'Ce que chaque agent consomme, compté en direct')],
    ['knock', 'there', T('Another session needs you? Someone leans in', 'Une autre session a besoin de vous ? Toc toc'), 553],   // left of the visitor
    ['there', 'back', T('One click takes the call there', 'Un clic, et l’appel y va')],
    ['back', 'files', T('Back by its tab: the fix, the tests, the wrap-up', 'Retour par son onglet : le correctif, les tests, le bilan')],
    ['files', 'end', T('The files made for you, when the turn ends', 'Les fichiers faits pour vous, à la fin du tour')],
    ['end', null, T('Agent Standup 1.31 · free and open source · agent-standup.com', 'Agent Standup 1.31 · gratuit et open source · agent-standup.com')],
  ];
  const font = '/System/Library/Fonts/Helvetica.ttc', esc = (s) => s.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, '’').replace(/%/g, '\\%');
  const text = cap.map(([from, to, s, mid]) => `drawtext=fontfile=${font}:text='${esc(s)}':fontsize=${mid ? 26 : s.length > 50 ? 28 : 36}:fontcolor=white:box=1:boxcolor=0x000000B8:boxborderw=16:x=${mid || 'w/2'}-text_w/2:y=h-86:enable='between(t,${(t[from] + 0.3).toFixed(1)},${(to ? t[to] - 0.2 : all).toFixed(1)})'`).join(',');
  const script = path.join(tmp, 'filter.txt');
  fs.writeFileSync(script, `[1:v]scale=1280:-2,pad=1280:720:0:oh-ih:color=0x121a22,fps=30,setsar=1,format=yuv420p,fade=t=in:st=0:d=0.4[end];[0:v][end]concat=n=2:v=1:a=0,${text}[out]`);
  const wav = require('./promo-music-upbeat.js')(path.join(tmp, 'music.wav'), all + 0.4, [t.tabs, t.tokens, t.knock, t.there, t.back, t.files, t.end].map((x) => x + 0.1));
  fs.mkdirSync(out, { recursive: true }); const dest = path.join(out, 'promo-sessions' + SUF + '.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', plain, '-loop', '1', '-t', String(END), '-i', path.join(out, 'social.jpg'), '-i', wav, '-filter_complex_script', script, '-map', '[out]', '-map', '2:a',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-af', `loudnorm=I=-15:TP=-1.5:LRA=9,afade=t=out:st=${(all - 2.2).toFixed(1)}:d=2.2`, '-t', all.toFixed(2), '-movflags', '+faststart', dest]);
  console.log('video promo-sessions' + SUF + '.mp4', all.toFixed(1) + 's', JSON.stringify(Object.fromEntries(Object.entries(t).map(([m, v]) => [m, +v.toFixed(1)]))));
  fs.rmSync(tmp, { recursive: true, force: true }); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
