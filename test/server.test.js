// test/server.test.js: the settings file, session stickiness and the cross-site guard, against a real server on a free port
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'as-test-'));
process.env.AGENT_STANDUP_PREFS = path.join(tmp, 'prefs.json'); process.env.AGENT_STANDUP_KOKORO_DIR = path.join(tmp, 'kokoro'); process.env.AGENT_STANDUP_PROJECTS = path.join(tmp, 'projects');
const get = (port, p, headers = {}, method = 'GET', body) => new Promise((res, rej) => { const r = http.request({ port, path: p, method, headers }, (x) => { let b = ''; x.on('data', (d) => (b += d)); x.on('end', () => res({ status: x.statusCode, body: b })); }); r.on('error', rej); if (body) r.write(body); r.end(); });
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
