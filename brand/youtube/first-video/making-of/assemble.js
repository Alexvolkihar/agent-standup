// Turns a take into the video: captions, the end card, the voices the app recorded, and original music under them.
//   node assemble.js <take folder> <end card png> <out.mp4>        MUSIC=<folder with promo-music.js>
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const [take, card, dest] = process.argv.slice(2), { total, dur, marks, log } = JSON.parse(fs.readFileSync(path.join(take, 'take.json'), 'utf8'));
const heard = (text, or) => { const l = log.find((l) => l.includes(text)); return l ? parseFloat(l) : or; };   // when a line with these words started
const k = total / dur, END = 5.5, all = total + END, m = { ...marks, report: heard('The title and both', marks.report) }, tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'as-yt-'));
// [from, to, caption, where its middle is (the visitor's card is at the bottom right)]. The words are the scriptwriter's, as the critic amended them.
const cap = [
  [0.2, m.order + 4.4, 'Your coding agents, shown as a live team call'],
  [m.order + 4.6, m.launch, 'One order in Claude Code: make this video'],
  [m.launch + 0.2, m.launch + 7.4, 'Margot, the main agent, briefs three sub-agents'],
  [m.launch + 7.6, m.screens, 'A second session starts: it gets its own tab'],
  [m.screens + 0.2, m.screens + 6.4, 'Each agent shares its real screen'],
  [m.screens + 6.6, m.knock, 'Tokens are counted live, agent by agent'],
  [m.knock + 0.2, m.there, 'Second session done: its agent leans in to tell you', 760],
  [m.there + 0.3, m.back, 'One click takes you there. Its new file is listed'],
  [m.back + 0.4, m.report + 7, 'Sound on: the app reads the report aloud'],
  [m.report + 7.2, m.critic - 3.2, 'Not a mockup: a real session, replayed faster'],
  [m.critic - 3, m.objection, 'A fourth agent, new to the app, reviews the drafts'],
  [m.objection + 0.5, m.decision, 'The critic: say what the app is before the joke'],
  [m.decision + 0.3, m.record, 'Margot decides: what the app is first, the joke last'],
  [m.record + 0.3, m.record + 4.3, 'Margot starts recording this very call'],
  [m.record + 4.5, total - 0.1, 'That recording is what you are watching'],
];
const font = '/System/Library/Fonts/Helvetica.ttc', esc = (s) => s.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, '’').replace(/%/g, '\\%').replace(/,/g, '\\,');
const text = cap.map(([a, b, s, mid]) => `drawtext=fontfile=${font}:text='${esc(s)}':fontsize=44:fontcolor=white:box=1:boxcolor=0x000000C8:boxborderw=22:x=${mid || 'w/2'}-text_w/2:y=h-150:enable='between(t,${a.toFixed(2)},${b.toFixed(2)})'`).join(',');
const script = path.join(tmp, 'filter.txt');
fs.writeFileSync(script, [
  `[0:v]setpts=PTS*${k.toFixed(6)},fps=30,scale=1920:1080:flags=lanczos,setsar=1,format=yuv420p,${text}[call]`,
  `[1:v]scale=1920:1080,fps=30,setsar=1,format=yuv420p,fade=t=in:st=0:d=0.5[end]`,
  `[call][end]concat=n=2:v=1:a=0[out]`,
  `[2:a]aresample=44100,loudnorm=I=-16:TP=-1.5:LRA=11,apad=whole_dur=${all.toFixed(2)},asplit[voice][key]`,
  `[3:a]aresample=44100,volume='0.30+0.18*min(1\\,max(0\\,(t-${(total - 0.4).toFixed(2)})/1.2))':eval=frame,afade=t=out:st=${(all - 2).toFixed(2)}:d=2[bed]`,
  `[bed][key]sidechaincompress=threshold=0.012:ratio=9:attack=25:release=700:makeup=1[music]`,   // the music steps back while someone speaks
  `[voice][music]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.9[aout]`,
].join(';'));
const wav = require(path.join(process.env.MUSIC, 'promo-music.js'))(path.join(tmp, 'music.wav'), all + 0.5, [m.launch, m.screens, m.knock, m.there, m.back, m.critic, m.objection, m.decision, m.record, total].map((x) => x + 0.1));
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(take, 'call.webm'), '-loop', '1', '-t', String(END), '-i', card, '-i', path.join(take, 'voices.webm'), '-i', wav, '-filter_complex_script', script, '-map', '[out]', '-map', '[aout]',
  '-c:v', 'libx264', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-crf', '19', '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-t', all.toFixed(2), '-movflags', '+faststart', dest], { stdio: 'inherit' });
const at = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
console.log(dest, all.toFixed(1) + 's'); console.log(Object.entries(m).map(([n, t]) => at(t) + ' ' + n).join('\n'));
fs.rmSync(tmp, { recursive: true, force: true });
