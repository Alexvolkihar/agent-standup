// Cuts a take into the short video: the lines kept whole, the quiet work in between sped up under the music, zooms where a page is shown, captions, the end card.
//   node edit.js <take folder> <edl.js> <out.mp4>          from the repo root; needs ffmpeg
// A spoken line is never cut: its shot runs from the moment its voice starts to the moment the app ends it ("end <who>" in the take's log), at real speed.
// Everything else is a "look" shot: no voice, any speed. The edit stops if the take's log says a line was read short ("CUT").
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const [take, edlFile, dest] = process.argv.slice(2), repo = path.join(__dirname, '../../../../..');
const T = JSON.parse(fs.readFileSync(path.join(take, 'take.json'), 'utf8')), k = T.total / T.dur;
if (T.log.some((l) => l.startsWith('CUT '))) throw new Error('a line was read short in this take: ' + T.log.filter((l) => l.startsWith('CUT ')).join(' | '));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'as-edit-')), ff = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });

// the lines of the take: when each started (its bubble), when its voice really started (the first sound after that), when the app ended it
const detect = execFileSync('sh', ['-c', `ffmpeg -hide_banner -nostats -i '${path.join(take, 'voices.webm')}' -af silencedetect=noise=-42dB:d=0.12 -f null - 2>&1`], { encoding: 'utf8' });
const ends = (detect.match(/silence_end: [\d.]+/g) || []).map((s) => +s.split(' ')[1]);   // where sound starts again
const lines = []; for (const l of T.log) { const m = l.match(/^([\d.]+) ([\w-]+): (.*)$/); if (m) lines.push({ at: +m[1], who: m[2], text: m[3] }); const e = l.match(/^([\d.]+) end ([\w-]+)$/); if (e) { const o = [...lines].reverse().find((x) => x.who === e[2] && x.end == null); if (o) o.end = +e[1]; } }
for (const l of lines) l.on = ends.find((t) => t >= l.at - 0.3) ?? l.at;
lines.forEach((l, i) => { const n = lines[i + 1], p = lines[i - 1]; l.out = Math.min(l.end + 0.3, n ? n.on - 0.04 : 1e9); l.in = Math.max(l.on - 0.12, p && p.end != null ? p.end + 0.02 : 0); });   // a line that another one follows at once is cut where that one starts, not inside it
const line = (text) => { const l = lines.find((x) => x.text.includes(text)); if (!l || l.end == null) throw new Error('no whole line with: ' + text); return l; };

