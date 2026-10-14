# How the first video was made

The video is the call of the Claude Code session that made it (2026-10-13, session `2a93a3c8-85bb-4755-9394-0920710fee69`, its four sub-agents, and the second session `263cf073-9f04-4c45-b295-b72ca230439b` that wrote the channel description).

Three steps:

1. `capture.js` starts the app on a temporary projects folder and writes the real records of those sessions into it again, at the times `cues.js` gives. The app follows them as a live call. The page (1440 x 810) is recorded at 1920 x 1080, and the sound the app plays (the very natural voices and the sound effects) is recorded beside it. Output: `call.webm`, `voices.webm`, `take.json` (the marks and what was said).
2. `endcard.js` renders the last picture from `brand/link-preview.svg`.
3. `assemble.js` adds the captions, the end card and the music (`scripts/promo-music.js`, stepping back while someone speaks), and prints the chapter times.

```sh
# from the repo root; needs puppeteer-core, Chrome, ffmpeg, and the very natural voices installed
APP=<folder of the app to record> SRC=<folder with the session files> OUT=<take folder> SHOTS=<take folder>/shots node brand/youtube/first-video/making-of/capture.js brand/youtube/first-video/making-of/cues.js
node brand/youtube/first-video/making-of/endcard.js . endcard.png
MUSIC=scripts node brand/youtube/first-video/making-of/assemble.js <take folder> endcard.png out.mp4
```

- `APP` was `git archive v1.31.0` plus `report-fix-on-1.31.0.patch` (one line of `server.js`: a sub-agent's report is read from its `SubagentHandback` call), with `node_modules` linked from the repo.
- `SRC` holds copies of `<session>.jsonl`, `<session>/subagents/` and `<second session>.jsonl` from `~/.claude/projects/-Users-arthur-Documents-AgentStandup/`. They are not in the repo: the lead's file holds the whole conversation, not only what the video shows.
- The take the published video was cut from is in `reports/youtube-first-video/take/` (git-ignored, 51 MB). Changing a caption needs step 3 only.

What `cues.js` leaves out of the session is named at its top. No record is added and no text is changed; each record is written with the time it is written at, so about fourteen minutes play in under three.

Two things the app decides, which a new cue sheet must respect (1.31.0):

- A visitor for a session that is done comes only when that session went straight from working to done in the list the page asks for every 3 s, six seconds after its last line, and leaves after 16 s.
- When the call comes back to a session, it says everything written there since it left (16 events at most), reports included.
