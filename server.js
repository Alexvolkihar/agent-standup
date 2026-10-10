#!/usr/bin/env node
// Agent Standup: turns Claude Code session transcripts into a replayable "team call" timeline.
// No dependencies. Run: node server.js  → http://localhost:4747
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const PORT = process.env.PORT || 4747;
const ROOT = path.join(os.homedir(), '.claude', 'projects');
const PUBLIC = path.join(__dirname, 'public');

const readJsonl = (file) => {
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    try { out.push(JSON.parse(line)); } catch {}
  }
  return out;
};
const blocks = (rec) => {
  const c = rec.message && rec.message.content;
  if (typeof c === 'string') return [{ type: 'text', text: c }];
  return Array.isArray(c) ? c : [];
};
const clip = (x, n = 700) => String(x == null ? '' : x).slice(0, n);
// What each tool call looks like on a screen ("d"), plus its id/timestamp so the result can be matched later.
const toolLabel = (b, ts) => {
  const i = b.input || {};
  const arg = i.file_path || i.path || i.pattern || i.command || i.url || i.query || i.description || '';
  const out = { id: b.id, ts, name: b.name, arg: String(arg).slice(0, 90) };
  switch (b.name) {
    case 'Bash': out.d = { kind: 'cmd', text: clip(i.command, 1200), note: clip(i.description, 140) }; break;
    case 'Read': out.d = { kind: 'read', file: i.file_path, offset: i.offset, limit: i.limit }; break;
    case 'Edit': case 'MultiEdit': { const e = i.edits ? i.edits[0] || {} : i; out.d = { kind: 'edit', file: i.file_path, old: clip(e.old_string, 500), new: clip(e.new_string, 500) }; break; }
    case 'Write': out.d = { kind: 'write', file: i.file_path, text: clip(i.content, 800) }; break;
    case 'Grep': out.d = { kind: 'grep', pattern: clip(i.pattern, 100), path: i.path, glob: i.glob }; break;
    case 'Glob': out.d = { kind: 'glob', pattern: clip(i.pattern, 100), path: i.path }; break;
    case 'TodoWrite': out.d = { kind: 'todo', items: (i.todos || []).slice(0, 20).map((x) => ({ c: clip(x.content, 120), s: x.status })) }; break;
    case 'WebFetch': out.d = { kind: 'web', url: i.url }; break;
    case 'WebSearch': out.d = { kind: 'web', query: i.query }; break;
    default: out.d = { kind: 'text', text: clip(JSON.stringify(i), 300) };
  }
  return out;
};
const resultText = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => x.text || '').join('\n') : '');
const RESULT_MAX = { Read: 1900, Bash: 1300, Grep: 900, Glob: 800, WebFetch: 800, WebSearch: 800, Edit: 200, MultiEdit: 200, Write: 200 };
const NO_RESULT = new Set(['Agent', 'Task', 'SendMessage', 'TodoWrite']);   // internal bookkeeping, nothing to show

function listSessions() {
  const rows = [];
  if (!fs.existsSync(ROOT)) return rows;
  for (const proj of fs.readdirSync(ROOT)) {
    const dir = path.join(ROOT, proj);
    let files;
    try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')); } catch { continue; }
    for (const f of files) {
      const id = f.replace(/\.jsonl$/, '');
      const st = fs.statSync(path.join(dir, f));
      const subDir = path.join(dir, id, 'subagents');
      const agents = fs.existsSync(subDir) ? fs.readdirSync(subDir).filter((x) => x.endsWith('.jsonl')).length : 0;
      rows.push({ proj, id, mtime: st.mtimeMs, size: st.size, agents });
    }
  }
  rows.sort((a, b) => b.mtime - a.mtime);
  const top = rows.slice(0, 60);
  for (const r of top) {
    // cheap title: last ai-title record, else first user text
    const text = fs.readFileSync(path.join(ROOT, r.proj, r.id + '.jsonl'), 'utf8');
    const m = [...text.matchAll(/"type":"ai-title","aiTitle":"((?:[^"\\]|\\.)*)"/g)].pop();
    r.title = m ? JSON.parse('"' + m[1] + '"') : null;
    if (!r.title) {
      const u = text.match(/"role":"user","content":"((?:[^"\\]|\\.)*)"/);
      r.title = u ? JSON.parse('"' + u[1] + '"').slice(0, 80) : r.id;
    }
    r.project = r.proj.replace(/^-Users-[^-]+-/, '').replace(/-/g, '/');
  }
  return top;
}

