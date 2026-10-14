// test/server.test.js: the settings file, session stickiness, the cross-site guard and the pictures of a session, against a real server on a free port
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'as-test-'));
process.env.AGENT_STANDUP_PREFS = path.join(tmp, 'prefs.json'); process.env.AGENT_STANDUP_KOKORO_DIR = path.join(tmp, 'kokoro'); process.env.AGENT_STANDUP_PROJECTS = path.join(tmp, 'projects');
// A stand-in for Claude Code, so that nothing here ever starts the real one: it "translates" a text into the name of the language it was asked for, a bar, and the text. Both ways the server calls it: a worker fed one line at a time, and one batch.
const CLAUDE = path.join(tmp, 'claude'); process.env.AGENT_STANDUP_CLAUDE = CLAUDE;
fs.writeFileSync(CLAUDE, `#!/usr/bin/env node
const a = process.argv.slice(2), sys = a[a.indexOf('--system-prompt') + 1] || '', lang = (s) => (/(?:natural spoken|meeting, in) ([A-Za-z ]+?)[,.]/.exec(s) || [])[1];
if (a.includes('--input-format')) require('readline').createInterface({ input: process.stdin }).on('line', (l) => { const m = JSON.parse(l); console.log(JSON.stringify({ type: 'result', result: lang(sys) + '|' + m.message.content })); });
else { let s = ''; process.stdin.on('data', (d) => (s += d)).on('end', () => { const arr = JSON.parse(s.slice(s.indexOf('\\n') + 1)); console.log(JSON.stringify(arr.map((t) => lang(s) + '|' + t))); }); }
`, { mode: 0o755 });
const get = (port, p, headers = {}, method = 'GET', body) => new Promise((res, rej) => { const r = http.request({ port, path: p, method, headers }, (x) => { let b = '', n = 0; x.on('data', (d) => { b += d; n += d.length; }); x.on('end', () => res({ status: x.statusCode, body: b, type: x.headers['content-type'], bytes: n })); }); r.on('error', rej); if (body) r.write(body); r.end(); });
test('settings are kept in a file; cross-site writes are refused', async () => {
  const srv = require('../server.js').start(0); await new Promise((r) => srv.once('listening', r)); const port = srv.address().port;
  try {
    assert.match((await get(port, '/api/prefs.js')).body, /SAVED_PREFS = null/);
    assert.equal((await get(port, '/api/prefs', { 'content-type': 'application/json' }, 'PUT', '{"lang":"fr","_t":5}')).status, 200);
    assert.match((await get(port, '/api/prefs.js')).body, /"lang":"fr"/);
    assert.equal((await get(port, '/api/prefs', { 'sec-fetch-site': 'cross-site' }, 'PUT', '{}')).status, 403);
    assert.equal((await get(port, '/api/prefs', {}, 'PUT', '[1]')).status, 400);
    assert.equal(JSON.parse((await get(port, '/api/kokoro')).body).installed, false);
    assert.equal((await get(port, '/api/kokoro/install', { 'sec-fetch-site': 'cross-site' }, 'POST')).status, 403);
  } finally { srv.close(); require('../server.js').shutdown(); }
});
test('pictures returned by tools are counted in the timeline and served from the transcript only', async () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', pic = (type, data) => ({ type: 'image', source: { type: 'base64', media_type: type, data } });
  const rec = (id, content) => [{ type: 'assistant', timestamp: '2026-01-01T00:00:00Z', message: { content: [{ type: 'tool_use', id, name: 'Read', input: { file_path: '/x/shot.png' } }] } }, { type: 'user', timestamp: '2026-01-01T00:00:01Z', message: { content: [{ type: 'tool_result', tool_use_id: id, content }] } }].map((r) => JSON.stringify(r)).join('\n') + '\n';
  const dir = path.join(tmp, 'projects', '-p'); fs.mkdirSync(path.join(dir, 's1', 'subagents'), { recursive: true });
  fs.writeFileSync(path.join(dir, 's1.jsonl'), rec('toolu_pic', [pic('image/png', png), pic('image/svg+xml', 'PHN2Zy8+')])); fs.writeFileSync(path.join(dir, 's1', 'subagents', 'agent-a1.jsonl'), rec('toolu_sub', [pic('image/png', png)]));
  const srv = require('../server.js').start(0); await new Promise((r) => srv.once('listening', r)); const port = srv.address().port, media = (q) => get(port, '/api/media?proj=-p&id=s1&' + q);
  try {
    const items = JSON.parse((await get(port, '/api/session?proj=-p&id=s1')).body).events.filter((e) => e.kind === 'results').flatMap((e) => e.items);
    assert.deepEqual(items.map((it) => [it.id, it.img]).sort(), [['toolu_pic', 1], ['toolu_sub', 1]]);   // the SVG is not a picture we show
    const ok = await media('agent=main&tool=toolu_pic&n=0'); assert.equal(ok.status, 200); assert.equal(ok.type, 'image/png'); assert.equal(ok.bytes, Buffer.from(png, 'base64').length);
    assert.equal((await media('agent=a1&tool=toolu_sub&n=0')).status, 200);
    assert.equal((await media('agent=main&tool=toolu_pic&n=1')).status, 404);
    assert.equal((await media('agent=main&tool=toolu_sub&n=0')).status, 404);
    assert.equal((await media('agent=..&tool=toolu_pic&n=0')).status, 400);
    assert.equal((await get(port, '/api/media?proj=..&id=s1&agent=main&tool=toolu_pic&n=0')).status, 400);
    assert.equal((await get(port, '/api/media?proj=-p&id=s1&agent=main&tool=toolu_pic&n=0', { 'sec-fetch-site': 'cross-site' })).status, 403);
  } finally { srv.close(); require('../server.js').shutdown(); }
});
test('an order typed while the lead is working is part of the call', async () => {
  const at = (s) => `2026-01-01T00:00:0${s}Z`, queued = (s, prompt, origin) => ({ type: 'attachment', timestamp: at(s), attachment: { type: 'queued_command', prompt, origin, commandMode: origin.kind === 'human' ? 'prompt' : 'task-notification' } });
  const recs = [{ type: 'user', timestamp: at(0), message: { role: 'user', content: 'first order' } }, { type: 'assistant', timestamp: at(1), message: { content: [{ type: 'tool_use', id: 'toolu_q', name: 'Bash', input: { command: 'ls' } }] } },
    queued(2, [{ type: 'text', text: 'order sent meanwhile' }], { kind: 'human' }), queued(3, '<task-notification>\n<task-id>x</task-id>', { kind: 'task-notification' }), { type: 'assistant', timestamp: at(4), message: { content: [{ type: 'text', text: 'On it.' }] } }];
  const dir = path.join(tmp, 'projects', '-q'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 's2.jsonl'), recs.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const srv = require('../server.js').start(0); await new Promise((r) => srv.once('listening', r)); const port = srv.address().port;
  try {
    const said = JSON.parse((await get(port, '/api/session?proj=-q&id=s2')).body).events.filter((e) => e.kind === 'user' || e.kind === 'say').map((e) => [e.agent, e.text]);
    assert.deepEqual(said, [['user', 'first order'], ['user', 'order sent meanwhile'], ['main', 'On it.']]);
  } finally { srv.close(); require('../server.js').shutdown(); }
});
// ---- 1.25.7: a live feed that loses nothing, the end of the lead's turn, transcripts of other shapes, requests that used to stop the server
const wait = (ms) => new Promise((r) => setTimeout(r, ms)), at = (s) => new Date(Date.UTC(2026, 0, 1, 0, 0, 0) + s * 1000).toISOString(), line = (r) => JSON.stringify(r) + '\n';
const said = (s, text, o = {}) => ({ type: 'assistant', timestamp: at(s), message: { id: o.id || 'm' + s, stop_reason: o.stop === undefined ? null : o.stop, content: [{ type: o.thinking ? 'thinking' : 'text', [o.thinking ? 'thinking' : 'text']: text }] } });
const used = (s, id, name, input, o = {}) => ({ type: 'assistant', timestamp: at(s), message: { id: o.id || 'm' + s, stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input }] } });
const typed = (s, content, o = {}) => ({ type: 'user', timestamp: at(s), ...o, message: { role: 'user', content } }), result = (s, id, content, o = {}) => typed(s, [{ type: 'tool_result', tool_use_id: id, content }], o);
const serve = async () => { const srv = require('../server.js').start(0); await new Promise((r) => srv.once('listening', r)); return { srv, port: srv.address().port, stop: () => { srv.close(); require('../server.js').shutdown(); } }; };
const load = async (port, q) => JSON.parse((await get(port, '/api/session?' + q)).body);
test('a live call followed record by record ends with exactly what a fresh load shows', async () => {
  const dir = path.join(tmp, 'projects', '-f'), main = path.join(dir, 's.jsonl'), sub = path.join(dir, 's', 'subagents', 'agent-a1.jsonl'); fs.mkdirSync(path.dirname(sub), { recursive: true });
  const steps = [   // [file, record]: written one at a time, the way Claude Code writes them
    [main, typed(0, 'first order')], [main, said(1, 'I will look.')],
    [main, used(2, 'toolu_r', 'Read', { file_path: '/x/a.js' }, { id: 'mA' })], [main, used(2, 'toolu_g', 'Grep', { pattern: 'slow' }, { id: 'mA' })], [main, used(3, 'toolu_ag', 'Agent', { prompt: 'Find the slow query.', description: 'Profiler' }, { id: 'mA' })],   // one message, one record per tool call
    [sub, typed(4, 'Find the slow query.')], [sub, used(5, 'toolu_b', 'Bash', { command: 'ls' })], [sub, said(6, 'Found it: the cart query.')],
    [main, { type: 'attachment', timestamp: at(2.5), attachment: { type: 'queued_command', prompt: [{ type: 'text', text: 'ORDER TYPED MEANWHILE' }], origin: { kind: 'human' }, commandMode: 'prompt' } }],   // typed at 2.5 s, delivered after lines stamped later
    [main, result(7, 'toolu_ag', 'The cart query is slow.')],   // the sub-agent's completion record comes after its last text
    [main, used(8, 'toolu_e', 'Edit', { file_path: '/x/a.js', old_string: 'a', new_string: 'b' })], [main, typed(9, [{ type: 'text', text: '[Request interrupted by user for tool use]' }])],
    [main, typed(10, 'second order')], [main, said(11, 'Done.', { stop: 'end_turn' })]];
  fs.writeFileSync(path.join(dir, 's', 'subagents', 'agent-a1.meta.json'), JSON.stringify({ agentType: 'general-purpose', description: 'Profiler', toolUseId: 'toolu_ag' }));
  fs.writeFileSync(main, line(steps[0][1]));
  const { port, stop } = await serve(), q = 'proj=-f&id=s';
  try {
    const first = await load(port, q), have = new Map(first.events.map((e) => [e.k, e])), seen = []; let seq = first.seq, late = 0; const ep = first.ep;
    assert.equal(typeof ep, 'string'); assert.ok(Number.isInteger(seq)); assert.equal(have.size, first.events.length); assert.equal(first.marks, 1, 'before the lead has written anything, its turn is open');   // marks: the turns of this transcript end with a mark, so the lead is at work until one comes
    const marks = [];
    for (const [file, rec] of steps.slice(1)) {
      fs.appendFileSync(file, line(rec)); await wait(280);   // the server does not build a timeline twice within 250 ms
      const d = await load(port, q + '&after=' + seq + '&ep=' + ep); assert.equal(d.ep, ep); assert.ok(d.seq >= seq); assert.deepEqual(Object.keys(d).filter((k) => k !== 'marks').sort(), ['agents', 'ep', 'events', 'id', 'seq']); marks.push(d.marks || 0);
      for (const e of d.events) { seen.push([have.has(e.k) ? 'changed' : 'new', e.kind, e.agent, e.end || 0]); if (!have.has(e.k) && [...have.values()].some((x) => x.ts > e.ts)) late++; have.set(e.k, e); }   // what the page does: a known key is replaced in place, an unknown one is added
      seq = d.seq; assert.deepEqual((await load(port, q + '&after=' + seq + '&ep=' + ep)).events, []);   // asked again with the new number: nothing
    }
    const fresh = await load(port, q); assert.equal(fresh.ep, ep); assert.equal(fresh.seq, seq); assert.equal(marks[0], 0, 'a transcript whose records carry no stop reason is not said to mark its turns'); assert.equal(marks[marks.length - 1], 1); assert.equal(fresh.marks, 1);
    assert.equal(new Set(fresh.events.map((e) => e.k)).size, fresh.events.length);   // keys are unique
    assert.deepEqual([...have.keys()].sort(), fresh.events.map((e) => e.k).sort()); for (const e of fresh.events) assert.deepEqual(have.get(e.k), e);
    fs.mkdirSync(path.join(tmp, 'projects', '-f2'), { recursive: true }); fs.cpSync(dir, path.join(tmp, 'projects', '-f2'), { recursive: true });   // the same files read for the first time by a server that never saw them grow: same keys, same events
    const cold = await load(port, 'proj=-f2&id=s'); assert.notEqual(cold.ep, ep); assert.deepEqual(cold.events, fresh.events);
    // the three losses of the feed by position, each seen coming through
    assert.ok(late >= 1); assert.ok(seen.some((s) => s[0] === 'new' && s[1] === 'user')); assert.equal([...have.values()].filter((e) => e.kind === 'user').map((e) => e.text).join('|'), 'first order|ORDER TYPED MEANWHILE|second order');
    assert.ok(seen.some((s) => s[0] === 'changed' && s[1] === 'report' && s[2] === 'a1')); assert.deepEqual([...have.values()].filter((e) => e.agent === 'a1').map((e) => e.kind).sort(), ['finish', 'report', 'tools']);
    assert.ok(seen.some((s) => s[0] === 'changed' && s[1] === 'tools' && s[2] === 'main')); assert.deepEqual(fresh.events.filter((e) => e.kind === 'tools' && e.agent === 'main').map((e) => e.tools.map((t) => t.id).join('+') + (e.end ? ' end' : '')), ['toolu_r+toolu_g', 'toolu_e end']);
    assert.ok(seen.some((s) => s[0] === 'changed' && s[1] === 'tools' && s[3] === 1));   // the interruption marks a beat the page already had: it comes back under the same key
    // a page that follows another feed is told to load again; a page from before the upgrade is still answered by position
    assert.deepEqual(await load(port, q + '&after=0&ep=nope'), { resync: true }); assert.deepEqual(await load(port, q + '&after=' + (seq + 1) + '&ep=' + ep), { resync: true });
    const old = await load(port, q + '&after=2'); assert.equal(old.total, fresh.events.length); assert.deepEqual(old.events, fresh.events.slice(2));
    assert.equal((await load(port, q + '&after=0&ep=' + ep)).events.length, fresh.events.length);
  } finally { stop(); }
});
test('the lead\'s turn ends on end_turn or on an interruption, and only the lead\'s', async () => {
  const dir = path.join(tmp, 'projects', '-e'); fs.mkdirSync(path.join(dir, 's', 'subagents'), { recursive: true });
  fs.writeFileSync(path.join(dir, 's.jsonl'), [typed(0, 'one'), said(1, 'Looking.', { stop: 'tool_use', id: 'm1' }), used(1, 'toolu_1', 'Bash', { command: 'ls' }, { id: 'm1' }), result(2, 'toolu_1', 'a.js'),
    said(3, 'hm', { thinking: 1, stop: 'end_turn', id: 'm2' }), said(3, 'All good.', { stop: 'end_turn', id: 'm2' }),   // one message, one record per block, each with the stop reason: the mark is on the line, once
    typed(4, 'two'), said(5, 'Starting.'), used(6, 'toolu_2', 'Bash', { command: 'sleep 9' }), used(6, 'toolu_3', 'Read', { file_path: '/x' }), result(7, 'toolu_2', 'no', { toolUseResult: 'interrupted' }), typed(7, [{ type: 'text', text: '[Request interrupted by user for tool use]' }]),
    typed(8, 'three'), said(9, 'Let me think about'), typed(10, [{ type: 'text', text: '[Request interrupted by user]' }]), typed(11, 'four'), used(12, 'toolu_4', 'Glob', { pattern: '*' })].map(line).join(''));
  fs.writeFileSync(path.join(dir, 's', 'subagents', 'agent-a1.jsonl'), [typed(1, 'sub order'), said(2, 'Sub done.', { stop: 'end_turn' })].map(line).join(''));
  const { port, stop } = await serve();
  try {
    const ev = (await load(port, 'proj=-e&id=s')).events.filter((e) => e.kind === 'say' || e.kind === 'tools' || e.kind === 'user' || e.kind === 'report');
    assert.deepEqual(ev.map((e) => e.agent + ' ' + (e.text || e.tools.map((t) => t.id).join('+')) + (e.end ? ' END' : '')), ['user one', 'main Looking.', 'main toolu_1', 'a1 Sub done.', 'main All good. END', 'user two', 'main Starting.', 'main toolu_2+toolu_3 END', 'user three', 'main Let me think about END', 'user four', 'main toolu_4']);
    assert.ok(ev.every((e) => e.end === undefined || e.end === 1));
  } finally { stop(); }
});
test('a turn that ends on a message Claude Code writes itself is over: the API is down, the limit is reached, a refusal, nothing to answer; a message of the model that is cut is not the end', async () => {
  const dir = path.join(tmp, 'projects', '-x'); fs.mkdirSync(path.join(dir, 's', 'subagents'), { recursive: true });
  const err = (s, text, stop = 'stop_sequence') => ({ ...said(s, text, { stop }), isApiErrorMessage: true });   // written by Claude Code itself, in the place of the model's answer
  const own = (r) => ({ ...r, message: { ...r.message, model: '<synthetic>' } });
  fs.writeFileSync(path.join(dir, 's.jsonl'), [typed(0, 'one'), said(1, 'Looking.'), err(2, 'API Error: 529 Overloaded.'), typed(3, 'two'), err(4, 'You have hit your limit'), typed(5, 'three'), err(6, 'API Error: the safeguards flagged this message', 'refusal'),
    typed(7, 'four'), own(said(8, 'No response requested.', { stop: 'stop_sequence' })), typed(9, 'five'), said(10, 'A long answer that was cut', { stop: 'max_tokens' }), typed(11, 'six'), said(12, 'Stopped by a safety check in the middle', { stop: 'refusal' }), said(13, 'and it goes on.', { stop: 'tool_use' }),
    typed(14, 'seven'), used(15, 'toolu_w', 'Bash', { command: 'sleep 60' }), err(16, 'API Error: Connection lost mid-response.'), result(17, 'toolu_w', 'ok'), said(18, 'Back, and done.', { stop: 'end_turn' })].map(line).join(''));   // the connection dropped while a call was out: the lead goes on when it answers
  fs.writeFileSync(path.join(dir, 's', 'subagents', 'agent-a1.jsonl'), [typed(1, 'sub order'), err(1.5, 'API Error: 500')].map(line).join(''));   // a sub-agent that fails does not end the lead's turn
  const { port, stop } = await serve();
  try {
    const ev = (await load(port, 'proj=-x&id=s')).events.filter((e) => e.kind === 'say' || e.kind === 'user');
    assert.deepEqual(ev.map((e) => e.agent + ' ' + e.text + (e.end ? ' END' : '')), ['user one', 'main Looking.', 'a1 API Error: 500', 'main API Error: 529 Overloaded. END', 'user two', 'main You have hit your limit END', 'user three', 'main API Error: the safeguards flagged this message END', 'user four', 'main No response requested. END', 'user five', 'main A long answer that was cut', 'user six', 'main Stopped by a safety check in the middle', 'main and it goes on.', 'user seven', 'main API Error: Connection lost mid-response.', 'main Back, and done. END']);
  } finally { stop(); }
});

