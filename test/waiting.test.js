// test/waiting.test.js: a session that waits on you, read from its transcript and from the status Claude Code keeps in <config>/sessions/<pid>.json. A Bash approval shows only there;
// since when it has waited, apart from how long it worked before; a status file whose process has ended says nothing.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'as-waiting-')), PROJECTS = path.join(tmp, 'projects'), SESSIONS = path.join(tmp, 'sessions');
Object.assign(process.env, { AGENT_STANDUP_PREFS: path.join(tmp, 'prefs.json'), AGENT_STANDUP_KOKORO_DIR: path.join(tmp, 'kokoro'), AGENT_STANDUP_PROJECTS: PROJECTS, AGENT_STANDUP_CC_SESSIONS: SESSIONS });
fs.mkdirSync(SESSIONS, { recursive: true });

const now = Date.now(), iso = (ago) => new Date(now - ago).toISOString(), id = (n) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const user = (text, ago) => ({ type: 'user', timestamp: iso(ago), message: { role: 'user', content: text } }), say = (text, ago) => ({ type: 'assistant', timestamp: iso(ago), message: { role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text }] } });
const call = (name, input, ago) => ({ type: 'assistant', timestamp: iso(ago), message: { role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'toolu_' + name + ago, name, input }] } });
const file = (n) => path.join(PROJECTS, '-work-shop', id(n) + '.jsonl'), put = (n, recs, ago) => { fs.mkdirSync(path.dirname(file(n)), { recursive: true }); fs.writeFileSync(file(n), recs.map((r) => JSON.stringify(r)).join('\n') + '\n'); const t = new Date(now - ago); fs.utimesSync(file(n), t, t); };
const status = (k, n, pid, st, ago) => fs.writeFileSync(path.join(SESSIONS, k + '.json'), JSON.stringify({ pid, sessionId: id(n), status: st, statusUpdatedAt: now - ago, updatedAt: now - ago }));
const gone = spawnSync(process.execPath, ['-e', '0']).pid;   // a process that has ended: its file is left behind, as after a crash

const MENU = 1, STALE = 2, BUSY = 3, LONG = 4, TURN = 5, GUESS = 6;
put(MENU, [user('Build it', 300e3), call('Bash', { command: 'npm run build\n  --prod' }, 40e3)], 40e3); status(101, MENU, process.pid, 'waiting', 35e3);
put(STALE, [user('Migrate', 90e3), call('Bash', { command: 'npm run migrate' }, 20e3)], 20e3); status(102, STALE, gone, 'waiting', 20e3);
put(BUSY, [user('Test', 90e3), call('Bash', { command: 'npm test' }, 20e3)], 20e3); status(103, BUSY, process.pid, 'busy', 20e3);
put(LONG, [user('Deploy', 3000e3), call('Bash', { command: './deploy.sh' }, 2700e3)], 2700e3); status(104, LONG, process.pid, 'waiting', 2690e3);
put(TURN, [user('Release notes', 900e3), say('Here are the notes.', 600e3)], 600e3);
put(GUESS, [user('Fix the header', 100e3), call('Edit', { file_path: '/work/shop/src/header.js', old_string: 'a', new_string: 'b' }, 20e3)], 20e3);

test('a Bash approval needs you, with the command, since the menu opened, apart from the time it worked', () => {
  const core = require('../server.js'), rows = core.boardRows(), row = (n) => rows.find((r) => r.id === id(n));
  assert.equal(row(MENU).state, 'blocked'); assert.equal(row(MENU).tool, 'Bash'); assert.equal(row(MENU).ask, 'Bash(npm run build --prod)');   // on one line, the way Claude Code shows it
  assert.equal(row(MENU).since, now - 35e3); assert.equal(row(MENU).ran, 265e3);   // from the order to the menu
  assert.equal(row(LONG).state, 'blocked'); assert.equal(row(LONG).since, now - 2690e3);   // a menu left open for 45 minutes still waits: it is not "idle"
  assert.equal(row(STALE).state, 'working'); assert.equal(row(STALE).ask, undefined);   // the process is gone: its file says nothing
  assert.equal(row(BUSY).state, 'working'); assert.equal(row(BUSY).since, undefined);   // a command that runs is not a question
  assert.equal(row(TURN).state, 'turn'); assert.equal(row(TURN).since, now - 600e3); assert.equal(row(TURN).ran, 300e3);
  assert.equal(row(GUESS).state, 'blocked'); assert.equal(row(GUESS).ask, 'Edit(header.js)'); assert.equal(row(GUESS).since, now - 20e3);   // no status file: still the guess from a file edit left pending
  core.shutdown();
});