function stamp(proj, id) {
  const base = path.join(ROOT, proj); let n = 0;
  const add = (f) => { try { const s = fs.statSync(f); n += s.mtimeMs + s.size; } catch {} };
  add(path.join(base, id + '.jsonl'));
  const sd = path.join(base, id, 'subagents');
  if (fs.existsSync(sd)) for (const f of fs.readdirSync(sd)) add(path.join(sd, f));
  return n;
}
const tlCache = new Map();
function timeline(proj, id) {
  const key = proj + '/' + id, st = stamp(proj, id), hit = tlCache.get(key), now = Date.now();
  if (hit && hit.st === st) return hit.tl;
  if (hit && now - hit.at < Math.max(400, hit.ms * 2)) return hit.tl;   // big sessions: rebuild at most every ~2× the build time instead of on every poll
  const t0 = Date.now(), tl = buildTimeline(proj, id); tlCache.set(key, { st, tl, at: Date.now(), ms: Date.now() - t0 }); return tl;
}
// Most recently active session (optionally limited to one project dir) — drives the live feed.
function currentSession(projFilter) {
  let best = null;
  if (!fs.existsSync(ROOT)) return {};
  const consider = (proj, id, m) => { if (!best || m > best.mtime) best = { proj, id, mtime: m }; };
  for (const proj of fs.readdirSync(ROOT)) {
    if (projFilter && proj !== projFilter) continue;
    const dir = path.join(ROOT, proj); let files;
    try { files = fs.readdirSync(dir); } catch { continue; }
    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue;
      const id = f.slice(0, -6); let m = fs.statSync(path.join(dir, f)).mtimeMs;
      const sd = path.join(dir, id, 'subagents');
      if (fs.existsSync(sd)) for (const x of fs.readdirSync(sd)) m = Math.max(m, fs.statSync(path.join(sd, x)).mtimeMs);
      consider(proj, id, m);
    }
  }
  if (!best && projFilter) return currentSession('');
  return best || {};
}

