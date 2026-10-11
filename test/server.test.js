// test/server.test.js: the settings file, session stickiness, the cross-site guard and the pictures of a session, against a real server on a free port
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'as-test-'));
process.env.AGENT_STANDUP_PREFS = path.join(tmp, 'prefs.json'); process.env.AGENT_STANDUP_KOKORO_DIR = path.join(tmp, 'kokoro'); process.env.AGENT_STANDUP_PROJECTS = path.join(tmp, 'projects');
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
