// test/live.test.js: the live call in a real browser. A transcript is written record by record, the way Claude Code writes it, and we check what the call says and shows.
// One case per regression that reached a release: the end of the previous call read again, answers that stopped, lines lost or said twice, a turn that "ended" in the middle.
// Needs puppeteer-core (npm i) and a Chrome (CHROME_PATH, or the usual places); skipped with a note when they are missing, except in CI where that is a failure.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'as-live-'));
process.env.AGENT_STANDUP_PREFS = path.join(tmp, 'prefs.json'); process.env.AGENT_STANDUP_KOKORO_DIR = path.join(tmp, 'kokoro'); process.env.AGENT_STANDUP_PROJECTS = path.join(tmp, 'projects');
fs.writeFileSync(process.env.AGENT_STANDUP_PREFS, JSON.stringify({ lang: 'en', voice: false, chat: 'normal', banter: true, _t: Date.now() }));   // no voice: a line lasts as long as its text, on every machine
// A stand-in for Claude Code, so that no test starts the real one: asked for Spanish it answers a Spanish sentence with the text in brackets, for any other language the name of that language.
process.env.AGENT_STANDUP_CLAUDE = path.join(tmp, 'claude'); delete process.env.ANTHROPIC_API_KEY;
fs.writeFileSync(process.env.AGENT_STANDUP_CLAUDE, `#!/usr/bin/env node
const a = process.argv.slice(2), sys = a[a.indexOf('--system-prompt') + 1] || '', lang = (s) => (/natural spoken ([A-Za-z ]+?),/.exec(s) || [])[1], tr = (l, t) => (l === 'Spanish' ? 'Ya está, todo listo y sin errores' : l) + ' [' + t + ']';
if (a.includes('--input-format')) require('readline').createInterface({ input: process.stdin }).on('line', (l) => { const m = JSON.parse(l); console.log(JSON.stringify({ type: 'result', result: tr(lang(sys), m.message.content) })); });
else { let s = ''; process.stdin.on('data', (d) => (s += d)).on('end', () => { const arr = JSON.parse(s.slice(s.indexOf('\\n') + 1)); console.log(JSON.stringify(arr.map((t) => tr(lang(s), t)))); }); }
`, { mode: 0o755 });
let puppeteer = null; for (const m of ['puppeteer-core', path.join(process.env.PUPPETEER_DIR || '/tmp/as/pp', 'node_modules/puppeteer-core')]) { try { puppeteer = require(m); break; } catch {} }
const CHROME = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser', '/usr/bin/chromium', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find((p) => p && fs.existsSync(p));
const missing = !puppeteer ? 'puppeteer-core is not installed (npm i)' : !CHROME ? 'no Chrome found (set CHROME_PATH)' : '';
if (missing && process.env.CI) throw new Error('live tests cannot run: ' + missing);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let srv, port, browser, nSession = 0, nId = 0;
// ---- a session being written ----
function session() {
  const proj = '-live' + ++nSession, dir = path.join(tmp, 'projects', proj), main = path.join(dir, 's.jsonl'), subDir = path.join(dir, 's', 'subagents'); fs.mkdirSync(subDir, { recursive: true });
  const put = (f, r, at) => fs.appendFileSync(f, JSON.stringify({ timestamp: new Date(at || Date.now()).toISOString(), ...r }) + '\n'), sub = (k) => path.join(subDir, `agent-a${k}.jsonl`);
  const s = {
    proj,
    user: (text, at) => put(main, { type: 'user', message: { role: 'user', content: text } }, at),
    say: (text, o = {}) => put(o.sub ? sub(o.sub) : main, { type: 'assistant', message: { id: o.id || 'm' + ++nId, role: 'assistant', stop_reason: o.end ? 'end_turn' : null, content: [{ type: 'text', text }] } }, o.at),
    tool: (name, input, o = {}) => { const id = 'toolu_' + ++nId; put(o.sub ? sub(o.sub) : main, { type: 'assistant', message: { id: o.id || 'm' + ++nId, role: 'assistant', stop_reason: null, content: [{ type: 'tool_use', id, name, input }] } }, o.at); return id; },
    result: (id, text, o = {}) => put(o.sub ? sub(o.sub) : main, { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: text, ...(o.err ? { is_error: true } : {}) }] } }, o.at),
    think: (text, o = {}) => put(o.sub ? sub(o.sub) : main, { type: 'assistant', message: { id: o.id || 'm' + ++nId, role: 'assistant', stop_reason: null, content: [{ type: 'thinking', thinking: text, signature: 'x' }] } }, o.at),   // the reasoning before a line or a call, when Claude Code keeps its text
    queued: (text, at) => put(main, { type: 'attachment', attachment: { type: 'queued_command', prompt: [{ type: 'text', text }], origin: { kind: 'human' }, commandMode: 'prompt' } }, at),   // an order typed while the lead works: written when delivered, stamped when typed
    launch: (k, title, prompt, bg) => { const id = s.tool('Agent', { description: title, prompt, subagent_type: 'general-purpose', ...(bg ? { run_in_background: true } : {}) }); fs.writeFileSync(path.join(subDir, `agent-a${k}.meta.json`), JSON.stringify({ agentType: 'general-purpose', description: title, toolUseId: id })); put(sub(k), { type: 'user', message: { role: 'user', content: prompt } }); return id; },
    notify: (id) => put(main, { type: 'queue-operation', operation: 'enqueue', content: `<task-notification>\n<tool-use-id>${id}</tool-use-id>\n<status>completed</status>\n</task-notification>` }),   // a background agent has stopped: Claude Code then wakes the lead
  };
  return s;
}
// ---- the call, watched ----
async function open(s, join = true, more = '') {   // more: what else the address holds (&embed=1 for the page as VS Code shows it)
  const page = await browser.newPage(), errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${port}/?proj=${s.proj}${more}`); await page.waitForFunction('typeof S !== "undefined" && S.cur', { timeout: 15000 });
  await page.evaluate(() => { window.__said = []; const o = window.startTalk; window.startTalk = function (id, line, label) { window.__said.push({ id, line: String(line), label: label || '' }); return o.apply(this, arguments); }; });
  await page.evaluate(() => { window.__voice = []; const o = window.speakLine; window.speakLine = function (text, p, primary, token, fr, always) { window.__voice.push({ id: p && p.id, text: String(text), silent: !!(S.hurry && !always) }); return o.apply(this, arguments); }; });   // silent: shown without a voice because the call is behind
  if (join) await page.click('#gB');
  const call = {
    page, errors,
    said: () => page.evaluate(() => window.__said),
    lines: async (id) => (await call.said()).filter((x) => !id || x.id === id).map((x) => x.line),
    until: (fn, arg, ms = 20000) => page.waitForFunction(fn, { timeout: ms, polling: 100 }, arg),
    heard: (text, ms) => call.until((t) => window.__said.some((x) => x.line.includes(t)), text, ms),   // a line containing this text has started
    quiet: async (ms = 2500) => { await call.until(() => S.idle && !S.speakers.size, null, 30000); await wait(ms); },   // everything received has been played, and nothing more came
    lead: () => page.evaluate(() => agentState('main', Date.now()).k),
    close: async () => { await page.close(); assert.deepEqual(errors, [], 'page errors'); },
  };
  return call;
}
const count = (lines, text) => lines.filter((l) => l.includes(text)).length;
const closing = async (c) => (await c.said()).filter((x) => x.id === 'main' && x.label === '🎉').map((x) => x.line), closed = (c, n, ms = 20000) => c.until((k) => window.__said.filter((x) => x.label === '🎉').length === k && !S.speakers.size, n, ms);   // the lead's word when its face turns happy
const YOURS = /(Your turn|Over to you|Back to you)\.$/;

test('live call', { skip: missing || false, timeout: 600000 }, async (t) => {
  srv = require('../server.js').start(0); await new Promise((r) => srv.once('listening', r)); port = srv.address().port;
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--no-sandbox'] });
  t.after(async () => { await browser.close(); srv.close(); require('../server.js').shutdown(); });

  await t.test('joining a call that is over says nothing; what comes next is said once, also after a reload', async () => {
    const s = session(), old = Date.now() - 600000; s.user('OLD order', old); s.say('OLD answer, all done.', { at: old + 5000, end: true });
    const c = await open(s); await c.quiet(); assert.deepEqual(await c.lines(), []);
    s.user('NEW order'); await wait(1500); s.say('NEW answer.', { end: true }); await c.heard('NEW answer'); await c.quiet();
    await c.page.evaluate(() => { S.cur = null; }); await wait(3000); await c.quiet();   // what a rewritten transcript or a server restart triggers
    const l = await c.lines(); assert.equal(count(l, 'OLD'), 0); assert.equal(count(l, 'NEW order'), 1); assert.equal(count(l, 'NEW answer'), 1); await c.close();
  });

  await t.test('joining while the agents are at work: the last seconds are said, not what came before', async () => {
    const s = session(), now = Date.now(); s.user('EARLIER order', now - 40000); s.say('EARLIER line.', { at: now - 30000 }); s.tool('Bash', { command: 'ls' }, { at: now - 20000 }); s.say('RECENT line.', { at: now - 5000 }); s.tool('Bash', { command: 'npm test' }, { at: now - 2000 });
    const c = await open(s); await c.heard('RECENT line'); await c.quiet(1000); const l = await c.lines(); assert.equal(count(l, 'EARLIER'), 0); assert.equal(count(l, 'RECENT line'), 1); await c.close();
  });

  await t.test('the lead answers an order when it goes to its tools without a word, also after a long order; not when it spoke', async () => {
    const s = session(); s.user('hello', Date.now() - 600000); s.say('Ready.', { at: Date.now() - 590000, end: true }); const c = await open(s);
    s.user('Fix the slow login'); await wait(2500); s.tool('Read', { file_path: '/x/src/server.js' }); await c.heard('server.js');
    await c.quiet(500); s.say('The login waits on a slow query.', { end: true }); await c.heard('slow query'); await c.quiet(500);
    s.user('Please go through the whole authentication module, list every place where a session token is read or written, check each one against the new expiry rule, and tell me which ones still need to change before the release.'); await wait(2000);
    let id = s.tool('Bash', { command: 'npm test', description: 'Run the test suite' });
    for (let k = 0; k < 8; k++) { await wait(1000); s.result(id, 'ok'); id = s.tool('Read', { file_path: `/x/auth/part${k}.js` }); }   // the lead goes on while the order is still being read: its first tool is no longer "just now"
    await c.heard('Run the test suite', 30000);
    await c.quiet(500); s.say('Two places still need to change.', { end: true }); await c.heard('Two places'); await c.quiet(500);
    s.user('And what do you think?'); await wait(2000); s.say('I think the query needs an index.'); await wait(300); s.tool('Grep', { pattern: 'CREATE INDEX' }); await c.heard('needs an index'); await c.quiet();
    const lead = await c.lines('main'); assert.equal(lead.filter((l) => /^(Got it|Okay|On it|Sure|Right)\./.test(l)).length, 2, lead.join(' | ')); await c.close();
  });

  await t.test('a sub-agent answers its order; a last line that becomes a report afterwards counts as one, without being read again', async () => {
    const s = session(); s.user('hello', Date.now() - 600000); s.say('Ready.', { at: Date.now() - 590000, end: true }); const c = await open(s);
    s.user('Check the tests'); await wait(1500); s.say('I will hand this over.'); await wait(1500);
    const id = s.launch(1, 'Run the tests', 'Run the whole test suite and report every failure with its file and line.');
    for (let k = 0; k < 8; k++) { await wait(1000); s.result(s.tool('Bash', { command: 'npm test' }, { sub: 1 }), 'ok', { sub: 1 }); }
    await c.until(() => window.__said.some((x) => x.id === 'a1' && x.label === '💬'), null, 30000);   // the answer to the order
    s.say('REPORT: 40 tests pass and two fail in the auth module.', { sub: 1 }); await c.heard('REPORT: 40 tests');   // the page has it as an ordinary line
    await wait(3000); s.result(id, 'REPORT: 40 tests pass and two fail in the auth module.');   // Claude Code writes the completion a few seconds later
    await c.until(() => S.status.a1 === 'done' && S.events.some((e) => e.agent === 'a1' && e.kind === 'report'), null, 15000); await c.quiet();
    assert.equal(count(await c.lines(), 'REPORT: 40 tests'), 1); assert.ok(await c.page.evaluate(() => !!document.querySelector('#log .row.report'))); await c.close();
  });

  await t.test('an order typed while the lead works reaches the call, once, and no line is said twice', async () => {
    const s = session(); s.user('hello', Date.now() - 600000); s.say('Ready.', { at: Date.now() - 590000, end: true }); const c = await open(s);
    s.user('Start the build'); await wait(1500); s.say('FIRST lead line.'); await c.heard('FIRST lead line'); const typed = Date.now(); await wait(4000);
    s.say('SECOND lead line.'); await c.heard('SECOND lead line'); await c.quiet(500);
    s.queued('ORDER TYPED MEANWHILE', typed); await c.heard('ORDER TYPED MEANWHILE'); await wait(1000); s.say('THIRD lead line.', { end: true }); await c.heard('THIRD lead line'); await c.quiet();
    const l = await c.lines(); for (const x of ['FIRST lead line', 'SECOND lead line', 'ORDER TYPED MEANWHILE', 'THIRD lead line']) assert.equal(count(l, x), 1, x + ' in ' + l.join(' | ')); await c.close();
  });

  await t.test('tool calls of one message written one after the other all reach the call', async () => {
    const s = session(); s.user('hello', Date.now() - 600000); s.say('Ready.', { at: Date.now() - 590000, end: true }); const c = await open(s);
    s.user('Look around'); await wait(1500); s.say('Looking.'); await c.heard('Looking'); await c.quiet(300);
    s.tool('Read', { file_path: '/x/one.js' }, { id: 'mPar' }); await wait(1200); s.tool('Read', { file_path: '/x/two.js' }, { id: 'mPar' }); await wait(1200); s.tool('Read', { file_path: '/x/three.js' }, { id: 'mPar' });
    await c.until(() => (S.tc.main || 0) === 3, null, 15000); assert.equal(await c.page.evaluate(() => S.events.filter((e) => e.kind === 'tools').reduce((n, e) => n + e.tools.length, 0)), 3); await c.close();
  });

  await t.test('the lead is at work until the message that closes its turn: while it thinks, after a long command, and no wrap-up in the middle', async () => {
    const s = session(); s.user('hello', Date.now() - 600000); s.say('Ready.', { at: Date.now() - 590000, end: true }); const c = await open(s); await c.quiet(500); assert.equal(await c.lead(), 'done');
    s.user('Run the long job'); await c.heard('Run the long job'); await c.quiet(1500); assert.equal(await c.lead(), 'working');   // thinking: nothing written yet
    s.say('Starting the long job now, this is going to take a while because the whole suite runs twice.'); await wait(500); const id = s.tool('Bash', { command: 'sleep 30' }); await wait(28000);   // longer than the old 25 s rule
    assert.equal(await c.lead(), 'working'); s.result(id, 'ok'); await wait(4000); assert.equal(await c.lead(), 'working'); assert.equal(count(await c.lines(), 'To sum up'), 0);
    s.say('The long job is finished.', { end: true }); await c.heard('long job is finished'); await c.until(() => agentState('main', Date.now()).k === 'done', null, 8000); await c.close();
  });

  await t.test('the lead has a word each time its turn ends: what it changed, that it waits for your answer, or the floor back to you; never in the middle, and off with the little lines', async () => {
    const s = session(); s.user('hello', Date.now() - 600000); s.say('Ready.', { at: Date.now() - 590000, end: true }); const c = await open(s);
    s.user('Fix the login'); await wait(1500); s.result(s.tool('Edit', { file_path: '/x/src/login.js', old_string: 'a', new_string: 'b' }), 'ok'); await wait(1500); assert.deepEqual(await closing(c), []);
    s.say('The login is fixed.', { end: true }); await c.heard('login is fixed'); await closed(c, 1); assert.match((await closing(c))[0], /login\.js/); assert.match((await closing(c))[0], YOURS);
    s.user('Thanks'); await wait(1500); s.say('Should I also add a test for it?', { end: true }); await c.heard('also add a test'); await closed(c, 2); assert.match((await closing(c))[1], /^(I’ll wait for your answer|Your call|Tell me what you prefer)\.$/);
    s.user('No need'); await wait(1500); s.say('Fine, I leave it there.', { end: true }); await c.heard('leave it there'); await closed(c, 3); assert.match((await closing(c))[2], /^(That’s my answer|That’s all from me|Nothing more from me)\. /); assert.doesNotMatch((await closing(c))[2], /login\.js/, 'what an earlier turn changed is not said again');
    await c.page.evaluate(() => { prefs.banter = false; }); s.user('Bye'); await wait(1500); s.say('Goodbye.', { end: true }); await c.heard('Goodbye'); await c.quiet(3000); assert.equal((await closing(c)).length, 3); await c.close();
  });

  await t.test('a win in the middle of a turn is voiced too, and is not "your turn": the agents the lead waited for are back; and a first turn is not over because the lead thinks', async () => {
    const s = session(); s.user('hello', Date.now() - 600000); s.say('Ready.', { at: Date.now() - 590000, end: true }); const c = await open(s);
    s.user('Audit the tests'); await wait(1500); const id = s.launch(1, 'Audit the tests', 'Read every test and list the weak ones.', true); s.result(id, 'Async agent launched successfully.'); await wait(500);
    s.say('The audit runs in the background, I will come back with what it finds.', { end: true }); await c.heard('audit runs in the background');   // Claude Code closes the turn here, and opens it again when the agent stops
    s.result(s.tool('Bash', { command: 'npm test' }, { sub: 1 }), 'ok', { sub: 1 }); await c.quiet(1500); assert.equal(await c.lead(), 'waiting'); assert.deepEqual(await closing(c), []);
    s.say('AUDIT: two tests are weak.', { sub: 1 }); await wait(1000); s.notify(id); await closed(c, 1, 30000);
    assert.match((await closing(c))[0], /^(The team is back|All the reports are in|Everyone has reported)\./); assert.doesNotMatch((await closing(c))[0], YOURS);
    s.result(s.tool('Edit', { file_path: '/x/test/auth.test.js', old_string: 'a', new_string: 'b' }), 'ok'); await wait(800); s.say('Both weak tests are fixed.', { end: true }); await c.heard('weak tests are fixed'); await closed(c, 2);
    assert.match((await closing(c))[1], /auth\.test\.js/); assert.match((await closing(c))[1], YOURS); await c.close();
    const q = session(); q.user('Look at the login'); const d = await open(q); await d.heard('Look at the login'); await wait(27000); assert.equal(await d.lead(), 'working', 'before its first line');   // a session that has not closed a turn yet: the lead is at work while it thinks, it is not your turn after 25 s
    q.result(q.tool('Read', { file_path: '/x/src/login.js' }), 'ok'); await wait(800); q.say('I have read it, thinking about the fix.'); await d.heard('thinking about the fix'); await wait(27000);
    assert.equal(await d.lead(), 'working', 'in the middle of its first turn'); assert.deepEqual(await closing(d), []);
    q.say('The fix is in place.', { end: true }); await d.heard('fix is in place'); await closed(d, 1); assert.match((await closing(d))[0], YOURS); await d.close();
  });

  await t.test('your own line is always voiced: typed long before it was delivered, or in the middle of a backlog', async () => {
    const s = session(); s.user('hello', Date.now() - 600000); s.say('Ready.', { at: Date.now() - 590000, end: true }); const c = await open(s);
    s.user('Start', Date.now() - 170000); await wait(1200); s.say('Working on it.', { at: Date.now() - 165000 }); await c.heard('Working on it'); await c.quiet(500);   // dated as if the command below had really run for two minutes
    const id = s.tool('Bash', { command: 'sleep 140' }, { at: Date.now() - 150000 }); await wait(1500); s.result(id, 'ok'); s.queued('ORDER TYPED TWO MINUTES AGO', Date.now() - 130000); await wait(300); s.say('Noted.', { end: true });   // a long command, an order typed 20 s into it: Claude Code hands the order over when the command returns, stamped with the time it was typed
    await c.heard('ORDER TYPED TWO MINUTES AGO'); await c.heard('Noted'); await c.quiet(500);
    for (let k = 0; k < 30; k++) { if (k === 12) s.user('ORDER IN THE BACKLOG'); s.say(`Backlog line ${k} of the lead, long enough to take a moment to read out loud.`); }   // written at once: the call is far behind and skips ahead
    s.say('End of the backlog.', { end: true }); await c.heard('End of the backlog', 120000); await c.quiet(500);
    const mine = await c.page.evaluate(() => window.__voice.filter((x) => x.id === 'user'));
    for (const x of ['ORDER TYPED TWO MINUTES AGO', 'ORDER IN THE BACKLOG']) { const hit = mine.filter((y) => y.text.includes(x)); assert.equal(hit.length, 1, x + ' said ' + hit.length + ' times'); assert.equal(hit[0].silent, false, x + ' was shown without a voice'); }
    await c.close();
  });

  await t.test('an agent at work for a while thinks to itself: its own reasoning when the session has it, else what it is doing; shown, not said, gone when it speaks', async () => {
    const s = session(); s.user('hello', Date.now() - 600000); s.say('Ready.', { at: Date.now() - 590000, end: true }); const c = await open(s);
    s.user('Why is the login slow?'); await c.heard('Why is the login slow'); await wait(1500);
    s.think('The query in db/schema.sql scans the whole table, so the login is slow. I should look at the index before anything else.', { id: 'mTh' }); const id = s.tool('Bash', { command: 'psql -f explain.sql', description: 'Explain the login query' }, { id: 'mTh' });   // (a dot inside a file name does not end the sentence)
    await c.until(() => { const b = document.querySelector('#t-main.musing .bubble'); return b && b.textContent.includes('db/schema.sql scans the whole table, so the login is slow.'); }, null, 45000);   // its own words come first, in whole sentences
    assert.equal(await c.page.evaluate(() => S.speakers.size), 0); assert.equal(count(await c.lines(), 'scans the whole table'), 0, 'a thought is not a spoken line');
    s.result(id, 'Seq Scan on users'); s.say('It was the missing index.', { end: true }); await c.heard('It was the missing index'); assert.equal(await c.page.evaluate(() => !!document.querySelector('#t-main.musing')), false);
    await c.quiet(500); s.user('Then fix it'); await wait(1500); s.say('I will hand the migration over.'); await wait(1000); s.launch(1, 'Check the migration', 'Write the migration that adds the index and check it on a copy of the database.');
    const run = s.tool('Bash', { command: 'npm run migrate:check', description: 'Check the migration' }, { sub: 1 });   // no reasoning kept for this one: the thought is about what it is on
    await c.until(() => { const b = document.querySelector('#t-a1.musing .bubble'); return b && b.textContent.includes('Check the migration'); }, null, 60000);
    assert.equal((await c.said()).filter((x) => x.id === 'a1' && x.line.includes('Check the migration')).length, 0); s.result(run, 'ok', { sub: 1 }); await c.close();
  });

  await t.test('pausing and resuming at the end of a live call does not repeat the last line', async () => {
    const s = session(); s.user('hello', Date.now() - 600000); s.say('Ready.', { at: Date.now() - 590000, end: true }); const c = await open(s);
    s.user('One thing'); await wait(1200); s.say('LAST line of the call.', { end: true }); await c.heard('LAST line'); await c.quiet(500);
    await c.page.evaluate(() => togglePlay()); await wait(800); await c.page.evaluate(() => togglePlay()); await c.quiet(); assert.equal(count(await c.lines(), 'LAST line'), 1); await c.close();
  });
  await t.test('in a replay too, sub-agents that spoke back to back take turns: never two voices at once', async () => {
    const s = session(), t0 = Date.now() - 3000; s.user('Split the work in three', t0); s.say('Three of you, one part each.', { at: t0 + 1000 });
    for (const k of [1, 2, 3]) { s.launch(k, 'Part ' + k, `Do part ${k} and say where you are.`); await wait(20); }
    for (const k of [1, 2, 3]) { s.say(`PART ${k} is under way, nothing in my way so far.`, { sub: k }); await wait(20); }
    const c = await open(s, false);
    await c.page.evaluate(async (proj) => {
      await setMode('replay'); await loadSession(proj, 's'); S.locked = false; $('#gate').classList.remove('on'); $('#speed').value = $('#speed').max;
      window.__at = 0; window.__most = 0; const o = window.speakLine; window.speakLine = function () { window.__most = Math.max(window.__most, ++window.__at); return o.apply(this, arguments).finally(() => window.__at--); };   // how many voices are in flight
      seekTo(0);
    }, s.proj);
    await c.until(() => !S.playing && window.__said.filter((x) => x.line.includes('PART')).length === 3, null, 60000);
    assert.equal(await c.page.evaluate(() => window.__most), 1, 'voices at once'); assert.deepEqual((await c.lines()).filter((l) => l.includes('PART')).map((l) => l.slice(0, 6)), ['PART 1', 'PART 2', 'PART 3'], 'each in turn, in the order they spoke'); await c.close();
  });
  await t.test('a replay paused while one of them speaks loses no line: it resumes with the one that was cut, then the others', async () => {
    const s = session(), t0 = Date.now() - 3000; s.user('Split the work in three', t0); s.say('Three of you, one part each.', { at: t0 + 1000 });
    for (const k of [1, 2, 3]) { s.launch(k, 'Part ' + k, `Do part ${k} and say where you are.`); await wait(20); }
    for (const k of [1, 2, 3]) { s.say(`PART ${k} is under way, nothing in my way so far.`, { sub: k }); await wait(20); }
    const c = await open(s, false);
    await c.page.evaluate(async (proj) => { await setMode('replay'); await loadSession(proj, 's'); S.locked = false; $('#gate').classList.remove('on'); seekTo(0); }, s.proj);
    await c.heard('PART 1', 60000); assert.equal(await c.page.evaluate(() => S.events[S.idx].text.slice(0, 6)), 'PART 1', 'the place is the line being said, not the last of the group');
    await c.page.evaluate(() => togglePlay()); await wait(500); await c.page.evaluate(() => togglePlay());   // paused in the first of the three, then resumed: it used to go on with the third
    await c.until(() => !S.playing && window.__said.some((x) => x.line.includes('PART 3')), null, 60000);
    assert.deepEqual([...new Set((await c.lines()).filter((l) => l.includes('PART')).map((l) => l.slice(0, 6)))], ['PART 1', 'PART 2', 'PART 3'], 'each is heard, in the order they spoke'); await c.close();
  });

  await t.test('the files made for you show under the call when the turn ends: those the lead names, else the documents; a click shows the file in its folder', async () => {
    const server = require('../server.js'), run = server._reveal.run, shown = []; server._reveal.run = (f) => shown.push(f); t.after(() => { server._reveal.run = run; });   // no Finder window during the tests
    const real = path.join(__dirname, '..', 'README.md'), s = session(); s.user('hello', Date.now() - 600000); s.say('Ready.', { at: Date.now() - 590000, end: true }); const c = await open(s);
    const mark = "(b) => b.querySelector('span').textContent + (b.classList.contains('new') ? '*' : '') + (b.classList.contains('gone') ? '!' : '')";
    const strip = () => c.page.evaluate(`({ on: document.querySelector('#files').classList.contains('on'), names: [...document.querySelectorAll('#files .sfc[data-f]')].map(${mark}), more: (document.querySelector('#files .more') || {}).textContent || '' })`);
    const shows = (names) => c.page.waitForFunction(`document.querySelector('#files.on') && [...document.querySelectorAll('#files .sfc[data-f]')].map(${mark}).join('|') === ${JSON.stringify(names.join('|'))}`, { timeout: 30000, polling: 100 });
    const write = (file) => s.result(s.tool('Write', { file_path: file, content: 'x' }), 'File created');
    await c.quiet(500); assert.deepEqual(await strip(), { on: false, names: [], more: '' });   // a turn that created nothing
    s.user('Write the report'); await c.heard('Write the report');
    write(real); write('/x/docs/notes.md'); write('/x/src/helper.js'); write(path.join(tmp, 'scratch.js'));   // a source file is not made for you; a scratch file in a temporary folder is not even a file of the session
    s.result(s.tool('Write', { file_path: '/x/docs/refused.md', content: 'x' }), 'Permission denied', { err: true }); s.result(s.tool('Edit', { file_path: '/x/src/app.js', old_string: 'a', new_string: 'b' }), 'ok');   // nor is a write that failed, nor a file that was only changed
    await wait(2500); assert.equal((await strip()).on, false, 'nothing shows while the lead works');
    s.say('The report is written.', { end: true }); await shows(['notes.md*', 'README.md*']); assert.equal((await strip()).more, '+1');   // no file named: the documents
    await c.page.click('#files .sfc[data-f$="README.md"]'); await wait(600); assert.deepEqual(shown, [real]);
    await c.page.click('#files .sfc[data-f="/x/docs/notes.md"]'); await shows(['notes.md*!', 'README.md*']); assert.deepEqual(shown, [real]);   // no longer there: said so, and nothing is opened
    await c.page.click('#files .more'); assert.deepEqual(await c.page.evaluate(() => [...document.querySelectorAll('#fpop .sfr b')].map((b) => b.textContent)), ['helper.js', 'notes.md', 'README.md']);   // the list has them all
    await c.page.keyboard.press('Escape'); assert.equal(await c.page.evaluate(() => !!document.querySelector('#fpop')), false);
    s.user('Now a test for the login'); await c.page.waitForFunction(() => !document.querySelector('#files.on'), { timeout: 30000 });   // the next turn: the line goes away until it ends
    write('/x/docs/second.md'); write('/x/test/login.test.js'); write('/x/test/old-login.test.js');
    s.say('I added `test/login.test.js`, run it to check.', { end: true }); await shows(['login.test.js*', 'notes.md!', 'README.md']); assert.equal((await strip()).more, '+3');   // the one the lead names, and only that one of this turn
    await c.page.evaluate(() => document.querySelector('#menu .mi[data-t=files]').click()); assert.equal((await strip()).on, false);   // ⚙ › Display: off
    await c.page.evaluate(() => document.querySelector('#menu .mi[data-t=files]').click()); await shows(['login.test.js*', 'notes.md!', 'README.md']);
    const stat = server._reveal.stat, there = { '/x/out/report.pdf': Date.now() + 60000, '/x/out/data.csv': Date.now() + 60000, '/x/old/brief.md': Date.now() - 3600000 }; server._reveal.stat = (f) => (f in there ? { isFile: () => true, mtimeMs: there[f] } : stat(f)); t.after(() => { server._reveal.stat = stat; });   // no file is written outside the test's folder: the server is told what is there, and since when
    s.user('Export it as a PDF'); await c.page.waitForFunction(() => !document.querySelector('#files.on'), { timeout: 30000 });
    s.result(s.tool('Bash', { command: 'cd /x && python3 make.py --out=out/report.pdf && cat old/brief.md && rm out/draft.pdf' }), 'Wrote 3 pages.\nAlso saved /x/out/data.csv');
    s.say('The export is in `report.pdf`. I used brief.md, and draft.pdf is gone.', { end: true }); await shows(['report.pdf*', 'login.test.js', 'notes.md!', 'README.md']);   // a document a command made, which the lead names: not the one the command only read, nor the one it removed, nor the one nobody names
    await c.page.click('#files .sfc[data-f="/x/out/report.pdf"]'); await wait(600); assert.deepEqual(shown, [real, '/x/out/report.pdf']);
    await c.close();
  });

  await t.test('in VS Code the call goes to the Claude Code tab you go to, and stays there until you type somewhere; what the agents write elsewhere does not take it back', async () => {
    const s = session(), old = path.join(tmp, 'projects', s.proj, 'old.jsonl'), ago = Date.now() - 45 * 60000; s.user('hello'); s.say('Ready.', { end: true });
    fs.writeFileSync(old, [{ type: 'user', message: { role: 'user', content: 'an older conversation' } }, { type: 'assistant', message: { id: 'o1', role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Done.' }] } }].map((r) => JSON.stringify({ timestamp: new Date(ago).toISOString(), ...r })).join('\n') + '\n'); fs.utimesSync(old, ago / 1000, ago / 1000);   // a second session of the same folder, quiet for long enough to have no tab of its own
    const c = await open(s, true, '&embed=1'), tab = (id) => c.page.evaluate((proj, id) => window.postMessage({ agentStandup: 'pin', id, proj, tab: true }, '*'), s.proj, id);   // what extension.js sends when you change tab
    const at = () => c.page.evaluate(() => ({ id: S.cur && S.cur.id, row: !!document.querySelector('#tabs .stab') })), goes = (id) => c.until((k) => S.cur && S.cur.id === k, id);
    await c.quiet(500); assert.deepEqual(await at(), { id: 's', row: false });
    await tab('s'); await wait(2500); assert.deepEqual(await at(), { id: 's', row: false }, 'the tab of the session the call is in: nothing moves, no row of tabs');
    await tab('old'); await goes('old'); await wait(4000); assert.equal((await at()).id, 'old', 'another tab: the call goes there and is kept there');
    s.say('One more thought.', { end: true }); await wait(4000); assert.equal((await at()).id, 'old', 'the other session writes: the call stays');   // it went back to the session written to last after a minute and a half
    s.user('And now this'); await goes('s');   // you type in the other session: the call goes there, nothing was to be let go first
    await tab('old'); await goes('old'); await c.page.evaluate(() => document.querySelector('#menu .mi[data-t=followTab]').click()); await tab('s'); await wait(2500); assert.equal((await at()).id, 'old', '⚙: off');
    await c.page.evaluate(() => document.querySelector('#menu .mi[data-t=followTab]').click());
    await c.page.evaluate((proj) => goSession(proj, 'old', true), s.proj); await tab('s'); await wait(2500); assert.deepEqual([(await at()).id, await c.page.evaluate(() => !!(S.pick && S.pick.pin))], ['old', true], 'pinned (a click on its tab): the Claude Code tabs you go through do not take the call');
    s.user('One last thing'); await goes('s'); await c.until(() => !S.pick); assert.equal(await c.page.evaluate(() => S.pick), null, 'until you ask something in another session: the call goes there, and nothing is pinned any more');
    await c.close();
  });

  await t.test('what an agent has used so far shows next to its name: on its tile, in the camera when it shares its screen, in the list of agents, and it stays in that list once the agent has left', async () => {
    const s = session(), sub = path.join(tmp, 'projects', s.proj, 's', 'subagents', 'agent-a1.jsonl'); s.user('hello', Date.now() - 600000); s.say('Ready.', { at: Date.now() - 590000, end: true }); const c = await open(s);
    const chips = () => c.page.evaluate(() => { const txt = (q) => { const e = document.querySelector(q); return e ? e.textContent : null; }; return { tile: txt('#t-a1 .tk'), camera: document.querySelector('#present.on') ? txt('#pcam .tk') : null, list: txt('#roster .rr[data-id="a1"]:not(.left) .rt'), left: txt('#roster .rr.left[data-id="a1"] .rt') }; });
    await c.quiet(500); s.user('Run the tests'); s.launch(1, 'Run the tests', 'Run the whole test suite.');
    fs.appendFileSync(sub, JSON.stringify({ timestamp: new Date().toISOString(), type: 'assistant', message: { id: 'u1', role: 'assistant', model: 'claude-test', stop_reason: 'tool_use', usage: { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 5000, cache_creation_input_tokens: 0 }, content: [{ type: 'tool_use', id: 'toolu_u1', name: 'Bash', input: { command: 'npm test' } }] } }) + '\n');   // 1,500 tokens: what it read from the cache is not in the headline
    await c.until(() => document.querySelector('#present.on') && document.querySelector('#pcam .tk') && document.querySelector('#pcam .tk').textContent === '⚡1.5k', null, 30000);
    assert.deepEqual(await chips(), { tile: '⚡1.5k', camera: '⚡1.5k', list: '⚡1.5k', left: null });
    await c.page.evaluate(() => { S.gone.add('a1'); paintStates(); }); assert.deepEqual({ ...(await chips()), tile: 0, camera: 0 }, { tile: 0, camera: 0, list: null, left: '⚡1.5k' });   // its tile has left the stage: its line and its count have not
    await c.close();
  });

  await t.test('a click that sends the call elsewhere is not undone by an answer that was already on its way', async () => {
    const s = session(), old = path.join(tmp, 'projects', s.proj, 'old.jsonl'), ago = Date.now() - 45 * 60000; s.user('hello'); s.say('Ready.', { end: true });
    fs.writeFileSync(old, [{ type: 'user', message: { role: 'user', content: 'an older conversation' } }, { type: 'assistant', message: { id: 'o1', role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Done.' }] } }].map((r) => JSON.stringify({ timestamp: new Date(ago).toISOString(), ...r })).join('\n') + '\n'); fs.utimesSync(old, ago / 1000, ago / 1000);
    const c = await open(s); await c.quiet(500); await c.page.evaluate((proj) => goSession(proj, 's'), s.proj); await wait(1000);
    await c.page.evaluate((proj) => { const of = window.fetch; let held = false; window.fetch = function (u) { const p = of.apply(this, arguments); if (held || typeof u !== 'string' || !u.startsWith('/api/current') || !u.includes('pid=s')) return p; held = true; setTimeout(() => goSession(proj, 'old'), 20); return p.then((r) => new Promise((res) => setTimeout(() => res(r), 600))); }; }, s.proj);   // the next answer about the session the call is kept in takes 600 ms, and the click comes in the meantime
    await c.until(() => S.cur && S.cur.id === 'old'); await wait(2500); assert.deepEqual(await c.page.evaluate(() => ({ id: S.cur && S.cur.id, to: S.pick && S.pick.id })), { id: 'old', to: 'old' });   // it used to take the call back
    await c.close();
  });

  await t.test('several sessions at once: a row of tabs from the second one on, each with its state; a visitor when another one stops for you, who takes the call there. The call is in the session you last typed in, or in the one you went to until you type somewhere', async () => {
    const s = session(), dir = path.join(tmp, 'projects', s.proj); s.user('First session'); s.say('Ready.', { end: true });
    const other = (id) => { const f = path.join(dir, id + '.jsonl'), put = (r) => fs.appendFileSync(f, JSON.stringify({ timestamp: new Date().toISOString(), ...r }) + '\n'), msg = (content, stop) => put({ type: 'assistant', message: { id: 'm' + ++nId, role: 'assistant', stop_reason: stop, content } });   // another session of the same folder
      return { user: (text) => put({ type: 'user', message: { role: 'user', content: text } }), say: (text) => msg([{ type: 'text', text }], 'end_turn'), tool: (name, input) => { const tid = 'toolu_' + ++nId; msg([{ type: 'tool_use', id: tid, name, input }], 'tool_use'); return tid; }, result: (tid) => put({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tid, content: 'ok' }] } }) }; };
    const c = await open(s), b = other('b'), q = other('q');
    const tabsNow = `[...document.querySelectorAll('#tabs .stab:not(.all)')].map((x) => (x.classList.contains('on') ? '>' : '') + x.querySelector('span').textContent + ' ' + (['blocked', 'working', 'waiting', 'turn', 'idle'].find((k) => x.classList.contains(k)) || '?'))`;
    const row = () => c.page.evaluate(tabsNow), rowIs = (tabs) => c.page.waitForFunction(`${tabsNow}.join('|') === ${JSON.stringify(tabs.join('|'))}`, { timeout: 30000, polling: 100 }).catch(async () => assert.deepEqual(await row(), tabs));   // not there in time: the row as it is
    const visitor = () => c.page.evaluate(() => { const v = document.querySelector('#visit.on'); return v ? { kind: v.classList.contains('blocked') ? 'blocked' : 'turn', says: v.querySelector('.vsay').textContent } : null; }), comes = (kind) => c.page.waitForFunction((k) => { const v = document.querySelector('#visit.on'); return v && v.classList.contains(k); }, { timeout: 30000, polling: 100 }, kind);
    const at = () => c.page.evaluate(() => S.cur && S.cur.id), goes = (id) => c.until((k) => S.cur && S.cur.id === k, id), tabOf = (name) => c.page.evaluate((n) => [...document.querySelectorAll('#tabs .stab:not(.all)')].find((x) => x.querySelector('span').textContent === n).click(), name);
    await c.quiet(500); assert.deepEqual(await row(), [], 'one session: no row');
    b.user('Second session'); const cmd = b.tool('Bash', { command: 'npm test' }); await goes('b'); await rowIs(['First session turn', '>Second session working']);   // a session is started: the call goes there by itself. It stayed where it was, and went there only when that session wrote last
    await tabOf('First session'); await goes('s'); await rowIs(['>First session turn', 'Second session working']); assert.ok((await c.page.evaluate(() => document.querySelector('#tabs .stab.on').textContent)).includes('📌'), 'a click on a tab takes the call there and pins it');
    b.result(cmd); b.say('The tests pass.'); await comes('turn'); let v = await visitor(); assert.match(v.says, /Second session/); assert.match(v.says, /done|finished/); assert.deepEqual(await row(), ['>First session turn', 'Second session turn']);   // its turn is over there
    assert.equal(await at(), 's', 'the other session writes and ends its turn: the call has not moved');
    await c.page.click('#visit .vgo'); await goes('b'); assert.equal(await visitor(), null, 'the call went there: the visitor leaves'); await rowIs(['First session turn', '>Second session turn']);
    assert.ok(!(await c.page.evaluate(() => document.querySelector('#tabs').textContent)).includes('📌'), 'the visitor takes the call there without pinning it'); await c.page.click('#tabs .stab.on'); await wait(1500); assert.deepEqual([await at(), await c.page.evaluate(() => document.querySelector('#tabs .stab.on').textContent.includes('📌'))], ['b', true], 'a click on the call’s own tab pins it there');
    q.user('Third session'); await goes('q'); await rowIs(['First session turn', 'Second session turn', '>Third session working']);   // a third one is started while the call was kept in the second: it goes there, nothing was to be let go first
    await tabOf('First session'); await goes('s'); await rowIs(['>First session turn', 'Second session turn', 'Third session working']);
    const ask = () => q.tool('AskUserQuestion', { questions: [{ question: 'Which one?', header: 'Choice', options: [{ label: 'A', description: 'a' }, { label: 'B', description: 'b' }], multiSelect: false }] }), first = ask();
    await comes('blocked'); v = await visitor(); assert.match(v.says, /Third session/); assert.match(v.says, /question/); await rowIs(['>First session turn', 'Second session turn', 'Third session blocked']);   // a question: said as such, in red
    await c.page.click('#visit .vx'); assert.equal(await visitor(), null, '✕ sends the visitor away'); assert.equal(await at(), 's'); const visited = Date.now();
    q.result(first); await rowIs(['>First session turn', 'Second session turn', 'Third session working']); ask(); await rowIs(['>First session turn', 'Second session turn', 'Third session blocked']);   // answered there, and a second question at once
    assert.equal(await visitor(), null, 'less than 20 s after the last visit: not yet'); await comes('blocked'); assert.ok(Date.now() - visited > 10000); await c.page.click('#visit .vx');   // told when the 20 s are over: it used to be lost
    await c.page.evaluate(() => document.querySelector('#menu .mi[data-t=visits]').click());   // ⚙: no visitor
    b.user('One more thing'); await goes('b'); await rowIs(['First session turn', '>Second session working', 'Third session blocked']);   // you type in the second one: the call is there again
    await tabOf('First session'); await goes('s'); b.say('Done as well.'); await rowIs(['>First session turn', 'Second session turn', 'Third session blocked']);
    await wait(11000); assert.equal(await visitor(), null, 'off in the settings: the tab alone says it');
    await c.page.evaluate(() => document.querySelector('#menu .mi[data-t=visits]').click());
    await c.close();
  });

  await t.test('a session of another tool in the same folder has its tab, which names the tool; in its call the lead says it too', async () => {
    const s = session(), VB = path.join(tmp, 'vibe'), vid = 'session_20261013_100000_abcd1234', vd = path.join(VB, 'logs', 'session', vid), ago = Date.now() - 180000; process.env.AGENT_STANDUP_VIBE = VB; fs.mkdirSync(vd, { recursive: true });
    fs.writeFileSync(path.join(vd, 'meta.json'), JSON.stringify({ start_time: new Date(ago - 60000).toISOString(), environment: { working_directory: '/' + s.proj.slice(1) }, child_sessions: [], title: 'Review the diff' }));   // a Mistral Vibe session started in the folder of the Claude Code one, in a terminal
    fs.writeFileSync(path.join(vd, 'messages.jsonl'), [{ role: 'user', content: 'Review the diff' }, { role: 'assistant', content: 'Nothing to change.' }].map((l) => JSON.stringify(l)).join('\n') + '\n'); fs.utimesSync(path.join(vd, 'messages.jsonl'), ago / 1000, ago / 1000);
    s.user('Claude session'); s.say('Ready.', { end: true }); const c = await open(s);
    const tabs = () => [...document.querySelectorAll('#tabs .stab:not(.all)')].map((x) => (x.classList.contains('on') ? '>' : '') + (x.querySelector('i') ? '[' + x.querySelector('i').textContent + '] ' : '') + x.querySelector('span').textContent).join('|'), role = () => c.page.evaluate(() => document.querySelector('#roster .rr[data-id="main"] .ro').textContent);
    await c.until(`(${tabs})() === '>Claude session|[Vibe] Review the diff'`, null, 30000); assert.equal(await role(), 'Lead', 'a Claude Code call: the lead as it always was');
    await c.page.click('#tabs .stab:not(.on):not(.all)'); await c.until((id) => S.cur && S.cur.id === id, vid); await c.until(`(${tabs})() === 'Claude session|>[Vibe] Review the diff'`); await c.until(() => { const r = document.querySelector('#roster .rr[data-id="main"] .ro'); return r && r.textContent === 'Lead · Vibe'; });
    const was = await c.page.evaluate(() => prefs.proj || ''); await c.page.evaluate((id) => openSession('_vibe', id), vid); await wait(1500);   // the same session opened from the Sessions view or from ⋯
    assert.deepEqual(await c.page.evaluate(() => ({ id: S.cur && S.cur.id, to: S.pick && S.pick.id, proj: prefs.proj || '' })), { id: vid, to: vid, proj: was }, 'the call is kept there, and the project to follow is not “Mistral Vibe”: it used to be, and a window with no folder then never showed a Claude Code session again');
    assert.notEqual(JSON.parse(fs.readFileSync(process.env.AGENT_STANDUP_PREFS, 'utf8')).proj, '_vibe', 'nor is it saved');
    await c.close();
    const d = await open(s, true, `&pin=${vid}&pproj=_vibe`), both = `(${tabs})().split('|').sort().join('|')`;   // the call as the VS Code status bar opens it on the Vibe session: kept there, in a window that still follows its folder
    await d.until(`${both} === '>[Vibe] Review the diff|Claude session'`, null, 30000); assert.deepEqual(await d.page.evaluate(() => ({ id: S.cur.id, to: S.pick && S.pick.id, at: S.pick && S.pick.proj })), { id: vid, to: vid, at: '_vibe' });
    s.user('Back to this one'); await d.until(() => S.cur && S.cur.id === 's' && !S.pick); await d.until(`${both} === '>Claude session|[Vibe] Review the diff'`);   // you type in the Claude Code session of the folder: the call goes there. Opened on a Vibe session, the window used to stay among the Vibe sessions
    await d.close(); delete process.env.AGENT_STANDUP_VIBE;
  });

  await t.test('an editor open on another folder than the sessions: the call goes to the latest session of anywhere, and the tabs show the others too', async () => {
    const s = session(), dir = path.join(tmp, 'projects', s.proj), line = (r) => JSON.stringify({ timestamp: new Date().toISOString(), ...r }) + '\n'; s.user('Wide first'); s.say('Ready.', { end: true });
    fs.writeFileSync(path.join(dir, 'b.jsonl'), line({ type: 'user', message: { role: 'user', content: 'Wide second' } }) + line({ type: 'assistant', message: { id: 'w1', role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Done.' }] } }));
    await wait(1300); const c = await open({ proj: '-no-session-here' }), names = () => c.page.evaluate(() => [...document.querySelectorAll('#tabs .stab:not(.all) span')].map((x) => x.textContent));   // 1.3 s: the list of sessions is shared for 1.2 s, and the row shows the first eight sessions it saw; these two must be in the first list this page gets
    const ask = (proj) => c.page.evaluate(async (p) => (await fetch('/api/current?proj=' + p)).json(), proj); assert.equal((await ask('-no-session-here')).wide, 1); assert.equal((await ask(s.proj)).wide, undefined, 'a folder that has sessions: only those');
    await c.until(() => { const n = [...document.querySelectorAll('#tabs .stab:not(.all) span')].map((x) => x.textContent); return n.includes('Wide first') && n.includes('Wide second'); }, null, 30000);   // there used to be no row at all: one session on screen and nothing to say there was another
    assert.ok(['s', 'b'].includes(await c.page.evaluate(() => S.cur.id)), 'the call is in the latest session'); assert.ok((await names()).length >= 2);
    await c.page.evaluate((proj) => goSession(proj, 's'), s.proj); await c.until(() => S.cur && S.cur.id === 's' && S.pick && S.pick.id === 's'); await wait(3500); assert.ok((await names()).includes('Wide second'), 'a call kept in a session you went to keeps the other tabs');
    await c.close();
  });

  await t.test('an artifact the session publishes is shared in a browser window, kept in the line of files and pinned on a click; its page reaches neither the app nor the network', async () => {
    const s = session(), fp = '/tmp/scratch/report.html', url = 'https://claude.ai/artifact/AbCdEf123456', main = path.join(tmp, 'projects', s.proj, 's.jsonl');
    const published = (id, seq) => fs.appendFileSync(main, JSON.stringify({ timestamp: new Date().toISOString(), type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'Published at ' + url }] }, toolUseResult: { url, title: 'Report', ...(seq ? { seq } : {}) } }) + '\n');   // what Claude Code notes beside the answer of a publish
    s.user('Publish the report.'); s.say('I write the report, then I publish it.');
    const c = await open(s), out = []; c.page.on('response', (r) => { if (!/^(http:\/\/localhost|data:|blob:)/.test(r.url())) out.push(r.url()); });
    const frame = () => c.page.frames().find((x) => x.url().includes('/api/artifact')), inFrame = async (fn) => { for (let i = 0; i < 80; i++) { try { const v = frame() && await frame().evaluate(fn); if (v) return v; } catch {} await wait(100); } return null; };   // the frame is there before its page is
    await wait(1000); s.result(s.tool('Write', { file_path: fp, content: '<title>Report</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"><h1 id="h">Totals</h1>' }), 'File created'); await wait(500);
    const p1 = s.tool('Artifact', { file_path: fp, description: 'The totals of the quarter.' }); await wait(700); published(p1);
    await c.until(() => !!document.querySelector('#present.on .pwin.web iframe[sandbox="allow-scripts"]'));
    assert.equal(await inFrame(() => document.querySelector('#h') && document.querySelector('#h').textContent + '|' + window.origin), 'Totals|null');   // the page the session wrote, in an origin of its own
    assert.equal(await inFrame(() => fetch('/api/sessions').then(() => 'answered', () => 'refused')), 'refused'); assert.equal(await inFrame(() => fetch('https://example.com/').then(() => 'answered', () => 'refused')), 'refused');
    assert.equal(await c.page.evaluate(() => document.querySelector('#ptitle').textContent + '|' + document.querySelector('.purl').textContent + '|' + document.querySelector('#pstat').textContent), 'Report|🔒 claude.ai/artifact/AbCdEf123456|The totals of the quarter.');
    const left = [], sink = require('http').createServer((q, r) => { left.push(q.url); r.end('elsewhere'); }).listen(0, '127.0.0.1'); await new Promise((r) => sink.once('listening', r));   // another address, on this machine: what a page would reach by taking its own frame there
    await frame().evaluate((to) => { location.href = to; }, 'http://127.0.0.1:' + sink.address().port + '/?said=Totals').catch(() => {}); await wait(1200); sink.close(); assert.deepEqual(left, [], 'a page cannot take its frame elsewhere either');
    s.say('The report is published.', { end: true }); await c.until(() => !!document.querySelector('#files.on [data-a]'), null, 40000);
    await c.until(() => !document.querySelector('#present.on'), null, 40000); assert.equal(await c.page.evaluate(() => document.querySelectorAll('iframe').length), 0);   // the window closes by itself, and its page does not go on running behind it
    await c.page.click('#files [data-a]'); await c.until(() => !!document.querySelector('#present.on.pin .pwin.web iframe')); assert.equal(await c.page.evaluate(() => document.querySelector('.pweb').style.getPropertyValue('--z')), '1.000');   // pinned: at its real size
    s.user('A shorter title.'); await wait(500); s.result(s.tool('Bash', { command: 'npm test' }), 'ok'); await wait(700); assert.ok(await c.page.evaluate(() => !!document.querySelector('#present.on.pin .pwin.web iframe')), 'pinned, it stays up while the team works');
    s.result(s.tool('Edit', { file_path: fp, old_string: 'Totals', new_string: 'Sum' }), 'ok'); await wait(400); const p2 = s.tool('Artifact', { file_path: fp, url }); await wait(500); published(p2, 2);
    await c.until((id) => { const x = document.querySelector('#present.pin .pweb iframe'); return !!x && x.src.includes(id); }, p2); assert.equal(await inFrame(() => document.querySelector('#h') && document.querySelector('#h').textContent === 'Sum' && 'Sum'), 'Sum');   // published again: the pinned window shows the new version
    assert.equal(await c.page.evaluate(() => [...document.querySelectorAll('.pnav .pnn')].map((x) => x.textContent).join()), 'v2');
    await c.page.keyboard.press('Escape'); await c.until(() => !document.querySelector('#present.on') && !S.artPin && !document.querySelector('#present iframe'));
    assert.deepEqual(out, [], 'nothing was fetched from outside'); await c.close();
  });

  await t.test('with a Spanish interface the call is held in Spanish, and says so once with the way to turn it off: the session is translated into it, the built-in lines are Spanish, and a line gets the voice of its language', { skip: process.platform === 'win32' }, async () => {
    const s = session(), old = Date.now() - 600000; s.user('OLD order', old); s.say('OLD answer, all done.', { at: old + 5000, end: true }); const c = await open(s, true, '&lang=es'); await c.quiet();
    const note = () => c.page.evaluate(() => (getComputedStyle(document.querySelector('#trNote')).display === 'none' ? null : document.querySelector('#trNoteT').textContent));
    assert.deepEqual(await c.page.evaluate(() => [CALL(), getComputedStyle(document.querySelector('#callTrMi')).display !== 'none', document.querySelector('#callTrMi .sw').classList.contains('on')]), ['es', true, true], 'a Spanish interface means a Spanish call, as a French one does; the switch that turns it off is there');
    assert.equal(await note(), 'La llamada ahora se traduce al español, con tu Claude Code.', 'the first time, the call says that it is translated and with what');
    await c.page.click('#trNoteOff'); await c.until(() => CALL() === 'en' && !document.querySelector('#callTrMi .sw').classList.contains('on')); assert.deepEqual(await c.page.evaluate(() => [prefs.callTr, document.querySelector('#callTrMi .sw').classList.contains('on'), voiceLang('He terminado la tarea y todo está listo.'), voiceLang('OK.')]), [false, false, 'es', 'en'], 'turned off from the note: nothing is translated, the switch follows, and a Spanish line has a Spanish voice all the same');
    await c.page.evaluate(() => { prefs.callTr = true; return setLang('es'); }); assert.equal(await c.page.evaluate(() => CALL()), 'es'); assert.equal(await note(), null, 'said once');
    s.user('Please finish the work.'); await wait(1500); s.say('The work is done and the tests pass.', { end: true });
    await c.heard('Ya está, todo listo y sin errores [The work is done and the tests pass.]'); await closed(c, 1);
    assert.match((await closing(c))[0], /(Tu turno|Te toca|Te devuelvo la palabra)\.$/, 'the lead closes in Spanish'); assert.equal(count(await c.lines(), 'Ya está, todo listo y sin errores [Please finish the work.]'), 1, 'your own line is translated too');
    assert.deepEqual(await c.page.evaluate(() => ['He terminado la tarea y todo está listo.', 'Un momento, está cargando.', 'The build is done and all the tests pass now.', 'OK.'].map(voiceLang)), ['es', 'es', 'en', 'es'], 'Spanish unless a line is plainly English');
    await c.page.evaluate(() => setLang('pt-BR')); assert.deepEqual(await c.page.evaluate(() => [CALL(), voiceLang('Terminei a tarefa e está tudo pronto.'), LEAD[CALL()].any, trMem.has('The work is done and the tests pass.')]), ['pt', 'pt', 'Vou começar.', false], 'another language of the call: its own lines, and nothing kept from the Spanish one');
    await c.page.evaluate(() => setLang('de')); assert.deepEqual(await c.page.evaluate(() => [CALL(), voiceLang('OK.'), voiceLang('Voici le rapport, il est dans le dossier.')]), ['en', 'en', 'fr'], 'an interface language the call is not held in: the session as it is');
    assert.equal(await c.page.evaluate(() => getComputedStyle(document.querySelector('#callTrMi')).display), 'none', 'the switch is offered for Spanish and Portuguese only'); await c.page.evaluate(async () => { prefs.callTr = true; delete prefs.callTrSeen; await setLang('en'); savePrefs(); }); await wait(700); await c.close();   // the note saved the settings while the page was in Spanish: put back for the tests that follow
  });
  await t.test('the real voices are the default and babble until they are installed; the call says they exist, once; the cartoon and Simlish styles are gone and whoever had one is moved; a system voice reads a line of a language the model lacks', async () => {
    const s = session(), old = Date.now() - 600000; s.user('OLD order', old); s.say('OLD answer, all done.', { at: old + 5000, end: true }); const c = await open(s); await c.quiet();
    assert.deepEqual(await c.page.evaluate(() => [[...document.querySelectorAll('#vstyle option')].map((o) => o.value), prefs.vstyle, TTS.engine, babbles()]), [['animal', 'kokoro'], 'kokoro', 'system', true], 'nothing is installed here: the real voices are chosen, and babble');
    const stored = async (v) => { await c.page.evaluate((v) => { prefs.vstyle = v; prefs.vstyleChosen = true; prefs.voiceOffer = 'no'; savePrefs(); }, v); await wait(700); await c.page.reload(); await c.page.waitForFunction('typeof S !== "undefined" && S.cur', { timeout: 15000 }); return c.page.evaluate(() => [prefs.vstyle, prefs.voiceOffer || null, babbles()]); };   // what a person who had chosen that style, and closed the offer, finds at the next start
    assert.deepEqual([await stored('cartoon'), await stored('sims'), await stored('animal')], [['kokoro', null, true], ['animal', 'no', true], ['animal', 'no', true]], 'the cartoon style becomes the natural voices, offered once more; Simlish becomes the other babble; Animal Crossing stays');
    await c.page.evaluate(() => { prefs.vstyle = 'kokoro'; delete prefs.vstyleChosen; delete prefs.voiceOffer; savePrefs(); }); await wait(700); await c.page.click('#gB'); await c.until(() => !document.querySelector('#gate.on'));   // the page was loaded again: joined again, since a line that offers something waits for the call
    const offer = () => c.page.evaluate(() => (getComputedStyle(document.querySelector('#vOffer')).display === 'none' ? null : document.querySelector('#vOfferT').textContent + ' | ' + document.querySelector('#vOfferB').textContent));
    assert.equal(await offer(), null, 'voices are off in these tests: nothing is offered'); const npm = await c.page.evaluate(async () => (await (await fetch('/api/kokoro')).json()).npm);
    await c.page.evaluate(() => { prefs.voice = true; return voiceOffer(); }); assert.equal(await offer(), npm ? 'Your agents can speak with real voices. | Install (750 MB)' : null, 'voices on and the real ones not installed: the call says they exist');
    if (npm) { await c.page.click('#vOfferX'); await c.until(() => getComputedStyle(document.querySelector('#vOffer')).display === 'none'); assert.equal(await c.page.evaluate(() => prefs.voiceOffer), 'no'); await c.page.evaluate(() => voiceOffer()); assert.equal(await offer(), null, 'closed once, it does not come back'); }
    await c.page.evaluate(() => { prefs.voice = false; delete prefs.voiceOffer; savePrefs(); });
    assert.equal(await c.page.evaluate(async () => { const of = window.fetch, was = prefs.lang; window.fetch = (u, o) => (u === '/api/kokoro' ? Promise.resolve(new Response(JSON.stringify({ installed: true, ready: true, g2p: false, npm: true, g2pMb: 18, sizeMb: 750 }))) : of(u, o));
      prefs.voice = true; prefs.lang = 'fr'; await voiceOffer(); const said = getComputedStyle(document.querySelector('#vOffer')).display === 'none' ? null : document.querySelector('#vOfferT').textContent + ' | ' + document.querySelector('#vOfferB').textContent;
      prefs.lang = was; prefs.voice = false; window.fetch = of; await voiceOffer(); return said; }), 'Voix prêtes en anglais. Le français est encore lu par les voix du système. | Ajouter les voix françaises (18 Mo)', 'voices installed before French existed, and a French interface: the call says one small package adds them');
    assert.equal(await c.page.evaluate(async () => { const g = document.querySelector('#gate'), o = document.querySelector('#vOffer'); o.style.display = ''; g.classList.add('on'); const under = getComputedStyle(o).display; g.classList.remove('on'); const after = getComputedStyle(o).display; o.style.display = 'none'; return under + ' ' + after; }), 'none flex', 'a line that offers something is not shown over the join screen: in a small panel it covered the button');
    assert.deepEqual(await c.page.evaluate(() => ['Ich habe die Funktion korrigiert und die Tests laufen jetzt alle durch.', '関数を修正し、テストはすべて通りました。', '함수를 수정했고 테스트가 모두 통과합니다.', '我修复了函数，所有测试都通过了。', 'Jeg har rettet funktionen, og alle testene kører nu igennem.', 'I fixed the function and all the tests pass now.'].map(langOf)), ['de', 'ja', 'ko', 'zh', 'da', 'en']);
    assert.deepEqual(await c.page.evaluate(() => { TTS.engine = 'kokoro'; TTS.pool.en = ['af_heart']; TTS.pool.de = ['Anna']; TTS.pool.ja = []; const p = { id: 'main', vi: 0 }; return [babbles(), TTS.voiceFor(p, 'de'), TTS.voiceFor(p, 'ja'), TTS.voiceFor(p, 'en')]; }), [false, 'Anna', 'af_heart', 'af_heart'], 'once the real voices are there: a German line to a German system voice, a language with no voice at all to the English one');
    await c.close();
  });
});