const { shots, OPEN, END, open, card } = require(path.resolve(edlFile))({ line, marks: T.marks, lines });
const push = (d) => `scale=w='trunc(1920*(1+0.04*t/${d.toFixed(3)})/2)*2':h=-2:eval=frame:flags=bicubic,crop=1920:1080`;   // a slow push-in over each shot
const parts = []; let t = OPEN; const caps = [], sections = [0];
shots.forEach((s, i) => {
  const voice = !!s.line, a = voice ? s.line.in : s.from, b = voice ? s.line.out : s.to, speed = voice ? 1 : s.speed || 1, d = (b - a) / speed, out = path.join(tmp, `s${String(i).padStart(2, '0')}.mkv`); parts.push(out);
  const crop = s.zoom ? `crop=${s.zoom[2]}:${Math.round(s.zoom[2] * 9 / 16)}:${s.zoom[0]}:${s.zoom[1]},scale=1920:1080:flags=lanczos,` : '';
  const v = `[0:v]setpts=(PTS-STARTPTS)*${(k / speed).toFixed(6)},fps=30,${crop}${s.still ? 'scale=1920:1080,' : push(d) + ','}setsar=1,format=yuv420p,trim=duration=${d.toFixed(3)}[v]`;
  const au = voice ? `[1:a]aresample=48000,asetpts=PTS-STARTPTS,afade=t=in:d=0.03,afade=t=out:st=${(d - 0.12).toFixed(3)}:d=0.12,apad,atrim=duration=${d.toFixed(3)}[a]` : `anullsrc=r=48000:cl=mono,atrim=duration=${d.toFixed(3)}[a]`;
  ff(['-ss', (a / k).toFixed(3), '-t', ((b - a) / k + 0.6).toFixed(3), '-i', path.join(take, 'call.mkv'), '-ss', a.toFixed(3), '-t', (b - a).toFixed(3), '-i', path.join(take, 'voices.webm'),
    '-filter_complex', `${v};${au}`, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'fast', '-crf', '14', '-c:a', 'pcm_s16le', '-ac', '1', '-t', d.toFixed(3), out]);
  if (s.section) sections.push(t); for (const [x, y, c] of s.caps || []) caps.push([t + x, y < 0 ? t + d : t + y, c]); s.t = t; s.d = d; t += d; process.stdout.write('.');
});
const all = t + END; sections.push(t);
const still = (img, d, extra, out) => ff(['-loop', '1', '-t', String(d), '-i', img, '-f', 'lavfi', '-t', String(d), '-i', 'anullsrc=r=48000:cl=mono', '-filter_complex', `[0:v]scale=1920:1080,fps=30,setsar=1,format=yuv420p${extra}[v]`, '-map', '[v]', '-map', '1:a', '-c:v', 'libx264', '-preset', 'fast', '-crf', '14', '-c:a', 'pcm_s16le', '-ac', '1', '-t', String(d), out]);
const o = path.join(tmp, 'open.mkv'), e = path.join(tmp, 'end.mkv'); still(open, OPEN, '', o); still(card, END, ',fade=t=in:d=0.3', e);
const list = path.join(tmp, 'list.txt'); fs.writeFileSync(list, [o, ...parts, e].map((p) => `file '${p}'`).join('\n'));
const body = path.join(tmp, 'body.mkv'); ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', body]);

const BOLD = '/System/Library/Fonts/Supplemental/Arial Bold.ttf', esc = (s) => s.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, '’').replace(/%/g, '\\%').replace(/,/g, '\\,');
const merged = []; for (const c of caps) { const p = merged[merged.length - 1]; if (p && p[2] === c[2] && c[0] - p[1] < 0.05) p[1] = c[1]; else merged.push([...c]); }
const text = merged.map(([a, b, s]) => `drawtext=fontfile='${BOLD}':text='${esc(s)}':fontsize=56:fontcolor=white:box=1:boxcolor=0x10282fE6:boxborderw=24:x=(w-text_w)/2:y=h-180:alpha='min(1\\,(t-${a.toFixed(2)})/0.14)':enable='between(t,${a.toFixed(2)},${(b - 0.03).toFixed(2)})'`).join(',');
const flash = sections.slice(1, -1).map((s) => `drawbox=x=0:y=0:w=iw:h=ih:color=white@0.3:t=fill:enable='between(t,${s.toFixed(2)},${(s + 0.07).toFixed(2)})'`).join(',');
const wav = require(path.join(repo, 'scripts/promo-music-upbeat.js'))(path.join(tmp, 'music.wav'), all + 0.5, sections.slice(1).map((s) => s - 0.02), 128);
const script = path.join(tmp, 'filter.txt');
fs.writeFileSync(script, [
  `[0:v]${[flash, text].filter(Boolean).join(',')}[out]`,
  `[0:a]aresample=44100,loudnorm=I=-15:TP=-1.5:LRA=9,asplit[voice][key]`,
  `[1:a]aresample=44100,volume=0.5,afade=t=out:st=${(all - 1.6).toFixed(2)}:d=1.6[bed]`,
  `[bed][key]sidechaincompress=threshold=0.015:ratio=5:attack=15:release=650[music]`,
  `[voice][music]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.92[aout]`,
].join(';'));
ff(['-i', body, '-i', wav, '-filter_complex_script', script, '-map', '[out]', '-map', '[aout]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-movflags', '+faststart', '-t', all.toFixed(2), dest]);
const at = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
console.log('\n' + dest, all.toFixed(1) + ' s'); for (const s of shots) if (s.section) console.log(at(s.t) + ' ' + (s.name || (s.line ? s.line.text.slice(0, 50) : '')));
fs.rmSync(tmp, { recursive: true, force: true });