test('compaction summaries, workflow agents, titles and a transcript rewritten in place', async () => {
  const dir = path.join(tmp, 'projects', '-w'), main = path.join(dir, 's.jsonl'), run = path.join(dir, 's', 'subagents', 'workflows', 'wf_run1'); fs.mkdirSync(run, { recursive: true });
  const wfAgent = (id, phase, recs) => { fs.writeFileSync(path.join(run, `agent-${id}.jsonl`), recs.map(line).join('')); fs.writeFileSync(path.join(run, `agent-${id}.meta.json`), JSON.stringify({ agentType: 'workflow-subagent', description: 'check ' + id, workflowPhase: phase })); };
  fs.writeFileSync(main, [typed(0, 'x'.repeat(70000)), said(1, 'NOT THE TITLE'), typed(2, 'This session is being continued. '.repeat(400), { isCompactSummary: true, isVisibleInTranscriptOnly: true }),
    used(3, 'toolu_wf', 'Workflow', { script: 'run()' }), result(4, 'toolu_wf', 'launched', { toolUseResult: { status: 'async_launched', runId: 'wf_run1' } }), said(5, 'Launched.', { stop: 'end_turn' })].map(line).join(''));
  wfAgent('w1', 'Review', [typed(6, 'Review the cart.'), used(7, 'toolu_w1', 'Bash', { command: 'ls' }), said(8, 'Cart is fine.')]); wfAgent('w2', 'Verify', [typed(6, 'Verify the login.'), said(9, 'Still looking.')]);
  fs.writeFileSync(path.join(run, 'journal.jsonl'), [{ type: 'launched' }, { type: 'started', agentId: 'w1', key: 'a', label: 'check w1', phase: 'Review' }, { type: 'started', agentId: 'w2', key: 'b', label: 'check w2', phase: 'Verify' }, { type: 'result', agentId: 'w1', key: 'a', result: { ok: true } }].map(line).join(''));
  const { port, stop } = await serve(), q = 'proj=-w&id=s', row = async (p) => JSON.parse((await get(port, p)).body).find((r) => r.proj === '-w');
  try {
    const tl = await load(port, q), by = (k) => tl.events.filter((e) => e.kind === k);
    assert.deepEqual(by('user').map((e) => e.text.length), [70000]);   // the summary is not something the human said
    assert.deepEqual(tl.agents.map((a) => [a.id, a.role, a.type, a.wf, a.phase]), [['main', 'Lead', 'main', undefined, undefined], ['w1', 'check w1', 'workflow-subagent', 'wf_run1', 'Review'], ['w2', 'check w2', 'workflow-subagent', 'wf_run1', 'Verify']]);   // journal.jsonl is not an agent
    assert.deepEqual(by('order').map((e) => [e.agent, e.to, e.bg, e.wf, e.toolId, e.text, e.title, e.k]), [['main', 'w1', true, 'wf_run1', 'toolu_wf', 'Review the cart.', 'check w1', 'o/w1'], ['main', 'w2', true, 'wf_run1', 'toolu_wf', 'Verify the login.', 'check w2', 'o/w2']]);
    assert.deepEqual(by('report').map((e) => [e.agent, e.to, e.text]), [['w1', 'main', 'Cart is fine.']]); assert.deepEqual(by('finish').map((e) => [e.agent, e.to, e.k]), [['w1', 'main', 'f/w1']]);   // the journal says w1 handed its result back; w2 is still at work
    assert.deepEqual(by('say').map((e) => [e.agent, e.text]), [['main', 'NOT THE TITLE'], ['main', 'Launched.'], ['w2', 'Still looking.']]);
    assert.equal((await get(port, '/api/media?proj=-w&id=s&agent=w1&tool=toolu_w1&n=0')).status, 404); assert.equal((await get(port, '/api/media?proj=-w&id=s&agent=nobody&tool=toolu_w1&n=0')).status, 404); assert.equal((await get(port, '/api/media?proj=-w&id=s&agent=main&tool=e&n=0')).status, 400);
    const b = await row('/api/board'); assert.equal(b.title, 'x'.repeat(90)); assert.equal(b.subTotal, 2); assert.equal((await row('/api/sessions')).agents, 2);   // the first prompt, cut off by the 64 KB read, and not the assistant's first line
    fs.appendFileSync(main, line({ type: 'ai-title', aiTitle: 'Named later' })); await wait(1300); assert.equal((await row('/api/board')).title, 'Named later');
    fs.appendFileSync(main, line({ type: 'custom-title', customTitle: 'Renamed by hand' }) + line({ type: 'ai-title', aiTitle: 'Named again' })); await wait(1300); assert.equal((await row('/api/board')).title, 'Renamed by hand');
    fs.appendFileSync(path.join(run, 'journal.jsonl'), line({ type: 'result', agentId: 'w2', key: 'b', result: 'done' })); await wait(280);   // only the journal changed: w2's last line becomes its report
    const d = await load(port, q + '&after=' + tl.seq + '&ep=' + tl.ep); assert.deepEqual(d.events.map((e) => [e.k, e.kind, e.agent]).sort(), [['f/w2', 'finish', 'w2'], [tl.events.find((e) => e.text === 'Still looking.').k, 'report', 'w2']]);
    const size = fs.statSync(main).size; fs.writeFileSync(main, [typed(0, 'a different conversation'), said(1, 'With other lines.'), said(2, 'x'.repeat(size + 5000), { stop: 'end_turn' })].map(line).join('')); await wait(280); assert.ok(fs.statSync(main).size > size);   // rewritten in place and longer than before: the bytes after the old length must not be read as a continuation
    assert.deepEqual(await load(port, q + '&after=' + d.seq + '&ep=' + d.ep), { resync: true });
    const again = await load(port, q); assert.notEqual(again.ep, tl.ep); assert.deepEqual(again.events.filter((e) => e.agent === 'main' || e.agent === 'user').filter((e) => e.kind !== 'order').map((e) => e.kind + (e.end ? ' end' : '')), ['user', 'say', 'say end']);
  } finally { stop(); }
});
test('no request stops the server; another site cannot read the settings', async () => {
  const dir = path.join(tmp, 'projects', '-l'); fs.mkdirSync(path.join(dir, 's', 'subagents'), { recursive: true }); fs.writeFileSync(path.join(dir, 's.jsonl'), line(typed(0, 'hello')));
  let links = true; try { fs.symlinkSync(path.join(dir, 'gone.jsonl'), path.join(dir, 'dead.jsonl')); fs.symlinkSync(path.join(dir, 'gone.jsonl'), path.join(dir, 's', 'subagents', 'agent-dead.jsonl')); } catch { links = false; }   // links that point nowhere (not allowed on every Windows account)
  const { port, stop } = await serve(), raw = (text) => new Promise((res, rej) => { const s = require('net').connect(port, '127.0.0.1', () => s.write(text)); let b = ''; s.on('data', (d) => { b += d; }); s.on('error', rej); s.on('close', () => res(b)); setTimeout(() => s.destroy(), 1500); });
  try {
    assert.match(await raw(`GET // HTTP/1.1\r\nHost: localhost:${port}\r\nConnection: close\r\n\r\n`), /^HTTP\/1\.1 400 /);   // used to be an exception outside any try: the process died
    for (const p of ['/%', '/..%2f..%2fetc/passwd', '/api/session?proj=%00&id=%ff', '/api/media', '/api/tts?text=hi&voice=' + 'x'.repeat(300), '/characters/%', '/packs/cats/..%2f..%2fserver.js']) assert.ok((await get(port, p)).status >= 400, p);
    for (const p of ['/api/sessions', '/api/projects', '/api/current', '/api/current?proj=-l', '/api/current?proj=..&id=..&sproj=..&sid=..', '/api/board', '/api/session?proj=-l&id=s']) assert.equal((await get(port, p)).status, 200, p + (links ? ' with a dangling link next to the transcripts' : ''));
    assert.deepEqual(JSON.parse((await get(port, '/api/sessions')).body).filter((r) => r.proj === '-l').map((r) => r.id), ['s']); assert.equal(JSON.parse((await get(port, '/api/current?proj=-l')).body).id, 's');
    assert.equal((await get(port, '/api/prefs.js', { 'sec-fetch-site': 'cross-site' })).status, 403); assert.equal((await get(port, '/api/prefs.js', { 'sec-fetch-site': 'same-site' })).status, 403);   // a <script src> on another site's page
    assert.equal((await get(port, '/api/prefs.js', { 'sec-fetch-site': 'same-origin' })).status, 200); assert.equal((await get(port, '/api/prefs.js')).status, 200);
    assert.equal((await get(port, '/')).status, 200);   // still there
  } finally { stop(); }
});
test('the reasoning before a line or a call rides on it when the transcript keeps its text', async () => {
  const at = (n) => `2026-01-01T00:00:0${n}Z`, asst = (n, id, content) => ({ type: 'assistant', timestamp: at(n), message: { id, content } });
  const recs = [{ type: 'user', timestamp: at(0), message: { role: 'user', content: 'why is it slow' } }, asst(1, 'm1', [{ type: 'thinking', thinking: 'The query scans the whole table.\nI should check the index.', signature: 's' }]), asst(2, 'm1', [{ type: 'tool_use', id: 'toolu_t1', name: 'Bash', input: { command: 'ls' } }]),
    asst(3, 'm2', [{ type: 'thinking', thinking: '', signature: 's' }]), asst(4, 'm2', [{ type: 'text', text: 'Found it.' }])];   // most of the time only the signature is kept: nothing to show
  const dir = path.join(tmp, 'projects', '-th'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 's3.jsonl'), recs.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const srv = require('../server.js').start(0); await new Promise((r) => srv.once('listening', r)); const port = srv.address().port;
  try {
    const ev = JSON.parse((await get(port, '/api/session?proj=-th&id=s3')).body).events.filter((e) => e.kind === 'tools' || e.kind === 'say');
    assert.deepEqual(ev.map((e) => [e.kind, e.th || null]), [['tools', 'The query scans the whole table.\nI should check the index.'], ['say', null]]);
  } finally { srv.close(); require('../server.js').shutdown(); }
});
// ---- a sub-agent the person named keeps its name; the stock types get a first name from the page; the list of voices does not hold the server up
test('own agent names: the name given at launch, or the person\'s own agent type; never a stock type', async () => {
  const dir = path.join(tmp, 'projects', '-n'), subs = path.join(dir, 's', 'subagents'); fs.mkdirSync(subs, { recursive: true });
  const kids = [['a1', 'code-reviewer', {}, 3], ['a2', 'general-purpose', {}, 4], ['a3', 'general-purpose', { name: 'Athena' }, 5], ['a4', 'code-reviewer', {}, 6], ['a5', 'my-plugin:db_migrator', {}, 7], ['a6', 'Explore', {}, 8]];
  fs.writeFileSync(path.join(dir, 's.jsonl'), [typed(0, 'review it'), ...kids.map(([id, type, extra, s]) => used(s, 'toolu_' + id, 'Agent', { prompt: 'Do ' + id, description: 'Task ' + id, subagent_type: type, ...extra }, { id: 'mN' }))].map(line).join(''));
  for (const [id, type, , s] of kids) {
    fs.writeFileSync(path.join(subs, `agent-${id}.jsonl`), [typed(s + 10, 'Do ' + id), said(s + 11, 'On it.')].map(line).join(''));
    fs.writeFileSync(path.join(subs, `agent-${id}.meta.json`), JSON.stringify({ agentType: type, description: 'Task ' + id, toolUseId: 'toolu_' + id }));
  }
  const { port, stop } = await serve();
  try {
    const tl = await load(port, 'proj=-n&id=s'), own = Object.fromEntries(tl.agents.map((a) => [a.id, a.own || null]));
    assert.deepEqual(own, { main: null, a1: 'Code Reviewer', a2: null, a3: 'Athena', a4: 'Code Reviewer 2', a5: 'Db Migrator', a6: null });
    assert.ok(!tl.events.some((e) => 'nm' in e), 'the launch name stays on the server side');
    const t0 = Date.now(), [v, h] = await Promise.all([get(port, '/api/voices'), get(port, '/api/health')]);
    assert.equal(v.status, 200); assert.equal(h.status, 200); assert.ok(Array.isArray(JSON.parse(v.body).voices)); assert.ok(Date.now() - t0 < 20000);
  } finally { stop(); }
});
test('a pack name that is not a pack is answered as such, whatever the word', async () => {
  const { port, stop } = await serve();
  try {
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'nope']) {
      const list = await get(port, '/api/characters?pack=' + name); assert.equal(list.status, 200, name); assert.deepEqual(JSON.parse(list.body).chars, [], name);
      assert.equal((await get(port, '/packs/' + name + '/a.png')).status, 404, name);
    }
    assert.ok(JSON.parse((await get(port, '/api/characters?pack=cats')).body).chars.length > 0);
    assert.deepEqual(JSON.parse((await get(port, '/api/packs')).body).map((p) => p.name), ['cats']);
  } finally { stop(); }
});
test('the list of sessions: a line that goes on with a tool call is not the end of the turn', async () => {
  const dir = path.join(tmp, 'projects', '-b'), f = path.join(dir, 's.jsonl'); fs.mkdirSync(dir, { recursive: true });
  const { port, stop } = await serve(), row = async (proj = '-b') => { await wait(1300); return JSON.parse((await get(port, '/api/board')).body).find((r) => r.proj === proj); }, state = async (proj) => (await row(proj)).state;   // the list is worked out at most once every 1.2 s
  try {
    fs.writeFileSync(f, [typed(0, 'Write the file'), said(1, 'I write it now.', { stop: 'tool_use' })].map(line).join('')); assert.equal(await state(), 'working');   // the call itself is written when it is whole, many seconds later for a long file
    fs.appendFileSync(f, line(used(2, 'toolu_w', 'Bash', { command: 'ls' })) + line(result(3, 'toolu_w', 'ok')) + line(said(4, 'It is written.', { stop: 'end_turn' }))); assert.equal(await state(), 'turn');
    fs.appendFileSync(f, line(typed(5, 'Thanks')) + line(said(6, 'A line that does not say why it stopped, in a session that does.'))); assert.equal(await state(), 'working');   // Claude Code up to 2.1.87 before a tool call: the call may still come
    const ago = (Date.now() - 60000) / 1000; fs.utimesSync(f, ago, ago); assert.equal(await state(), 'turn');   // none came for 45 s: that was its last word
    fs.appendFileSync(f, line(typed(7, 'Go on')) + line(used(8, 'toolu_x', 'Bash', { command: 'sleep 60' }))); assert.equal(await state(), 'working');
    fs.appendFileSync(f, line(typed(9, '[Request interrupted by user for tool use]'))); const cut = await row(); assert.equal(cut.state, 'turn'); assert.equal(cut.cut, 1);   // Esc: your turn there, and you know it
    fs.appendFileSync(f, line(typed(10, 'Again')) + line(said(11, 'Done.', { stop: 'end_turn' }))); const done = await row(); assert.equal(done.state, 'turn'); assert.equal(done.cut, undefined);
    fs.mkdirSync(path.join(tmp, 'projects', '-b2'), { recursive: true }); fs.writeFileSync(path.join(tmp, 'projects', '-b2', 's.jsonl'), [typed(0, 'Hello'), said(1, 'A session that never says why its messages stop.')].map(line).join('')); assert.equal(await state('-b2'), 'turn');   // as before
  } finally { stop(); }
});
test('a document a command names is a file of the session when it was written since that command: an export, a report a script made; not one it only read, listed or removed', async () => {
  const dir = path.join(tmp, 'projects', '-c'), work = path.join(tmp, 'work'), out = path.join(work, 'out'); fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(out, { recursive: true });
  const T = (s) => Date.parse(at(s)), touch = (f, s) => { fs.writeFileSync(f, 'x'); fs.utimesSync(f, T(s) / 1000, T(s) / 1000); }, here = (r) => ({ ...r, cwd: work });   // each record says in which folder the session was
  const pdf = path.join(out, 'report.pdf'), csv = path.join(out, 'q3 export.csv'), zip = path.join(work, 'site.zip'), old = path.join(work, 'notes.md'), gone = path.join(out, 'draft.pdf'), late = path.join(work, 'video.mp4');
  const page = path.join(work, 'index.html'); touch(pdf, 12); touch(csv, 12); touch(zip, 31); touch(old, -900); touch(late, 60); touch(page, 56);
  fs.writeFileSync(path.join(dir, 's.jsonl'), [typed(0, 'Make the report'),
    here(used(10, 'toolu_a', 'Bash', { command: 'cd out && python3 ../make.py --pdf=report.pdf --csv "q3 export.csv" && rm draft.pdf && cat ../notes.md && curl -o x https://example.org/a.pdf && ls *.png' })), here(result(13, 'toolu_a', 'done')),
    here(used(30, 'toolu_b', 'Bash', { command: 'npm run pack' })), here(result(32, 'toolu_b', 'Packed 12 files.\nSaved to ' + zip + '.\nSee also notes.md')),
    here(used(40, 'toolu_c', 'Bash', { command: 'node render.js video.mp4' })), here(result(41, 'toolu_c', 'failed', { })), here(used(50, 'toolu_d', 'Bash', { command: "cat <<'EOF' > list.txt\nother.pdf\nEOF" })), here(result(51, 'toolu_d', '')),
    here(used(53, 'toolu_g', 'Bash', { command: 'grep -n title index.html' })), here(result(54, 'toolu_g', '3: title')), here(used(55, 'toolu_e', 'Edit', { file_path: page, old_string: 'a', new_string: 'b' })), here(result(56, 'toolu_e', 'ok')),
    said(58, 'Done.', { stop: 'end_turn' })].map(line).join(''));
  const { port, stop } = await serve(), server = require('../server.js'), run = server._reveal.run, shown = []; server._reveal.run = (f) => shown.push(f);
  const ask = (file, check) => get(port, '/api/reveal', { 'content-type': 'application/json' }, 'POST', JSON.stringify({ proj: '-c', id: 's', file, ...(check ? { check: true } : {}) })).then((r) => r.status);
  try {
    const tools = (await load(port, 'proj=-c&id=s')).events.filter((e) => e.kind === 'tools').flatMap((e) => e.tools), res = (await load(port, 'proj=-c&id=s')).events.filter((e) => e.kind === 'results').flatMap((e) => e.items);
    assert.deepEqual(tools[0].d.outs, [pdf, csv, gone, old]);   // named from the folder the command went to; not the link, nor the pattern
    assert.deepEqual(res.map((i) => i.files), [undefined, [zip, old], undefined, undefined, undefined, undefined]); assert.deepEqual(tools[4].d.outs, [page]); assert.deepEqual(tools[2].d.outs, [late]); assert.deepEqual(tools[3].d.outs, [path.join(work, 'list.txt')]);   // what a here-document holds is not the command
    assert.equal(await ask(pdf, true), 200); assert.equal(await ask(csv, true), 200); assert.equal(await ask(zip, true), 200); assert.deepEqual(shown, [], 'asking whether it is there opens nothing');
    assert.equal(await ask(old, true), 404);    // read by a command, and written long before it
    assert.equal(await ask(page, true), 404);   // looked at by a command, then changed by hand: recent for that reason, and not made by the command
    assert.equal(await ask(gone, true), 410);   // removed by the command
    assert.equal(await ask(path.join(work, 'make.py'), true), 404); assert.equal(await ask(path.join(work, 'other.pdf'), true), 404); assert.equal(await ask('/etc/hosts', true), 404);
    assert.equal(await ask(pdf), 200); assert.deepEqual(shown, [pdf]); assert.equal(await ask(old), 404); assert.deepEqual(shown, [pdf]);
    fs.writeFileSync(path.join(dir, 'big.jsonl'), [typed(0, 'Build it'), here(used(1, 'toolu_1', 'Bash', { command: 'make 2>&1 | tee \\\\server\\share\\log.txt //host/share/b.pdf ' + 'x<<1|y<<2;'.repeat(1900) })), here(result(2, 'toolu_1', ('std::cout << a << b << "report.pdf";\n').repeat(500))),
      here(used(3, 'toolu_2', 'Bash', { command: "cat <<EOF > a.txt\nx.pdf\nEOF\ncat <<'END' >> b.md\ny.pdf" })), said(4, 'Done.', { stop: 'end_turn' })].map(line).join(''));
    const t0 = Date.now(), big = (await load(port, 'proj=-c&id=big')).events.filter((e) => e.kind === 'tools').flatMap((e) => e.tools); assert.ok(Date.now() - t0 < 1500, 'a text full of "<<" is read as fast as any other: ' + (Date.now() - t0) + ' ms');
    assert.equal(big[0].d.outs, undefined); assert.deepEqual(big[1].d.outs, [path.join(work, 'a.txt'), path.join(work, 'b.md')]);   // no path on another machine; two here-documents, the second one never closed
  } finally { server._reveal.run = run; stop(); }
});