function buildTimeline(proj, id) {
  const base = path.join(ROOT, proj);
  const mainFile = path.join(base, id + '.jsonl');
  if (!fs.existsSync(mainFile)) throw new Error('session not found');
  const toolName = {};
  const agents = { main: { id: 'main', role: 'Lead', type: 'main' } };
  const events = [];
  const spawner = {}; // toolUseId -> emitting agent id
  const sources = [{ agent: 'main', recs: readJsonl(mainFile) }];

  const subDir = path.join(base, id, 'subagents');
  const meta = {};
  if (fs.existsSync(subDir)) {
    for (const f of fs.readdirSync(subDir).filter((x) => x.endsWith('.jsonl'))) {
      const aid = f.replace(/^agent-/, '').replace(/\.jsonl$/, '');
      let m = {};
      try { m = JSON.parse(fs.readFileSync(path.join(subDir, f.replace(/\.jsonl$/, '.meta.json')), 'utf8')); } catch {}
      meta[aid] = m;
      agents[aid] = { id: aid, role: m.description || m.agentType || 'Agent', type: m.agentType || 'agent', toolUseId: m.toolUseId };
      sources.push({ agent: aid, recs: readJsonl(path.join(subDir, f)) });
    }
  }

  // Map each Agent tool_use to its child so we know who ordered whom.
  const childByTool = {};
  for (const a of Object.values(agents)) if (a.toolUseId) childByTool[a.toolUseId] = a.id;

  for (const { agent, recs } of sources) {
    let lastText = null;
    let firstUser = true;
    for (const r of recs) {
      const ts = Date.parse(r.timestamp) || 0;
      if (r.type === 'user') {
        const items = [];   // tool results: the real output that appeared on the agent's screen
        for (const b of blocks(r)) if (b.type === 'tool_result' && toolName[b.tool_use_id] && !NO_RESULT.has(toolName[b.tool_use_id])) {
          const n = toolName[b.tool_use_id];
          items.push({ id: b.tool_use_id, err: !!b.is_error, out: clip(resultText(b.content).replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trimEnd(), RESULT_MAX[n] || 600) });
        }
        if (items.length) events.push({ ts, agent, kind: 'results', items });
        if (agent !== 'main') { firstUser = false; continue; } // sub's first user msg == the order, emitted by parent
        const bs = blocks(r);
        const txt = bs.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
        if (txt && !/^<(system-reminder|command-|local-command|task-notification)/.test(txt) && !r.isMeta) {
          events.push({ ts, agent: 'user', kind: 'user', text: txt });
        }
      } else if (r.type === 'assistant') {
        for (const b of blocks(r)) {
          if (b.type === 'text' && b.text.trim()) {
            events.push({ ts, agent, kind: 'say', text: b.text.trim() });
            lastText = events[events.length - 1];
          } else if (b.type === 'tool_use') {
            toolName[b.id] = b.name;
            if (b.name === 'Agent' || b.name === 'Task') {
              const to = childByTool[b.id];
              if (to) events.push({ ts, agent, to, kind: 'order', text: (b.input && b.input.prompt) || '', title: (b.input && b.input.description) || '' });
            } else {
              events.push({ ts, agent, kind: 'tool', tool: toolLabel(b, ts) });
            }
          }
        }
      }
    }
    // The last thing a sub-agent says is its report back to the lead.
    if (agent !== 'main' && lastText) {
      lastText.kind = 'report';
      lastText.to = parentOf(agent);
    }
  }
  function parentOf(aid) {
    const tu = agents[aid].toolUseId;
    for (const e of events) if (e.kind === 'order' && e.to === aid) return e.agent;
    return 'main';
  }

  events.sort((a, b) => a.ts - b.ts);
  // Merge consecutive tool events by the same agent into one activity beat.
  const merged = [];
  for (const e of events) {
    const p = merged[merged.length - 1];
    if (e.kind === 'tool' && p && p.kind === 'tools' && p.agent === e.agent) p.tools.push(e.tool);
    else if (e.kind === 'tool') merged.push({ ts: e.ts, agent: e.agent, kind: 'tools', tools: [e.tool] });
    else merged.push(e);
  }
  const first = merged.length ? merged[0].ts : 0;
  const last = merged.length ? merged[merged.length - 1].ts : 0;
  return { id, proj, agents: Object.values(agents), events: merged.map((e) => ({ ...e, t: e.ts - first })), durationMs: last - first };
}

