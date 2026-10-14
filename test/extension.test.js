// test/extension.test.js: the VS Code extension against a stand-in for the vscode module. What it registers, and the call going to the Claude Code tab you go to:
// VS Code tells a tab's label, not its session, so the label is looked up among the titles of the recent sessions.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), Module = require('module');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'as-ext-'));
process.env.AGENT_STANDUP_PREFS = path.join(tmp, 'prefs.json'); process.env.AGENT_STANDUP_KOKORO_DIR = path.join(tmp, 'kokoro'); process.env.AGENT_STANDUP_PROJECTS = path.join(tmp, 'projects'); process.env.AGENT_STANDUP_CODEX = 'off'; process.env.AGENT_STANDUP_VIBE = 'off';

// ---- sessions with a title, the way Claude Code writes one ----
function titled(proj, id, title, minutesAgo) {
  const dir = path.join(tmp, 'projects', proj), file = path.join(dir, id + '.jsonl'), at = Date.now() - minutesAgo * 60000; fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, [{ type: 'user', message: { role: 'user', content: 'hello' } }, { type: 'assistant', message: { id: 'm1', role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Ready.' }] } }, { type: 'custom-title', customTitle: title }].map((r) => JSON.stringify({ timestamp: new Date(at).toISOString(), ...r })).join('\n') + '\n');
  fs.utimesSync(file, at / 1000, at / 1000);
}
titled('-work-app', 'long', 'Fix the login page and its tests', 5); titled('-work-app', 'short', 'Short title', 9); titled('-work-app', 'spaced', 'Two  spaces\tand a tab in the title', 12);
titled('-other', 'twin', 'Fix the login page and its tests', 1); titled('-other', 'away', 'Only in another folder', 3); titled('-work-app', 'lastweek', 'A conversation of last week', 6 * 24 * 60);   // twin: the same title in another folder, and more recent. All of them are there before the extension first looks: it keeps what it read for a moment
// ---- VS Code, as much of it as the extension touches ----
function standIn({ tabGroups = true } = {}) {
  const v = { cmds: {}, provider: null, sent: [], tabs: [], groups: [], panels: 0, errors: [], active: null, opened: [], relay: null };
  const webview = (where) => ({ options: {}, html: '', onDidReceiveMessage: (f) => { v.relay = f; return { dispose() {} }; }, postMessage: (m) => { v.sent.push({ where, ...m }); return Promise.resolve(true); } });
  const settings = { port: 0, statusBar: true, onlyThisWorkspace: true, autoOpen: false, claudePath: '', charactersPath: '', shareUsage: false };
  v.vscode = {
    workspace: { getConfiguration: () => ({ get: (k) => settings[k] }), workspaceFolders: [{ uri: { fsPath: '/work/app' } }], onDidChangeConfiguration: () => ({ dispose() {} }) },
    commands: { registerCommand: (n, f) => { v.cmds[n] = f; return { dispose() {} }; }, executeCommand: async () => {} },
    window: { state: { focused: true }, showErrorMessage: (m) => v.errors.push(m), showInformationMessage: () => {}, onDidChangeWindowState: () => ({ dispose() {} }),
      registerWebviewViewProvider: (id, p) => { v.provider = p; return { dispose() {} }; },
      createWebviewPanel: () => { v.panels++; return { webview: (v.panel = webview('panel')), reveal() {}, onDidDispose() {} }; },
      createStatusBarItem: () => ({ show() {}, dispose() {}, text: '', tooltip: '' }),
      ...(tabGroups ? { tabGroups: { get activeTabGroup() { return v.active; }, onDidChangeTabs: (f) => { v.tabs.push(f); return { dispose() {} }; }, onDidChangeTabGroups: (f) => { v.groups.push(f); return { dispose() {} }; } } } : {}) },
    env: { isTelemetryEnabled: false, asExternalUri: async (u) => u, openExternal: async (u) => { v.opened.push(u); return true; } },
    Uri: { parse: (s) => ({ toString: () => s }), file: (s) => ({ fsPath: s, toString: () => 'file://' + s }) },
    ViewColumn: { Beside: -2 }, StatusBarAlignment: { Right: 2 }, ThemeColor: class { constructor(id) { this.id = id; } },
  };
  v.go = (tab, column = 1) => { v.active = tab === undefined ? null : { viewColumn: column, activeTab: tab }; const n = v.sent.length; for (const f of v.tabs) f({}); return v.sent.slice(n); };   // you go to this tab: what the call is sent
  return v;
}
const claude = (label) => ({ label, input: { viewType: 'mainThreadWebview-claudeVSCodePanel' } });
async function activated(v, first) {   // a fresh copy of the extension for each stand-in: it keeps its panel and its last tab to itself. first: the session the status bar opens the call on
  const load = Module._load; Module._load = function (req, ...a) { return req === 'vscode' ? v.vscode : load.call(this, req, ...a); };
  const file = require.resolve('../extension.js'); delete require.cache[file]; const ext = require(file), ctx = { subscriptions: [], globalState: { get() {}, update: async () => {} } };
  const log = console.log; console.log = () => {};
  try { ext.activate(ctx); await v.cmds['agentStandup.open'](first); await v.provider.resolveWebviewView({ webview: (v.side = { options: {}, html: '', onDidReceiveMessage: () => ({ dispose() {} }), postMessage: (m) => { v.sent.push({ where: 'side', ...m }); return Promise.resolve(true); } }), onDidDispose() {} }); } finally { console.log = log; Module._load = load; }
  return { ext, close: async () => { for (const s of ctx.subscriptions) try { s.dispose && s.dispose(); } catch {} await ext.deactivate(); } };
}

test('the extension registers its commands, its panel and its sidebar view, also on a VS Code that has no tab groups', async () => {
  const v = standIn({ tabGroups: false }), x = await activated(v);
  try {
    assert.deepEqual(Object.keys(v.cmds).sort(), ['agentStandup.focus', 'agentStandup.open', 'agentStandup.openCharacters', 'agentStandup.openInBrowser', 'agentStandup.openStatus']);
    assert.equal(v.panels, 1); assert.match(v.side.html, /<iframe src="http:\/\/localhost:\d+\/\?live=1&proj=-work-app&embed=1"/); assert.deepEqual(v.errors, []);
  } finally { await x.close(); }
});

test('the status bar opens the call on a session without changing the folder the window follows: a Vibe session is kept under its tool, which is not a folder', async () => {
  const v = standIn(), x = await activated(v, { id: 'abc-123', proj: '_vibe' });
  try {
    assert.match(v.panel.html, /<iframe src="http:\/\/localhost:\d+\/\?live=1&proj=-work-app&pin=abc-123&pproj=_vibe&embed=1"/);   // proj used to be _vibe here: the window then showed Vibe sessions only, also once the call was let go
    assert.match(v.side.html, /\?live=1&proj=-work-app&embed=1"/);
  } finally { await x.close(); }
});

test('the call is sent to the Claude Code tab you go to: found by its title, whole or cut, this workspace first; no other tab moves it, and the same tab only once', async () => {
  const v = standIn(), x = await activated(v), to = (id, proj) => ['panel', 'side'].map((where) => ({ where, agentStandup: 'pin', id, proj, tab: true }));
  try {
    assert.equal(v.tabs.length, 1); assert.equal(v.groups.length, 1);
    assert.deepEqual(v.go({ label: 'server.js', input: { uri: {} } }), [], 'a file');
    assert.deepEqual(v.go({ label: 'Agent Standup', input: { viewType: 'mainThreadWebview-agentStandup' } }), [], 'the call itself');
    assert.deepEqual(v.go({ label: 'Welcome' }), [], 'a tab that says nothing of what it shows'); assert.deepEqual(v.go(undefined), [], 'no tab at all');
    assert.deepEqual(v.go(claude('Claude Code')), [], 'a conversation that has no title yet');
    assert.deepEqual(v.go(claude('No session has this title')), [], 'a title no recent session has');
    assert.deepEqual(v.go(claude('Short title')), to('short', '-work-app'), 'a whole title: the panel and the sidebar view are both told');
    assert.deepEqual(v.go(claude('Short title')), [], 'the same tab again: the call may have been moved by hand since');
    assert.deepEqual(v.go(claude('Short')), [], 'a whole label is a whole title, not the start of one');
    assert.deepEqual(v.go(claude('Fix the login page and i…')), to('long', '-work-app'), 'a title cut after 24 characters: this workspace before a more recent session elsewhere');
    assert.deepEqual(v.go(claude('Two spaces and a tab in …')), to('spaced', '-work-app'), 'spaces are told apart by neither side');
    assert.deepEqual(v.go(claude('Only in another folder')), to('away', '-other'), 'a session of another folder, when this workspace has none by that title');
    assert.deepEqual(v.go(claude('Short title'), 2), to('short', '-work-app'), 'the same title in another column is another tab');
    assert.equal(require('../server.js').boardRows().some((r) => r.id === 'lastweek'), false); assert.deepEqual(v.go(claude('A conversation of last w…')), to('lastweek', '-work-app'), 'a conversation of another day is no longer among the sessions of the moment: it is found in the whole list');
    v.active = null; assert.doesNotThrow(() => v.groups[0]({}));
  } finally { await x.close(); }
});

test('a link the page asks for is opened on a known site only; the draft of a problem report is handed over as text, so that its query arrives whole', async () => {
  const v = standIn(), x = await activated(v), ask = (url) => v.relay({ agentStandup: 'openExternal', url });
  try {
    const draft = 'https://github.com/Atoll92/agent-standup/issues/new?title=a%20%26%20b&body=line%0A%23%20one', coffee = 'https://www.buymeacoffee.com/bored_dev_and_his_robots';
    ask(draft); ask(coffee); ask('https://example.com/?x=1'); ask('http://github.com/Atoll92/agent-standup/issues/new?title=a'); ask('not a link');
    assert.equal(v.opened.length, 2); assert.equal(v.opened[0], draft);   // as text: given as a Uri, VS Code decodes and re-encodes the query, and "&" or "#" cut the draft
    assert.equal(typeof v.opened[1], 'object'); assert.equal(v.opened[1].toString(), coffee);
    const pay = 'https://checkout.stripe.com/c/pay/cs_test_a1B2#fidkdWxOYHwnPyd1blpxYHZxWjA0'; ask(pay); ask('https://checkout.stripe.com.example.com/c/pay/cs_test_a1B2');   // the payment page of a pack: Stripe's own address only, and with its fragment whole
    assert.equal(v.opened.length, 3); assert.equal(v.opened[2], pay);
    const art = 'https://claude.ai/artifact/AbCdEf123456'; ask(art); ask('https://claude.ai/code/artifact/0f81abdd-8134-4fc0-889a-28c4fe7dbb8f'); ask('https://claude.ai/settings'); ask('https://claude.ai.example.com/artifact/AbCdEf123456'); ask('https://claude.ai/artifact/../settings');   // an artifact the call shows: that page of claude.ai, and no other
    assert.equal(v.opened.length, 5); assert.equal(v.opened[3].toString(), art);
  } finally { await x.close(); }
});