test('a file the session created is shown in its folder; no other path is, and nothing is opened from another site', async () => {
  const dir = path.join(tmp, 'projects', '-r'), made = path.join(tmp, 'made'), doc = path.join(made, 'report.md'), lost = path.join(made, 'lost.md'), other = path.join(made, 'other.md'); fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(made, { recursive: true });
  fs.writeFileSync(doc, '# report'); fs.writeFileSync(other, 'read, never written');
  fs.writeFileSync(path.join(dir, 's.jsonl'), [typed(0, 'Write the report'), used(1, 'toolu_w1', 'Write', { file_path: doc, content: '# report' }), result(2, 'toolu_w1', 'ok'), used(3, 'toolu_w2', 'Write', { file_path: lost, content: 'x' }), result(4, 'toolu_w2', 'ok'),
    used(5, 'toolu_r', 'Read', { file_path: other }), result(6, 'toolu_r', 'x'), used(7, 'toolu_e', 'Edit', { file_path: other, old_string: 'a', new_string: 'b' }), result(8, 'toolu_e', 'ok'), said(9, 'Done.', { stop: 'end_turn' })].map(line).join(''));
  const { port, stop } = await serve(), server = require('../server.js'), run = server._reveal.run, shown = []; server._reveal.run = (f) => shown.push(f);
  const ask = (b, headers = {}) => get(port, '/api/reveal', { 'content-type': 'application/json', ...headers }, 'POST', typeof b === 'string' ? b : JSON.stringify(b));
  try {
    const ok = await ask({ proj: '-r', id: 's', file: doc }); assert.equal(ok.status, 200); assert.deepEqual(shown, [doc]);
    assert.equal((await ask({ proj: '-r', id: 's', file: lost })).status, 410);                    // created, then removed
    assert.equal((await ask({ proj: '-r', id: 's', file: other })).status, 404);                   // read and edited, not created by the session
    assert.equal((await ask({ proj: '-r', id: 's', file: '/etc/hosts' })).status, 404);
    assert.equal((await ask({ proj: '-r', id: 'nope', file: doc })).status, 404);
    assert.equal((await ask({ proj: '..', id: 's', file: doc })).status, 400);
    assert.equal((await ask({ proj: '-r', id: 's' })).status, 400); assert.equal((await ask('not json')).status, 400);
    assert.equal((await ask({ proj: '-r', id: 's', file: doc }, { 'sec-fetch-site': 'cross-site' })).status, 403);
    assert.equal((await ask({ proj: '-r', id: 's', file: doc }, { origin: 'https://example.com' })).status, 403);
    assert.equal((await get(port, '/api/reveal?proj=-r&id=s&file=' + encodeURIComponent(doc))).status, 404);   // a link cannot do it: POST only
    assert.deepEqual(shown, [doc]);
    assert.deepEqual(shown, [doc]);
    assert.deepEqual(server._reveal.cmds('/a/b c/report.md', 'darwin'), [['open', ['-R', '/a/b c/report.md']]]);
    assert.deepEqual(server._reveal.cmds('C:\\a b\\report.md', 'win32')[0].slice(0, 2), ['explorer.exe', ['/select,"C:\\a b\\report.md"']]);
    const linux = server._reveal.cmds('/a/b c/report.md', 'linux'); assert.equal(linux[0][0], 'dbus-send'); assert.ok(linux[0][1].includes('array:string:file:///a/b%20c/report.md')); assert.deepEqual(linux[1], ['xdg-open', ['/a/b c']]);
    assert.deepEqual(server._reveal.cmds('/a/x,y.md', 'linux'), [['xdg-open', ['/a']]]);
  } finally { server._reveal.run = run; stop(); }
});