// Ask the local `claude` CLI (uses the user's existing login) to map a JSON array of strings to another array. Cached.
const { spawn } = require('child_process');
const cache = new Map();
// Find a usable `claude` binary: explicit setting → PATH → usual install spots → the one bundled with the VS Code Claude Code extension.
let lastTrError = '', claudeCache = null;
const exists = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } };
function bundledClaude() {
  const home = os.homedir(); let best = null;
  for (const dir of ['.vscode', '.vscode-insiders', '.cursor', '.windsurf', '.vscode-oss']) {
    let names; try { names = fs.readdirSync(path.join(home, dir, 'extensions')); } catch { continue; }
    for (const d of names.filter((x) => x.startsWith('anthropic.claude-code-')))
      for (const n of ['claude', 'claude.exe']) { const f = path.join(home, dir, 'extensions', d, 'resources', 'native-binary', n); if (exists(f) && (!best || d.localeCompare(best.d, undefined, { numeric: true }) > 0)) best = { d, f }; }
  }
  return best && best.f;
}
function findClaude() {
  if (claudeCache && exists(claudeCache)) return claudeCache;
  const home = os.homedir(), win = process.platform === 'win32', names = win ? ['claude.exe', 'claude.cmd', 'claude.bat'] : ['claude'], cands = [];
  if (process.env.AGENT_STANDUP_CLAUDE) cands.push(process.env.AGENT_STANDUP_CLAUDE);
  for (const d of (process.env.PATH || '').split(path.delimiter)) for (const n of names) cands.push(path.join(d, n));
  const dirs = win ? [path.join(home, '.local', 'bin'), path.join(home, '.claude', 'local'), path.join(process.env.APPDATA || '', 'npm'), path.join(process.env.LOCALAPPDATA || '', 'Programs', 'claude')]
    : ['/opt/homebrew/bin', '/usr/local/bin', path.join(home, '.claude/local'), path.join(home, '.local/bin'), path.join(home, '.npm-global/bin'), path.join(home, '.bun/bin'), path.join(home, '.volta/bin')];
  try { const nvm = path.join(home, '.nvm', 'versions', 'node'); for (const v of fs.readdirSync(nvm)) dirs.push(path.join(nvm, v, 'bin')); } catch {}
  for (const d of dirs) for (const n of names) cands.push(path.join(d, n));
  const found = cands.find(exists) || bundledClaude() || null;
  return (claudeCache = found);
}
function spawnClaude(args, opts) {
  const bin = findClaude(); if (!bin) { lastTrError = 'not-found'; return null; }
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin)) return spawn('"' + bin + '"', args, { ...opts, shell: true, windowsHide: true });   // npm's Windows shims need a shell
  return spawn(bin, args, { ...opts, windowsHide: true });
}
let running = 0; const queue = [];
const pump = () => { while (running < 3 && queue.length) { running++; queue.shift()(); } };
const schedule = (fn) => new Promise((res, rej) => { queue.push(() => fn().then(res, rej).finally(() => { running--; pump(); })); pump(); });
// Fast path (~1-2 s instead of ~6 s): if the user has an Anthropic API key in the environment, call the API directly.
async function apiMap(prompt, need) {
  const key = process.env.ANTHROPIC_API_KEY; if (!key) throw new Error('no key');
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-5-5', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }) });
  const j = await r.json(); const out = j.content[0].text, arr = JSON.parse(out.slice(out.indexOf('['), out.lastIndexOf(']') + 1));
  if (arr.length !== need.length) throw new Error('bad length'); return arr;
}
function claudeMap(kind, instruction, texts) {
  const need = [...new Set(texts.filter((t) => !cache.has(kind + '|' + t)))];
  const done = (ok) => ({ texts: texts.map((t) => cache.get(kind + '|' + t) || t), ok });
  if (!need.length) return Promise.resolve(done(true));
  const prompt = instruction + ' Output ONLY a JSON array of strings, same length and order, no markdown.\n' + JSON.stringify(need);
  return apiMap(prompt, need).then((arr) => { need.forEach((t, i) => cache.set(kind + '|' + t, String(arr[i]))); return done(true); }).catch(() => schedule(() => new Promise((resolve) => {
    const p = spawnClaude(['-p', '--model', 'haiku', '--no-session-persistence'], { cwd: os.tmpdir() }); if (!p) return resolve(done(false));
    let out = ''; const timer = setTimeout(() => p.kill(), 60000);
    p.stdout.on('data', (d) => (out += d));
    p.on('error', () => resolve(done(false)));
    p.on('close', () => {
      clearTimeout(timer);
      let ok = false;
      try {
        const arr = JSON.parse(out.slice(out.indexOf('['), out.lastIndexOf(']') + 1));
        if (arr.length === need.length) { need.forEach((t, i) => cache.set(kind + '|' + t, String(arr[i]))); ok = true; }
      } catch {}
      resolve(done(ok));
    });
    p.stdin.end(prompt);
  })));
}
const translate = (texts) => translateFast(texts);

