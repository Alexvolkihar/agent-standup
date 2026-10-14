// Turns a take into the video: captions, the end card, the voices the app recorded, and original music under them.
//   node assemble.js <take folder> <end card png> <out.mp4>        MUSIC=<folder with promo-music.js>
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const [take, card, dest] = process.argv.slice(2), { total, dur, marks, log } = JSON.parse(fs.readFileSync(path.join(take, 'take.json'), 'utf8'));
const heard = (text, or) => { const l = log.find((l) => l.includes(text)); return l ? parseFloat(l) : or; };   // when a line with these words started
const k = total / dur, END = 5.5, all = total + END, m = { ...marks }, tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'as-yt-'));
const g = (n, or) => (m[n] != null ? m[n] : or);   // a mark the take may not have (the page pinned by a click)
// [from, to, caption, where its middle is]. The words are the scriptwriter's (script.md), as the critic and the scenes of the recorded call amended them.
const cap = [
  [0.2, m.order + 3.6, 'Your coding agents, as a live team call'],
  [m.order + 3.8, m.order + 9, '1.32.0 has shipped. So, naturally, a meeting'],
  [m.order + 9.2, m.launch, 'One request in Claude Code: the release video'],
  [m.launch + 0.2, m.launch + 6.4, 'Margot, the main agent, briefs three sub-agents'],
  [m.launch + 6.6, m.tabs, 'Talking points, script, thumbnail. The usual split'],
  [m.tabs + 0.2, m.pin, 'A second session writes the description'],
  [m.pin + 0.3, m.screens + 5.5, 'One click on its tab pins the call there'],
  [m.screens + 5.7, m.screens + 11.5, 'It stays put, like a booked meeting room'],
  [m.screens + 11.7, m.report1, 'Each agent shares its real screen. No slides'],
  [m.report1 + 0.2, m.report2, 'Sound on: each report is read aloud'],
  [m.report2 + 0.2, m.knock, 'Natural voices, by default now'],
  [m.knock + 0.2, m.more, 'Also in French, Spanish and Brazilian Portuguese'],
  [m.more + 0.2, m.agenda, 'One more request: show the artifacts'],
  [m.agenda + 0.2, g('artifact', m.agenda + 3) + 4, 'An artifact, shared in the call as a real page'],
  [g('artifact', m.agenda + 3) + 4.2, m.critic, 'The agenda, published after the release. As usual'],
  [m.critic + 0.2, m.objection, 'A critic, new to the app, reviews the drafts'],
  [m.objection + 0.2, m.question, 'Every meeting has one'],
  [m.question + 0.2, m.decision, 'A question for the person, right in the call'],
  [m.decision + 0.2, m.v2, 'Margot decides. No follow-up meeting is scheduled'],
  [m.v2 + 0.2, m.record, 'Published again: the page follows its new version'],
  [m.record + 0.2, m.record + 4, 'Margot starts recording this very call'],
  [m.record + 4.2, total - 0.1, 'This meeting could have been a release note'],
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
const wav = require(path.join(process.env.MUSIC, 'promo-music.js'))(path.join(tmp, 'music.wav'), all + 0.5, [m.launch, m.tabs, m.screens, m.report1, m.knock, m.more, m.agenda, m.critic, m.objection, m.decision, m.v2, m.record, total].map((x) => x + 0.1));
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(take, 'call.webm'), '-loop', '1', '-t', String(END), '-i', card, '-i', path.join(take, 'voices.webm'), '-i', wav, '-filter_complex_script', script, '-map', '[out]', '-map', '[aout]',
  '-c:v', 'libx264', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-crf', '19', '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-t', all.toFixed(2), '-movflags', '+faststart', dest], { stdio: 'inherit' });
const at = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
console.log(dest, all.toFixed(1) + 's'); console.log(Object.entries(m).map(([n, t]) => at(t) + ' ' + n).join('\n'));
fs.rmSync(tmp, { recursive: true, force: true });
