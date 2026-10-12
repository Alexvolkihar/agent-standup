// Original, copyright-free upbeat music for the short videos, synthesised from scratch (no samples, no downloads).
// 120 bpm, C - G - Am - F: a kick on every beat, claps on 2 and 4, off-beat hats, a bouncing bass, chord stabs and a small pentatonic hook with an echo.
// At each time given in `hits` (the scene changes) a noise sweep rises into a crash and the hook starts over.
//   node scripts/promo-music-upbeat.js out.wav 40 12.5,24,31     → 40 s of music with hits at 12.5 s, 24 s and 31 s
const fs = require('fs');
const SR = 44100, TAU = Math.PI * 2;
const hz = (m) => 440 * 2 ** ((m - 69) / 12);

function make(file, seconds, hits = [], bpm = 120) {
  const N = Math.round(seconds * SR), beat = 60 / bpm, bar = beat * 4;
  const kick = new Float32Array(N), L = new Float32Array(N), R = new Float32Array(N), lead = new Float32Array(N);
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const add = (buf, t, dur, fn, gain) => { const a = Math.max(0, Math.round(t * SR)), b = Math.min(N, Math.round((t + dur) * SR)); for (let i = a; i < b; i++) buf[i] += gain * fn((i - a) / SR, (i - a) / (b - a)); };
  const both = (t, dur, fn, gain, spread = 0) => { add(L, t, dur, fn, gain * (1 - spread)); add(R, t + 0.003, dur, fn, gain * (1 + spread)); };
  const saw = (f, t, n = 6) => { let s = 0; for (let k = 1; k <= n; k++) s += Math.sin(TAU * f * k * t) / k; return s * 0.6; };
  const CH = [[36, [60, 64, 67]], [43, [59, 62, 67]], [45, [60, 64, 69]], [41, [60, 65, 69]]];   // [bass root, chord] for C, G, Am, F
  const HOOK = [   // per bar: [beat, note] of the hook, C major pentatonic, the last bar answers the first
    [[0, 76], [0.75, 79], [1.5, 81], [2.5, 79], [3, 76]], [[0, 74], [0.75, 76], [1.5, 79], [2.5, 74]], [[0, 76], [0.75, 79], [1.5, 81], [2.5, 84], [3.25, 81]], [[0, 81], [0.75, 79], [1.5, 76], [2.5, 74], [3, 72]],
  ];
  const bars = Math.ceil(seconds / bar) + 1, next = (t) => hits.find((h) => h > t);
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar, [root, chord] = CH[b % 4], intro = b < 2, toHit = next(t0), brk = toHit != null && toHit - t0 <= bar && toHit - t0 > 0.2, outro = t0 > seconds - 4.5;   // brk: the bar that leads into a scene change thins out
    for (let k = 0; k < 4; k++) if (!(brk && k === 3)) add(kick, t0 + k * beat, 0.32, (t) => Math.sin(TAU * (46 + 120 * Math.exp(-t * 30)) * t) * Math.exp(-t * 9) * Math.min(1, t / 0.002), 0.95);
    if (!intro) for (const k of [1, 3]) { let lp = 0; both(t0 + k * beat, 0.2, (t) => ((lp += 0.55 * (rnd() - lp)) * 1.2 + 0.25 * Math.sin(TAU * 190 * t)) * (Math.exp(-t * 20) + 0.5 * Math.exp(-Math.abs(t - 0.012) * 400)), 0.3, 0.08); }   // clap
    for (let k = 0; k < 8; k++) { const off = k % 2 === 1; both(t0 + (k / 2) * beat, off ? 0.09 : 0.04, (t) => rnd() * Math.exp(-t * (off ? 45 : 110)), (off ? 0.075 : 0.035) * (intro ? 0.6 : 1), k % 4 === 1 ? 0.3 : -0.2); }   // hats, louder off the beat
    for (let k = 0; k < 8; k++) { if (brk && k >= 6) continue; const m = root + (k % 2 ? 12 : 0) + (k === 7 ? 7 : 0); both(t0 + (k / 2) * beat, beat * 0.46, (t, p) => saw(hz(m), t, 5) * Math.exp(-t * 5) * Math.min(1, t / 0.005) * Math.min(1, (1 - p) * 6), 0.2); }   // bass: root and its octave in eighth notes
    if (!intro) for (const k of [0.5, 1.5, 2.5, 3.5]) for (const [i, m] of chord.entries()) add(i % 2 ? L : R, t0 + k * beat, 0.26, (t) => saw(hz(m + 12), t, 4) * Math.exp(-t * 13) * Math.min(1, t / 0.003), 0.055);   // chord stabs off the beat
    if (b % 2 === 0) for (const m of chord) for (const [buf, det] of [[L, 0.996], [R, 1.004]]) add(buf, t0, bar * 2.05, (t, p) => Math.sin(TAU * hz(m) * det * t) * Math.min(1, t / 0.6) * Math.min(1, (1 - p) * 5), 0.018);   // a quiet pad under it all
    if (!intro && !outro) for (const [k, m] of HOOK[b % 4]) add(lead, t0 + k * beat, 0.42, (t) => (Math.sin(TAU * hz(m) * t) + 0.5 * Math.sin(TAU * hz(m) * 2 * t) + 0.22 * Math.sin(TAU * hz(m) * 3 * t)) * Math.exp(-t * 7) * Math.min(1, t / 0.004), 0.11);
  }
  for (const h of hits) {   // a sweep that rises into the change, then a crash on it
    let lp = 0; both(h - 0.9, 0.9, (t, p) => (lp += (0.04 + 0.5 * p * p) * (rnd() - lp)) * p * p, 0.3);
    both(h, 1.4, (t) => rnd() * Math.exp(-t * 3.2) * Math.min(1, t / 0.002), 0.13, 0.1);
    add(lead, h, 1.5, (t) => (Math.sin(TAU * hz(84) * t) + 0.4 * Math.sin(TAU * hz(84) * 2.76 * t)) * Math.exp(-t * 3) * Math.min(1, t / 0.003), 0.09);
  }
  const d = Math.round(beat * 0.75 * SR);   // the hook goes through a dotted-eighth echo, a little wider on the right
  for (let i = 0; i < N; i++) { const e = lead[i] + (i > d ? 0.38 * lead[i - d] : 0) + (i > 2 * d ? 0.15 * lead[i - 2 * d] : 0); L[i] += e * 0.95; R[i] += e * 0.85 + (i > 500 ? 0.14 * lead[i - 500] : 0); }
  // everything but the kick ducks a little on each beat (the "pumping" of dance music), then the kick is added, a soft clip, fades, and the level is set
  let peak = 0; const fi = 0.25 * SR, fo = 2.6 * SR, beatN = beat * SR;
  for (let i = 0; i < N; i++) {
    const tk = (i % beatN) / SR, duck = 1 - 0.42 * Math.exp(-tk * 10), g = Math.min(1, i / fi) * Math.min(1, (N - i) / fo);
    L[i] = Math.tanh((L[i] * duck + kick[i] * 0.55) * 1.5 * g); R[i] = Math.tanh((R[i] * duck + kick[i] * 0.55) * 1.5 * g); peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const buf = Buffer.alloc(44 + N * 4), k = 0.85 / (peak || 1);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) { buf.writeInt16LE(Math.round(L[i] * k * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(R[i] * k * 32767), 46 + i * 4); }
  fs.writeFileSync(file, buf); return file;
}
module.exports = make;
if (require.main === module) { const [f, s, c] = process.argv.slice(2); console.log(make(f || 'music.wav', +s || 40, (c || '').split(',').filter(Boolean).map(Number))); }