// Warm `claude` workers: after a slow first call each translation takes ~2-3 s (a cold `claude -p` costs ~6 s).
const TR_INSTR = 'Translate each string of this JSON array into natural spoken French, as a teammate would say it in a meeting. Keep code identifiers, file paths, library names and numbers unchanged.';
const TR_SYS = 'You are a translation engine. Translate the user message into natural spoken French, as a colleague would say it in a meeting. Keep code identifiers, file paths, library names and numbers unchanged. Reply with ONLY the translation, nothing else.';
class TrWorker {
  constructor() { this.q = []; this.busy = false; this.n = 0; this.p = null; this.cur = null; this.buf = ''; }
  start() {
    const p = spawnClaude(['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--model', 'haiku', '--no-session-persistence', '--system-prompt', TR_SYS], { cwd: os.tmpdir() });
    if (!p) return;
    this.p = p; this.buf = ''; this.n = 0;
    p.stderr.on('data', (d) => { lastTrError = String(d).slice(-300); });
    p.stdout.on('data', (d) => {
      this.buf += d; let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const l = this.buf.slice(0, i); this.buf = this.buf.slice(i + 1);
        try { const m = JSON.parse(l); if (m.type === 'result' && this.cur) { if (m.is_error) lastTrError = String(m.result || '').slice(0, 200); else lastTrError = ''; this.finish(m.is_error ? null : String(m.result || '').trim()); } } catch {}
      }
    });
    const dead = () => { if (this.p !== p) return; this.p = null; this.finish(null); };
    p.on('close', dead); p.on('error', dead);
  }
  finish(res) { const c = this.cur; this.cur = null; this.busy = false; if (c) { clearTimeout(c.timer); c.res(res); } this.pump(); }
  ask(text) { return new Promise((res) => { this.q.push({ text, res }); this.pump(); }); }
  kill() { clearTimeout(this.idle); if (this.p) { const p = this.p; this.p = null; try { p.kill(); } catch {} } }
  pump() {
    if (this.busy || !this.q.length) return;
    if (!this.p || this.n >= 30) { if (this.p) { const old = this.p; this.p = null; old.kill(); } this.start(); if (!this.p) { while (this.q.length) this.q.shift().res(null); return; } }   // restart now and then: the conversation context grows
    clearTimeout(this.idle); this.idle = setTimeout(() => { if (!this.busy && !this.q.length) this.kill(); }, 10 * 60 * 1000);   // free the process when nothing was translated for 10 min
    const job = this.q.shift(); this.busy = true; this.n++; this.cur = job;
    job.timer = setTimeout(() => { if (this.cur === job && this.p) this.p.kill(); }, 45000);
    this.p.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: job.text } }) + '\n');
  }
}
const trWorkers = [new TrWorker(), new TrWorker()];
const shutdown = () => trWorkers.forEach((w) => w.kill());
process.on('exit', shutdown);
const pickWorker = () => trWorkers.reduce((a, b) => (a.q.length + a.busy <= b.q.length + b.busy ? a : b));
async function translateFast(texts) {
  const need = [...new Set(texts.filter((t) => !cache.has('fr|' + t)))];
  if (need.length && need.length <= 3 && !process.env.ANTHROPIC_API_KEY) {   // a few lines: warm workers in parallel; many lines: one batched call
    await Promise.all(need.map(async (t) => { const r = await pickWorker().ask(t); if (r) cache.set('fr|' + t, r); }));
    return { texts: texts.map((t) => cache.get('fr|' + t) || t), ok: texts.every((t) => cache.has('fr|' + t)) };
  }
  return claudeMap('fr', TR_INSTR, texts);
}
const quips = (texts, lang) => claudeMap('q' + lang, `Each string is a work report from a software agent. For each, write ONE short, deadpan, funny reaction (max 12 words) from a grumpy teammate in a South Park-style cartoon meeting, in ${lang === 'fr' ? 'French' : 'English'}. No emojis.`, texts);

