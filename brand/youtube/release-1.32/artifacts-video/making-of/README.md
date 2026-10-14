# How the artifacts video was made

The call of a real session (2026-10-14, session `2a93a3c8-85bb-4755-9394-0920710fee69`, from Arthur's "redo the whole video" onwards), its three sub-agents (poster, bingo card, chart; their pages are in `../../artifacts/`), replayed in the released app (`git archive v1.32.0`, `node_modules` linked).

1. `capture.js` writes the real records again into a temporary projects folder at the times `cues.js` gives; the app follows them as a live call. The recorder pins the bingo card and plays it, pins the chart, steps back to the poster, and lets the poster's third version arrive while pinned. It logs the start and the end of every spoken line, and any line the app reads short ("CUT"; there were none).
2. `edit.js` with `edl.js` cuts the take: each kept line whole, from its first sound to the moment the app ends it, and never past the start of the next line; the quiet moments sped up; zooms on the page; captions; the 128 bpm upbeat music under the voices; `poster-1920.png` (the agents' poster) to open, the 1.32 end card to close. It refuses a take with a line read short.
3. `thumbnail.js` makes `../thumbnail.png` from a frame of the take (`bingo-frame.jpg`).

```sh
CAP=200 APP=reports/release-video/app SRC=reports/artifacts-video/src OUT=reports/artifacts-video/take1 SHOTS=reports/artifacts-video/take1/shots CHARS=$HOME/.agent-standup/characters \
  node brand/youtube/release-1.32/artifacts-video/making-of/capture.js brand/youtube/release-1.32/artifacts-video/making-of/cues.js
node brand/youtube/release-1.32/artifacts-video/making-of/edit.js reports/artifacts-video/take1 brand/youtube/release-1.32/artifacts-video/making-of/edl.js out.mp4
```

The take and the copies of the session files are in `reports/artifacts-video/` (git-ignored). What the video leaves out is named at the top of `cues.js` and `edl.js`. The poster's second version is left out: it was made by a script, and the call can only rebuild a page from Write and Edit calls, so it showed that version with the first one's content. The agent was asked for a third version made with Edit, which the call shows.
