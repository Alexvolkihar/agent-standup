// npm run stats — what the project can see about itself: the public counters of the stores and of GitHub (no server, no tracking of people).
//   npm run stats                        today's figures, what moved since you last looked, and the trend day by day
//   node scripts/stats.js --record FILE  adds today's line to the history FILE (one JSON line per day; a second run the same day replaces the line)
// The history is the file history.jsonl of the "stats" release on GitHub, beside the counters of the landing page. .github/workflows/stats.yml adds a line every day.
// What each number is worth: Marketplace "installs" are people (installed from inside VS Code); the "downloads" of the Marketplace, of Open VSX and of npm
// are fetches of the package, and every published version brings a burst of automatic ones (mirrors, scanners). Compare days, not totals.
const { execFileSync } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const repo = 'Atoll92/agent-standup', ext = 'DoubleGeste.agent-standup', pkg = '@double_geste/agent-standup', snap = path.join(os.homedir(), '.agent-standup-stats.json');
const gh = (args) => JSON.parse(execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
const soft = async (fn) => { try { return await fn(); } catch { return null; } };   // one source that does not answer leaves a hole in the line, not a failed run
const json = async (url, init) => { const r = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); };

async function collect() {
  const mp = await soft(async () => {
    const j = await json('https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json;api-version=3.0-preview.1' }, body: JSON.stringify({ filters: [{ criteria: [{ filterType: 7, value: ext }] }], flags: 914 }) });
    const s = Object.fromEntries(j.results[0].extensions[0].statistics.map((x) => [x.statisticName, +x.value]));
    return { installs: s.install || 0, downloads: s.downloadCount || 0, updates: s.updateCount || 0, ratings: s.ratingcount || 0 };
  });
  const ovsx = await soft(async () => { const j = await json('https://open-vsx.org/api/' + ext.replace('.', '/')); return { downloads: j.downloadCount || 0, reviews: j.reviewCount || 0 }; });
  const npm = await soft(async () => (await json('https://api.npmjs.org/downloads/point/last-year/' + pkg)).downloads);   // a year back: the whole life of the package for a long while
  const hub = await soft(async () => {
    const r = gh(['api', `repos/${repo}`]), files = { vsix: 0, mac: 0, windows: 0, linux: 0, cli: 0 }, landing = {}; let active = 0, week = 0;
    for (const rel of gh(['api', `repos/${repo}/releases`, '--paginate'])) for (const a of rel.assets) {
      if (rel.tag_name === 'stats') { if (a.name === 'app-active.gif') active = a.download_count; else if (a.name === 'app-week.gif') week = a.download_count; else if (/^pixel-.*\.gif$/.test(a.name)) landing[a.name.slice(6, -4)] = a.download_count; continue; }   // the history file sits there too and is not a counter
      files[/\.vsix$/.test(a.name) ? 'vsix' : /mac/.test(a.name) ? 'mac' : /windows/.test(a.name) ? 'windows' : /linux/.test(a.name) ? 'linux' : 'cli'] += a.download_count;
    }
    return { stars: r.stargazers_count, forks: r.forks_count, files, active, week, landing };
  });
  const yt = await soft(youtube);
  return { d: new Date().toISOString().slice(0, 10), mp, ovsx, npm, hub, ...(yt ? { yt } : {}) };
}
// The YouTube channel's public counts: subscribers, and the views of each video and Short, read from the channel's own pages (the consent cookie skips the EU consent page)
async function youtube() {
  const get = async (tab) => { const r = await fetch('https://www.youtube.com/@Agent_Standup/' + tab, { headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36', 'accept-language': 'en-US,en;q=0.9', cookie: 'SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg; CONSENT=YES+cb' }, signal: AbortSignal.timeout(20000) }); const m = (await r.text()).match(/var ytInitialData = (\{.*?\});<\/script>/s); return m ? JSON.parse(m[1]) : null; };
  const num = (t) => { const m = /([\d.,]+)\s*([KM])?/.exec(String(t || '')); return m ? Math.round(parseFloat(m[1].replace(/,/g, '')) * (m[2] === 'K' ? 1e3 : m[2] === 'M' ? 1e6 : 1)) : 0; };
  const videos = [], walk = (o, short) => { if (!o || typeof o !== 'object') return;
    if (o.lockupViewModel) { const t = o.lockupViewModel.metadata && o.lockupViewModel.metadata.lockupMetadataViewModel, parts = JSON.stringify((t && t.metadata) || {}).match(/"content":"([^"]*)"/g) || []; if (t) videos.push({ title: t.title && t.title.content, views: num((parts[0] || '').slice(11, -1)) }); }
    if (o.shortsLockupViewModel) { const m = o.shortsLockupViewModel.overlayMetadata || {}; videos.push({ title: m.primaryText && m.primaryText.content, views: num(m.secondaryText && m.secondaryText.content), short: 1 }); }
    for (const k in o) walk(o[k], short); };
  const v = await get('videos'), sh = await get('shorts'); if (!v && !sh) return null; walk(v); walk(sh);
  const subs = /"(\d[\d.,]*[KM]?) subscribers?"/.exec(JSON.stringify(v || sh)); return { subs: subs ? num(subs[1]) : null, views: videos.reduce((n, x) => n + x.views, 0), videos };
}
// The website's visits, from Vercel Web Analytics through the Vercel command line (needs `npx vercel login` on this computer; the daily job on GitHub has no login and skips it)
function website() {
  const q = (...a) => { const out = execFileSync('npx', ['-y', 'vercel@latest', 'metrics', 'vercel.analytics.page_view.count', '--scope', 'dg-team-fe3d9cf0', '-p', 'agent-standup', '--prod', '--json', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 120000 }); return JSON.parse(out.slice(out.indexOf('{'))); };
  const days = q('--since', '7d', '-g', '1d').data.map((r) => [r.timestamp.slice(5, 10), Object.entries(r).find(([k]) => k !== 'timestamp')[1]]).filter(([, n]) => n);
  const top = (dim) => { const j = q('--since', '3d', '--group-by', dim, '-l', '6'), by = {}; for (const r of j.data || []) { const k = r[dim] || '(direct)', n = Object.entries(r).find(([x]) => x !== dim && /count/.test(x)); if (n) by[k] = (by[k] || 0) + n[1]; } return Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 6); };
  return { days, sources: top('referrerHostname'), countries: top('country') };
}
const flat = (x) => ({ 'Marketplace installs': x.mp && x.mp.installs, 'Marketplace downloads': x.mp && x.mp.downloads, 'Marketplace updates': x.mp && x.mp.updates, 'Marketplace ratings': x.mp && x.mp.ratings,
  'Open VSX downloads': x.ovsx && x.ovsx.downloads, 'Open VSX reviews': x.ovsx && x.ovsx.reviews, 'npm downloads': x.npm, 'GitHub stars': x.hub && x.hub.stars, 'GitHub forks': x.hub && x.hub.forks,
  'GitHub: extension files': x.hub && x.hub.files && x.hub.files.vsix, 'GitHub: desktop app (Mac / Windows / Linux)': x.hub && x.hub.files && [x.hub.files.mac, x.hub.files.windows, x.hub.files.linux].join(' / '), 'GitHub: command line file': x.hub && x.hub.files && x.hub.files.cli,
  'Opt-in active installs (1 request a day each)': x.hub && x.hub.active, 'Opt-in people who opened the call (1 request a week each)': x.hub && x.hub.week, 'YouTube subscribers': x.yt && x.yt.subs, 'YouTube views (all videos)': x.yt && x.yt.views });
const lines = (text) => text.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((x) => x && x.d);

(async () => {
  const at = process.argv.indexOf('--record');
  if (at >= 0) {   // one line per day, the days in order
    const file = process.argv[at + 1]; if (!file) { console.error('--record needs a file'); process.exit(2); }
    const now = await collect(), all = (fs.existsSync(file) ? lines(fs.readFileSync(file, 'utf8')) : []).filter((x) => x.d !== now.d).concat(now).sort((a, b) => (a.d < b.d ? -1 : 1));
    if (!now.mp && !now.ovsx && !now.hub) { console.error('nothing answered: the history is left as it is'); process.exit(1); }
    fs.writeFileSync(file, all.map((x) => JSON.stringify(x)).join('\n') + '\n'); console.log(`recorded ${now.d} (${all.length} days in ${file})`); return;
  }
  const now = await collect(), f = flat(now), prev = fs.existsSync(snap) ? JSON.parse(fs.readFileSync(snap, 'utf8')) : {}, was = prev.f || null;   // (a snapshot written before this version has no `f`: no "since" the first time)
  console.log(was ? `Now, and what moved since ${prev.at}:\n` : 'Now:\n');
  for (const [k, v] of Object.entries(f)) { const p = was && was[k], dlt = typeof v === 'number' && typeof p === 'number' && v !== p ? `  (${v > p ? '+' : ''}${v - p})` : ''; console.log('  ' + k.padEnd(46), v == null ? 'no answer' : v, dlt); }
  if (now.hub) console.log('  ' + 'Landing visits by source'.padEnd(46), Object.entries(now.hub.landing).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(', ') || 'none', '\n  (the "direct" counter also counts robots)');
  const traffic = (p) => { try { return gh(['api', `repos/${repo}/traffic/${p}`]); } catch { return null; } }, v = traffic('views'), c = traffic('clones'), ref = traffic('popular/referrers');
  if (v) console.log('\nRepository, last 14 days:', v.count, 'views by', v.uniques, 'people;', c ? `${c.count} clones by ${c.uniques}` : '', ref && ref.length ? '\n  from: ' + ref.map((r) => `${r.referrer} ${r.uniques}`).join(', ') : '');
  let hist = process.env.STATS_HISTORY ? fs.readFileSync(process.env.STATS_HISTORY, 'utf8') : ''; if (!hist) try { hist = execFileSync('gh', ['release', 'download', 'stats', '--repo', repo, '-p', 'history.jsonl', '-O', '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch {}
  const days = lines(hist).filter((x) => x.d !== now.d).concat(now).slice(-21), col = [['Marketplace installs', (x) => x.mp && x.mp.installs], ['Open VSX dl', (x) => x.ovsx && x.ovsx.downloads], ['npm dl', (x) => x.npm], ['GitHub files', (x) => x.hub && x.hub.files && x.hub.files.vsix + x.hub.files.mac + x.hub.files.windows + x.hub.files.linux + x.hub.files.cli], ['stars', (x) => x.hub && x.hub.stars]];
  console.log(`\nDay by day (${days.length} day${days.length > 1 ? 's' : ''}; the change from the day before in brackets):\n`); console.log('  ' + 'day'.padEnd(12) + col.map(([n]) => n.padEnd(24)).join(''));
  days.forEach((x, i) => console.log('  ' + x.d.padEnd(12) + col.map(([, get]) => { const a = get(x), b = i ? get(days[i - 1]) : null; return (a == null ? '-' : a + (typeof b === 'number' && typeof a === 'number' ? ` (${a >= b ? '+' : ''}${a - b})` : '')).padEnd(24); }).join('') + (x.note ? ' ' + x.note : '')));
  // The number to follow: how many people opened the call, week by week (only those who said yes to "share usage"). A week runs from Monday (UTC); the daily job reads the counter early
  // in the morning, so the first hours of a Monday are counted in the week before.
  const monday = (d) => { const t = Date.parse(d + 'T00:00:00Z'); return new Date(t - ((new Date(t).getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10); }, wk = [];
  for (const x of lines(hist).filter((x) => x.d !== now.d).concat(now)) { const n = x.hub && x.hub.week; if (typeof n !== 'number') continue; const m = monday(x.d), w = wk[wk.length - 1]; if (w && w.m === m) w.n = n; else wk.push({ m, n, from: w ? w.n : null }); }
  if (wk.length) console.log('\nPeople who opened the call, week by week (opt-in):\n' + wk.map((w, i) => `  week of ${w.m}  ${w.from == null ? 'counting starts at ' + w.n : w.n - w.from}${i === wk.length - 1 ? ' so far' : ''}`).join('\n'));
  if (days.length < 3) console.log('\n  The daily job on GitHub adds one line a day: the trend is worth reading after a week or two.');
  if (now.yt && now.yt.videos.length) console.log('\nYouTube (public counts):\n' + now.yt.videos.map((x) => '  ' + String(x.views).padStart(6) + '  ' + (x.short ? '[Short] ' : '') + x.title).join('\n'));
  if (!process.env.STATS_NO_WEBSITE) { try { const w = website(); console.log('\nWebsite agent-standup.com (Vercel Web Analytics, page views):\n  per day: ' + w.days.map(([d, n]) => d + ' ' + n).join(' · ') + '\n  last 3 days, by source: ' + w.sources.map(([k, n]) => k + ' ' + n).join(', ') + '\n  last 3 days, by country: ' + w.countries.map(([k, n]) => k + ' ' + n).join(', ')); } catch { console.log('\nWebsite: not read (the Vercel command line needs `npx vercel login` on this computer)'); } }
  console.log('\nThe funnel of the Marketplace page (views, then installs, per day) is only in your publisher account: https://marketplace.visualstudio.com/manage (Acquisition tab).');
  fs.writeFileSync(snap, JSON.stringify({ at: new Date().toISOString().slice(0, 16).replace('T', ' '), f }));
})().catch((e) => { console.error(e.message || e); process.exit(1); });