// ---- text-to-speech, generated on the machine and cached as wav:
//      macOS → `say`, Windows → System.Speech (SAPI voices) through PowerShell, Linux → espeak-ng.
let sayVoices = null;
const WIN = process.platform === 'win32', MAC = process.platform === 'darwin';
const PS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command'];
function listVoices() {
  if (sayVoices) return sayVoices;
  const voices = [];
  try {
    if (MAC) {
      const out = execFileSync('say', ['-v', '?'], { encoding: 'utf8', timeout: 5000 });
      for (const line of out.split('\n')) { const m = line.match(/^(.+?)\s{2,}([a-z]{2}_[A-Z]{2})\s+#/); if (m) voices.push({ name: m[1].trim(), locale: m[2] }); }
    } else if (WIN) {
      const out = execFileSync('powershell.exe', [...PS, "Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name + '|' + $_.VoiceInfo.Culture.Name }"], { encoding: 'utf8', timeout: 20000, windowsHide: true });
      for (const line of out.split(/\r?\n/)) { const [name, loc] = line.trim().split('|'); if (name && loc) voices.push({ name, locale: loc.replace('-', '_') }); }
    } else {
      const out = execFileSync('espeak-ng', ['--voices'], { encoding: 'utf8', timeout: 5000 });
      for (const line of out.split('\n').slice(1)) { const c = line.trim().split(/\s+/); if (c[1] && /^(fr|en)/.test(c[1])) voices.push({ name: c[1], locale: c[1].replace('-', '_').replace(/^(\w{2})$/, (m) => m + '_' + m.toUpperCase()) }); }
    }
  } catch {}
  return (sayVoices = { available: voices.length > 0, voices, platform: process.platform });
}
const ttsDir = path.join(os.tmpdir(), 'agent-standup-tts');
const ttsJobs = new Map();
try { for (const f of fs.readdirSync(ttsDir)) { const p = path.join(ttsDir, f); if (Date.now() - fs.statSync(p).mtimeMs > 864e5) fs.unlinkSync(p); } } catch {}   // drop cached audio older than a day
function synthesize(voice, wpm, text, out) {
  return new Promise((resolve, reject) => {
    let p;
    if (MAC) p = spawn('say', ['-v', voice, '-r', String(wpm), '--data-format=LEI16@22050', '-o', out, '--', text]);
    else if (WIN) {
      const rate = Math.max(-6, Math.min(8, Math.round((wpm - 175) / 12)));   // SAPI rate: -10..10
      p = spawn('powershell.exe', [...PS, '$ErrorActionPreference = "Stop"; Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SelectVoice($env:AS_VOICE); $s.Rate = [int]$env:AS_RATE; $s.SetOutputToWaveFile($env:AS_OUT); $s.Speak($env:AS_TEXT); $s.Dispose()'],
        { env: { ...process.env, AS_VOICE: voice, AS_RATE: String(rate), AS_OUT: out, AS_TEXT: text }, windowsHide: true });
    } else p = spawn('espeak-ng', ['-v', voice, '-s', String(wpm), '-w', out, '--', text]);
    p.on('error', reject); p.on('close', (code) => (code === 0 && fs.existsSync(out) ? resolve() : reject(new Error('tts failed'))));
  });
}
function tts(text, voice, rate) {
  const vs = listVoices();
  if (!vs.available || !vs.voices.some((v) => v.name === voice)) return Promise.reject(new Error('unknown voice'));
  text = String(text).slice(0, 700); rate = Math.max(90, Math.min(360, Math.round(+rate || 180)));
  const key = crypto.createHash('sha1').update([voice, rate, text].join('|')).digest('hex'), file = path.join(ttsDir, key + '.wav');
  if (fs.existsSync(file)) return Promise.resolve(file);
  if (ttsJobs.has(key)) return ttsJobs.get(key);
  fs.mkdirSync(ttsDir, { recursive: true });
  const tmp = file + '.part.wav';
  const job = synthesize(voice, rate, text, tmp).then(() => { fs.renameSync(tmp, file); return file; }).finally(() => ttsJobs.delete(key));
  ttsJobs.set(key, job); return job;
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
let audioOwner = { id: null, seen: 0 };
function start(port = PORT) {
  return http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  // Only the local machine may talk to this server: blocks other websites (cross-site requests) and DNS-rebinding attempts.
  const local = (h) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(h || '');
  let originOk = true; try { originOk = !req.headers.origin || local(new URL(req.headers.origin).host); } catch { originOk = false; }
  if (!local(req.headers.host) || !originOk) { res.writeHead(403); return res.end('forbidden'); }
  const json = (o, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  try {
    if (url.pathname === '/api/translate' && req.method === 'POST') {
      let body = ''; req.on('data', (d) => (body += d));
      return req.on('end', async () => { try { json(await translate(JSON.parse(body).texts || [])); } catch (e) { json({ error: String(e) }, 400); } });
    }
    if (url.pathname === '/api/quips' && req.method === 'POST') {
      let body = ''; req.on('data', (d) => (body += d));
      return req.on('end', async () => { try { const b = JSON.parse(body); json(await quips(b.texts || [], b.lang)); } catch (e) { json({ error: String(e) }, 400); } });
    }
    if (url.pathname === '/api/sessions') return json(listSessions());
    if (url.pathname === '/api/audio') {   // only one window at a time plays sound: the last one that claimed it (expires if that window stops answering)
      const cid = url.searchParams.get('cid') || '', ok = /^[\w-]{4,40}$/.test(cid);
      if (ok && url.searchParams.get('claim')) audioOwner = { id: cid, seen: Date.now() };
      else if (ok && audioOwner.id === cid) audioOwner.seen = Date.now();
      if (audioOwner.id && Date.now() - audioOwner.seen > 6000) audioOwner = { id: null, seen: 0 };
      return json({ owner: audioOwner.id });
    }
    if (url.pathname === '/api/health') return json({ claude: findClaude(), apiKey: !!process.env.ANTHROPIC_API_KEY, trError: lastTrError, platform: process.platform });
    if (url.pathname === '/api/warm') { trWorkers.forEach((w) => { if (!w.p) w.start(); }); return json({ ok: true }); }
    if (url.pathname === '/api/voices') return json(listVoices());
    if (url.pathname === '/api/tts') {
      return tts(url.searchParams.get('text') || '', url.searchParams.get('voice'), url.searchParams.get('rate'))
        .then((f) => { res.writeHead(200, { 'content-type': 'audio/wav', 'cache-control': 'max-age=86400' }); fs.createReadStream(f).pipe(res); })
        .catch((e) => json({ error: String(e.message) }, 400));
    }
    if (url.pathname === '/api/current') return json(currentSession(url.searchParams.get('proj') || ''));
    if (url.pathname === '/api/session') {
      const proj = url.searchParams.get('proj') || '', sid = url.searchParams.get('id') || '', SAFE = /^[\w.\-]+$/;
      if (!SAFE.test(proj) || !SAFE.test(sid) || proj === '..' || sid === '..') { res.writeHead(400); return res.end('bad request'); }
      const tl = proj === '_demo' ? require('./demo.js')() : timeline(proj, sid);   // built-in fictional session
      const after = url.searchParams.get('after');
      if (after == null) return json(tl);
      return json({ id: tl.id, agents: tl.agents, total: tl.events.length, events: tl.events.slice(+after) });
    }
    const file = path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  } catch (e) { json({ error: String(e.message || e) }, 500); }
  }).listen(port, '127.0.0.1', () => console.log(`Agent Standup → http://localhost:${port}`));
}
module.exports = { start, currentSession, shutdown, findClaude, bundledClaude };
if (require.main === module) {
  start().on('error', (e) => {
    console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is already in use (maybe Agent Standup is already running, e.g. inside VS Code). Try: PORT=4790 node server.js` : String(e));
    process.exit(1);
  });
}
