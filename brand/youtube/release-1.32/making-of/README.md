# How the 1.32.0 release video was made

The video is the call of the Claude Code session that made it (2026-10-14, session `a97c23fb-4aa2-4c92-9eda-cc2e50582f6b`, from Arthur's request onwards), its four sub-agents (talking points, script, thumbnail, critic) and a second session started from the command line that wrote `video-description.md` (`bc389b92-6969-4077-8129-9b8858114334`). Same recorder as the first video (`../first-video/making-of/`).

1. `capture.js` starts the released app (`git archive v1.32.0`, `node_modules` linked) on a temporary projects folder and writes the real records of those sessions into it again, at the times `cues.js` gives. The person is Arthur's own picture (`you.png`, `you-talk.png` from `~/.agent-standup/characters`, the vampire); everyone else is the app's own cast.
2. `endcard.js` renders the last picture from `brand/link-preview.svg`, now reading "Agent Standup 1.32".
3. `assemble.js` adds the captions (the scriptwriter's `script.md`, as the critic and the recorded scenes amended them), the end card and the music, and prints the chapter times.

```sh
# from the repo root; needs puppeteer-core, Chrome, ffmpeg, and the natural voices installed
CAP=120 APP=<app> SRC=<session files> OUT=<take> SHOTS=<take>/shots SECOND=bc389b92-6969-4077-8129-9b8858114334 CHARS=$HOME/.agent-standup/characters \
  node brand/youtube/release-1.32/making-of/capture.js brand/youtube/release-1.32/making-of/cues.js
node brand/youtube/release-1.32/making-of/endcard.js "$PWD" brand/youtube/release-1.32/making-of/endcard.png
MUSIC=$PWD/scripts node brand/youtube/release-1.32/making-of/assemble.js <take> brand/youtube/release-1.32/making-of/endcard.png out.mp4
```

The take the video was cut from is `reports/release-video/take3/` (git-ignored); `SRC` was `reports/release-video/src/`, copies of the session files (not in the repo: the lead's file holds the whole day's conversation).

What differs from the first video, and why:

- **No record is added and no text is changed; some are left out** (named at the top of `cues.js`): the recorder work, a second session Claude Code refused to start, the page rules loaded before writing the agenda, the harness's own messages around a report, all but one progress line per agent, and the second round of fixes after the critic.
- **`CAP=120`**: in 1.32.0 everyone speaks in turn, and with nothing queued the app reads up to 260 characters of a line. The recorder caps that at about one sentence, as the app itself does when a call is behind; the bubbles still show the whole text. Without it the take ran 8 min 28.
- **Join**: 1.32.0 asks to join again when the first session appears; the cue sheet clicks it.
- **The agenda** is a real artifact published from the session (https://claude.ai/artifact/VeLTvsoefVBAvgjCoAJjuK, private). It needs its own moment in the cue sheet: the thumbnail Margot read right after it would otherwise take the screen first.
- **Some of the lead's lines are thoughts**, not speech: the session recorded a few of them (the opening "Good morning, everyone" among them) as a paraphrase in the lead's thinking. The call shows them as thoughts.