test('the errors of the app are kept in a file on this computer: each one once, without the home folder or the address of the page; another site neither reads nor writes them', async () => {
  const server = require('../server.js'), file = path.join(tmp, 'errors.log'), read = () => { try { return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  const { port, stop } = await serve(), post = (body, headers = {}) => get(port, '/api/errors', { 'content-type': 'application/json', ...headers }, 'POST', body);
  try {
    const before = read().length, home = os.homedir(), e = new Error('cannot read ' + path.join(home, 'secret', 'notes.md'));
    e.stack = `Error: ${e.message}\n    at reader (${path.join(home, 'app', 'vibe.js')}:10:5)\n    at http://localhost:${port}/?live=1&proj=${home.replace(/[^a-zA-Z0-9]/g, '-')}-Documents-X:782:15`;
    server.logError('reader', e); server.logError('reader', e);   // the same error twice: one line
    const mine = read().slice(before); assert.equal(mine.length, 1); assert.equal(mine[0].where, 'reader'); assert.equal(mine[0].v, require('../package.json').version); assert.ok(!isNaN(Date.parse(mine[0].t)));
    assert.ok(!JSON.stringify(mine[0]).includes(home), 'the home folder is written ~'); assert.ok(!mine[0].stack.includes('proj='), 'the address of the page carries the project'); assert.match(mine[0].stack, /\nat page:782:15$/); assert.ok(!mine[0].stack.includes('cannot read'), 'the stack is the frames only');
    server.logError('reader', null); server.logError('reader', ''); assert.equal(read().length, before + 1);   // nothing to say: nothing written, and nothing thrown
    // an error of the page
    assert.equal((await post(JSON.stringify({ where: 'error', msg: 'paint is not a function', stack: `TypeError: paint is not a function\n    at step (http://localhost:${port}/?live=1&embed=1:900:3)` }))).status, 200);
    const rep = JSON.parse((await get(port, '/api/errors')).body), last = rep.errors[rep.errors.length - 1];
    assert.deepEqual([last.where, last.msg, last.stack], ['page error', 'paint is not a function', 'at step (page:900:3)']); assert.equal(rep.version, require('../package.json').version); assert.ok(rep.platform.startsWith(process.platform)); assert.equal(rep.node, process.version);
    assert.equal((await post('[not json')).status, 400); assert.equal((await post('{"msg":"from another site"}', { 'sec-fetch-site': 'cross-site' })).status, 403); assert.equal((await get(port, '/api/errors', { 'sec-fetch-site': 'cross-site' })).status, 403);
    assert.ok(!read().some((x) => x.msg === 'from another site'));
    // the home folder in every form it is written, on Windows too: a name with a space, the drive in the other case, "/" for "\", the path inside JSON, the folder of a Claude Code project
    const { tidy, homeRe } = server._scrub, win = homeRe('C:\\Users\\John Smith', true), w = (t) => tidy(t, 300, win);
    assert.equal(w('at f (c:\\Users\\John Smith\\.vscode\\extensions\\x\\server.js:1:2)'), 'at f (~\\.vscode\\extensions\\x\\server.js:1:2)'); assert.equal(w('C:/Users/John Smith/work/a.js'), '~/work/a.js');
    assert.equal(w('C:\\Users\\John Smith\\.claude\\projects\\c--Users-John-Smith-work-X\\a.jsonl'), '~\\.claude\\projects\\~-work-X\\a.jsonl'); assert.equal(w(JSON.stringify('C:\\Users\\John Smith\\a.js')), '"~\\\\a.js"');
    assert.equal(w('D:\\Users\\Some One Else\\a.js'), '~\\a.js'); assert.equal(tidy('tree-root in /rootfs --root-dir, file /root/a.js', 300, homeRe('/root', false)), 'tree-root in /rootfs --root-dir, file ~/a.js');   // someone else's home goes too; a home of a few letters is not found in every word
    assert.equal(tidy('Failed to load "http://localhost:4747/?live=1&proj=x" then http://[::1]:5000/?a=1:3:4', 300), 'Failed to load "page" then page:3:4');
    assert.equal(tidy('x'.repeat(299) + '😀', 300), 'x'.repeat(299)); assert.doesNotThrow(() => encodeURIComponent(tidy('x'.repeat(299) + '😀', 300)));   // a cut through an emoji leaves no half character: the link of the report could not carry it
  } finally { stop(); }
});
test('an artifact a session published is shown from the session file alone: each version as it was, in a frame that reaches neither the app nor the network', async () => {
  const fp = '/tmp/scratch/report.html', v1 = '<title>Report</title>\n<h1>Totals: $& "quoted" é</h1>\n<p>one</p>\n<p>one</p>', url = 'https://claude.ai/artifact/AbCdEf123456';
  let t = 0; const at = () => new Date(Date.UTC(2026, 0, 1, 0, 0, t++)).toISOString();
  const use = (id, name, input) => ({ type: 'assistant', timestamp: at(), message: { content: [{ type: 'tool_use', id, name, input }] } });
  const res = (id, content, extra = {}, err) => ({ type: 'user', timestamp: at(), message: { content: [{ type: 'tool_result', tool_use_id: id, content, ...(err ? { is_error: true } : {}) }] }, ...extra });
  const lines = [
    use('toolu_write1', 'Write', { file_path: fp, content: v1 }), res('toolu_write1', 'File created'),
    use('toolu_pub001', 'Artifact', { file_path: fp, icon: 'chart', description: 'The totals of the quarter.' }), res('toolu_pub001', 'Published at ' + url, { toolUseResult: { url, title: 'Report', artifact_id: 'x' } }),
    use('toolu_edit01', 'Edit', { file_path: fp, old_string: '<p>one</p>', new_string: '<p>two $1</p>' }), res('toolu_edit01', 'ok'),
    use('toolu_edit02', 'Edit', { file_path: fp, old_string: 'Totals', new_string: 'REFUSED' }), res('toolu_edit02', 'File has been modified since read', {}, true),
    use('toolu_edit03', 'MultiEdit', { file_path: fp, edits: [{ old_string: '<p>one</p>', new_string: '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1"></script>' }, { old_string: 'é', new_string: 'e', replace_all: true }] }), res('toolu_edit03', 'ok'),
    use('toolu_other1', 'Write', { file_path: '/tmp/scratch/other.html', content: '<p>another page</p>' }), res('toolu_other1', 'File created'),
    use('toolu_pub002', 'Artifact', { file_path: fp, url }), res('toolu_pub002', 'Updated', { toolUseResult: { url, title: 'Report', seq: 2, updated: true } }),
    use('toolu_edit04', 'Edit', { file_path: fp, old_string: 'Totals', new_string: 'LATER' }), res('toolu_edit04', 'ok'),
    use('toolu_typed1', 'Artifact', { type_url: 'https://claude.ai/artifact/TypeTypeType', title: 'Deck' }), res('toolu_typed1', 'Created', { toolUseResult: { created_from_type: true, url: 'https://claude.ai/artifact/DeckDeck1234', title: 'Deck' } }),
    use('toolu_nopage', 'Artifact', { file_path: '/tmp/scratch/built.html' }), res('toolu_nopage', 'Published', { toolUseResult: { url: 'https://claude.ai/artifact/BuiltBuilt12', title: 'Built by a script' } }),
    use('toolu_failed', 'Artifact', { file_path: '/tmp/scratch/other.html' }), res('toolu_failed', 'refused', { toolUseResult: 'Error: refused' }, true),
    use('toolu_asset1', 'Artifact', { url, asset: true, file_path: '/tmp/scratch/logo.png' }), res('toolu_asset1', 'Uploaded', { toolUseResult: { written: 1, asset_uploads: [] } }),
    use('toolu_read01', 'Artifact', { action: 'read', url }), res('toolu_read01', '<title>Report</title>', { toolUseResult: { file_read: true, url } }),
    use('toolu_evil01', 'Artifact', { file_path: fp }), res('toolu_evil01', 'Published', { toolUseResult: { url: 'https://claude.ai.example.com/artifact/AbCdEf123456', title: 'Elsewhere' } }),
  ];
  const dir = path.join(tmp, 'projects', '-art'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 's1.jsonl'), lines.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const srv = require('../server.js').start(0); await new Promise((r) => srv.once('listening', r)); const port = srv.address().port;
  const page = (q, headers = {}) => new Promise((ok, no) => http.get({ port, path: '/api/artifact?proj=-art&id=s1&' + q, headers }, (x) => { let b = ''; x.setEncoding('utf8'); x.on('data', (d) => { b += d; }); x.on('end', () => ok({ status: x.statusCode, body: b, csp: x.headers['content-security-policy'] || '', type: x.headers['content-type'] })); }).on('error', no));
  try {
    const ev = JSON.parse((await get(port, '/api/session?proj=-art&id=s1')).body).events, tools = ev.filter((e) => e.kind === 'tools').flatMap((e) => e.tools), items = ev.filter((e) => e.kind === 'results').flatMap((e) => e.items);
    assert.deepEqual(tools.filter((x) => x.d.kind === 'artifact').map((x) => x.id), ['toolu_pub001', 'toolu_pub002', 'toolu_typed1', 'toolu_nopage', 'toolu_failed', 'toolu_evil01']);   // a publish; not an upload, not a read
    assert.deepEqual(tools.find((x) => x.id === 'toolu_pub001').d, { kind: 'artifact', file: fp, title: '', note: 'The totals of the quarter.' });
    assert.deepEqual(items.filter((it) => it.art).map((it) => [it.id, it.art]), [['toolu_pub001', { url, title: 'Report' }], ['toolu_pub002', { url, title: 'Report', v: 2 }], ['toolu_typed1', { url: 'https://claude.ai/artifact/DeckDeck1234', title: 'Deck', typed: 1 }], ['toolu_nopage', { url: 'https://claude.ai/artifact/BuiltBuilt12', title: 'Built by a script' }]]);   // a link that is not claude.ai's is not shown
    const skel = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
    const one = await page('agent=main&tool=toolu_pub001'); assert.equal(one.status, 200); assert.equal(one.type, 'text/html; charset=utf-8'); assert.equal(one.body, skel + v1);   // the first version, as it was published
    const two = await page('agent=main&tool=toolu_pub002'); assert.equal(two.body, skel + '<title>Report</title>\n<h1>Totals: $& "quoted" e</h1>\n<p>two $1</p>\n<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1"></script>');   // the edits up to the second publish, one by one; not the one that was refused, nor the one that came after
    assert.match(one.csp, /^sandbox allow-scripts; default-src 'none';/); assert.ok(!/https?:|allow-same-origin|allow-popups|allow-forms|allow-top/.test(two.csp)); assert.match(two.csp, /connect-src 'none'/);   // nothing from the network unless asked
    const net = await page('agent=main&tool=toolu_pub002&net=1'); assert.match(net.csp, /script-src 'unsafe-inline' 'unsafe-eval' https:\/\/cdnjs\.cloudflare\.com https:\/\/cdn\.jsdelivr\.net /); assert.match(net.csp, /^sandbox allow-scripts;/); assert.match(net.csp, /connect-src 'none'; frame-src 'none'; form-action 'none'/); assert.ok(!/allow-same-origin/.test(net.csp));
    assert.deepEqual(JSON.parse((await page('agent=main&tool=toolu_pub001&check=1')).body), { ok: true, net: false }); assert.deepEqual(JSON.parse((await page('agent=main&tool=toolu_pub002&check=1')).body), { ok: true, net: true });
    for (const id of ['toolu_typed1', 'toolu_nopage', 'toolu_failed', 'toolu_asset1', 'toolu_read01', 'toolu_evil01', 'toolu_write1', 'toolu_nothere']) { assert.equal((await page('agent=main&tool=' + id)).status, 404, id); const c = await page('agent=main&tool=' + id + '&check=1'); assert.equal(c.status, 404); assert.deepEqual(JSON.parse(c.body), { ok: false }); }   // a template of claude.ai, a page no Write call made, a publish that failed, and what is not a publish
    assert.equal((await page('agent=a1&tool=toolu_pub001')).status, 404); assert.equal((await page('agent=..&tool=toolu_pub001')).status, 400); assert.equal((await page('agent=main&tool=x')).status, 400);
    assert.equal((await get(port, '/api/artifact?proj=..&id=s1&agent=main&tool=toolu_pub001')).status, 400); assert.equal((await get(port, '/api/artifact?proj=_codex&id=s1&agent=main&tool=toolu_pub001')).status, 404);
    assert.equal((await page('agent=main&tool=toolu_pub001', { 'sec-fetch-site': 'cross-site' })).status, 403); assert.equal((await page('agent=main&tool=toolu_pub001', { origin: 'null' })).status, 403);   // another site cannot have it; nor can the page itself, from inside its frame, ask the app for anything
  } finally { srv.close(); require('../server.js').shutdown(); }
});
test('the live call is in the session you last touched: the one you typed in, or the one you went to, until you type somewhere. What the agents write moves nothing', async () => {
  const dir = path.join(tmp, 'projects', '-follow'), f = (id) => path.join(dir, id + '.jsonl'), put = (id, ...recs) => fs.appendFileSync(f(id), recs.map(line).join('')), aged = (id, s) => { const t = (Date.now() - s * 1000) / 1000; fs.utimesSync(f(id), t, t); }; fs.mkdirSync(dir, { recursive: true });
  const { port, stop } = await serve(), cur = async (q = '') => { await wait(1300); return JSON.parse((await get(port, '/api/current?proj=-follow' + q)).body); }, from = (id) => '&sproj=-follow&sid=' + id, went = (id, since) => '&pproj=-follow&pid=' + id + (since == null ? '' : '&since=' + since);   // the list of sessions is worked out at most once every 1.2 s
  const bash = (s, id) => used(s, id, 'Bash', { command: 'npm test' }), T = (s) => Date.parse(at(s));
  try {
    put('a', typed(0, 'Build the page'), bash(1, 'toolu_a1')); assert.equal((await cur()).id, 'a');
    put('b', typed(10, 'Fix the test'), bash(11, 'toolu_b1')); assert.equal((await cur(from('a'))).id, 'b', 'a session is started: the call goes there');
    put('a', result(20, 'toolu_a1', 'ok'), bash(21, 'toolu_a2')); assert.equal((await cur(from('b'))).id, 'b', 'the other session writes: the call does not move');   // it went to the session written to last, and back
    assert.equal((await cur()).id, 'b', 'nor does a page that is just opened go to the one written to last');
    put('a', result(29, 'toolu_a2', 'ok'), typed(30, 'And the footer'), bash(31, 'toolu_a3')); assert.equal((await cur(from('b'))).id, 'a', 'an order in the other session: the call goes there');
    const there = await cur(went('b')); assert.deepEqual([there.id, there.pick, there.asked], ['b', 1, T(30)], 'a session you go to by hand: the call is kept there, and the answer says what the latest order was');
    put('a', result(35, 'toolu_a3', 'ok'), bash(36, 'toolu_a4')); assert.deepEqual([(await cur(went('b', there.asked))).id, (await cur(went('b', there.asked) + from('b'))).pick], ['b', 1], 'kept there while the agents write');
    put('a', result(39, 'toolu_a4', 'ok'), typed(40, 'One more thing'), bash(41, 'toolu_a5')); const back = await cur(went('b', there.asked) + from('b')); assert.deepEqual([back.id, back.pick, back.asked], ['a', undefined, T(40)], 'until you type somewhere');
    put('b', result(50, 'toolu_b1', 'ok'), typed(51, '<task-notification>\n<task-id>x</task-id>\n<status>completed</status>\n</task-notification>'), typed(52, 'What a skill says', { isMeta: true }), typed(53, 'This session is being continued', { isCompactSummary: true }), typed(54, '[Request interrupted by user]'), typed(55, '<system-reminder>\nKeep going.\n</system-reminder>'));
    assert.equal((await cur(from('a'))).id, 'a', 'what the harness writes as a user record is not an order: the result of a tool, a task that ended, a skill, a summary, Esc, a reminder');
    put('b', typed(60, '<command-message>review</command-message>\n<command-name>/review</command-name>'), bash(61, 'toolu_b2')); assert.equal((await cur(from('a'))).id, 'b', 'a slash command is one');
    put('a', { type: 'attachment', timestamp: at(70), attachment: { type: 'queued_command', prompt: [{ type: 'text', text: 'While you are at it' }], origin: { kind: 'human' }, commandMode: 'prompt' } }); assert.equal((await cur(from('b'))).id, 'a', 'and so is an order typed while the lead works');
    put('a', { type: 'attachment', timestamp: at(71), attachment: { type: 'queued_command', prompt: '<task-notification>x</task-notification>', origin: { kind: 'task' }, commandMode: 'task-notification' } }, result(79, 'toolu_a5', 'ok'), said(80, 'All done.', { stop: 'end_turn' }));
    await wait(1300); const rows = JSON.parse((await get(port, '/api/board')).body).filter((r) => r.proj === '-follow'); assert.deepEqual(rows.map((r) => [r.id, r.state, r.asked]).sort(), [['a', 'turn', T(70)], ['b', 'working', T(60)]]);
    assert.equal((await cur(from('a'))).id, 'a', 'its turn is over: the call does not leave at once');
    aged('a', 120); assert.equal((await cur(from('a'))).id, 'b', 'finished and quiet for a minute and a half while another session works: the call goes to that one');
    assert.equal((await cur(went('a', T(70)) + from('a'))).id, 'a', 'not when you went there by hand');
    put('b', result(90, 'toolu_b2', 'ok'), said(91, 'Reviewed.', { stop: 'end_turn' })); aged('b', 100); aged('a', 200);
    assert.deepEqual([(await cur(from('a'))).id, (await cur(from('b'))).id, (await cur()).id], ['a', 'b', 'b'], 'nobody is at work: the call stays where it is, and a page that is just opened goes to the session written to last');
    assert.equal((await cur(went('gone', 0) + from('a'))).id, 'a', 'a session that is gone keeps nothing');
    const far = path.join(tmp, 'projects', '-follow2'); fs.mkdirSync(far, { recursive: true });
    fs.writeFileSync(path.join(far, 's.jsonl'), [typed(5, 'Read the whole log'), bash(6, 'toolu_f1'), result(7, 'toolu_f1', 'x'.repeat(300 * 1024)), said(8, 'Still reading.')].map(line).join(''));   // the order is further back than the 192 KB the list reads
    await wait(1300); assert.equal(JSON.parse((await get(port, '/api/board')).body).find((r) => r.proj === '-follow2').asked, T(5), 'an order far back in a long turn is found on the first look');
  } finally { stop(); }
});
test('a sub-agent that hands its report back through SubagentHandback says that report, not the sentence it opened with', async () => {
  const dir = path.join(tmp, 'projects', '-hb'), sub = path.join(dir, 's', 'subagents', 'agent-a1.jsonl'); fs.mkdirSync(path.dirname(sub), { recursive: true });
  fs.writeFileSync(path.join(dir, 's.jsonl'), [typed(0, 'order'), used(1, 'toolu_ag', 'Agent', { prompt: 'Write the notes.', description: 'Writer', run_in_background: true }), result(2, 'toolu_ag', 'Async agent launched successfully.'),
    { type: 'queue-operation', operation: 'enqueue', timestamp: at(9), content: '<task-notification>\n<tool-use-id>toolu_ag</tool-use-id>\n<status>completed</status>\n</task-notification>' }].map(line).join(''));
  fs.writeFileSync(path.join(dir, 's', 'subagents', 'agent-a1.meta.json'), JSON.stringify({ agentType: 'general-purpose', description: 'Writer', toolUseId: 'toolu_ag' }));
  fs.writeFileSync(sub, [typed(3, 'Write the notes.'), said(4, 'I am reading the changelog.'), used(5, 'toolu_b', 'Bash', { command: 'ls' }), result(6, 'toolu_b', 'ok'),
    used(7, 'toolu_hb', 'SubagentHandback', { message: 'The notes are written: six changes.' }), result(8, 'toolu_hb', '{"success":true,"message":"Report delivered to your caller."}')].map(line).join(''));   // Claude Code 2.1.293 and later: no last sentence, the report is the message of the call
  const { port, stop } = await serve();
  try {
    const ev = (await load(port, 'proj=-hb&id=s')).events, of = (k) => ev.filter((e) => e.agent === 'a1' && e.kind === k);
    assert.deepEqual(of('report').map((e) => e.text), ['The notes are written: six changes.']);
    assert.deepEqual(of('say').map((e) => e.text), ['I am reading the changelog.'], 'the sentence it opened with stays an ordinary line');
    assert.ok(!/Handback|Report delivered/.test(JSON.stringify(ev.filter((e) => e.kind === 'tools' || e.kind === 'results'))), 'the call is not shown as a tool, nor its answer as an output');
  } finally { stop(); }
});

test('the call is translated into the language the page asks for: French when it says nothing, Spanish and Brazilian Portuguese by name', { skip: process.platform === 'win32' }, async () => {
  const key = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY;   // with a key the server would call the real API
  const srv = require('../server.js').start(0); await new Promise((r) => srv.once('listening', r)); const port = srv.address().port;
  const post = async (p, body) => JSON.parse((await get(port, p, {}, 'POST', JSON.stringify(body))).body), line = 'I fixed server.js.';
  try {
    assert.deepEqual(await post('/api/translate', { texts: [line], lang: 'es' }), { texts: ['Spanish|' + line], ok: true });
    assert.deepEqual(await post('/api/translate', { texts: [line], lang: 'pt' }), { texts: ['Brazilian Portuguese|' + line], ok: true }, 'the same line in another language is not taken from what was kept for Spanish, and the worker changes language');
    assert.deepEqual((await post('/api/translate', { texts: [line] })).texts, ['French|' + line], 'a page that names no language gets French, as before');
    assert.deepEqual((await post('/api/translate', { texts: [line], lang: 'de' })).texts, ['French|' + line], 'a language the call cannot be held in is not passed to the prompt');
    const many = ['One.', 'Two.', 'Three.', 'Four.', line]; assert.deepEqual(await post('/api/translate', { texts: many, lang: 'es' }), { texts: many.map((t) => 'Spanish|' + t), ok: true }, 'more than three lines go in one batch, in the same language');
    assert.deepEqual((await post('/api/quips', { texts: ['Report A.'], lang: 'pt' })).texts, ['Brazilian Portuguese|Report A.']); assert.deepEqual((await post('/api/quips', { texts: ['Report A.'], lang: 'ja' })).texts, ['English|Report A.']);
  } finally { srv.close(); require('../server.js').shutdown(); if (key) process.env.ANTHROPIC_API_KEY = key; }
});
