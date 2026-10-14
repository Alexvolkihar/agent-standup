# Release 1.32.0 video: the critic's amendments

I am reading as a stranger scrolling YouTube, with nothing but the drafts and the `## 1.32.0` changelog.

The script got the hook right: H2 says what the app is before the joke. The thumbnail and the title did not get the same fix, and they are what a stranger sees before deciding to click. The office humour is kind throughout and aimed at meetings, not at the viewer. Keep "This meeting could have been a release note", "Practically a corner office" and "like a booked meeting room".

## Amendments, most important first

### 1. Thumbnail headline: say what the app is
At 168 px wide (YouTube search on a phone) the headline is the only text you can read. The faces read as a cute game or a kids' meeting app, and nothing says AI or code.

- As it is: **Shipped. Let's circle back.**
- As it should be: **Your AI agents, in a meeting.**

That is 29 characters, against 27 now, so it fits at the same type size. Keep "Shipped." in yellow somewhere smaller, or let the agenda card carry the joke. It already does: "~~Ship 1.32~~ / Discuss it / Plan the next meeting".

### 2. Title: lead with the app, and fix "four languages"
"The team" names nobody, so a stranger cannot tell what team or what product. "Shipped four languages" reads as programming languages, or as a translation of the app, which was already in about a dozen languages. What 1.32.0 adds is the natural voices speaking French, Spanish and Brazilian Portuguese, on top of English.

- As it is: **The team shipped four languages and held a meeting about it**
- As it should be: **Claude Code agents as a team call, now talking in four languages** (64 characters)

French: **Les agents de Claude Code en appel d'équipe, qui parlent quatre langues**

### 3. "Screens" caption: bigger than the changelog
The changelog says that only the author of a published artifact shares it on screen. Not every agent shares its screen. The script itself lists artifacts as "left out on purpose", yet this caption claims more than the artifact feature does.

- As it is: **Each agent shares its real screen. No slides**
- As it should be: **An agent shows the page it published. No slides** (47)

French: **Un agent montre la page publiée. Pas de slides** (46)

Only keep it if this call actually publishes a page (the `agenda.html` in this folder suggests it might). If it doesn't, cut the caption.

### 4. Cowork caption: say what it is, and where it works
A stranger does not know what Cowork is. The changelog also says "Checked on macOS; not yet on Windows or Linux". Neither this caption nor the Cowork bullet in `video-description.md` says so.

- As it is: **Cowork sessions are in the list now too**
- As it should be: **Cowork sessions, from the Claude app, join too (Mac)** (52)

French: **Les sessions Cowork, de l'app Claude, aussi (Mac)** (49)

In the description, end the Cowork bullet with: "Checked on macOS so far." Do the same in French: « Vérifié sur macOS pour l'instant. »

### 5. Thumbnail timer: it sits under YouTube's duration badge
"1:47:03" is in the bottom-right corner, which is where YouTube puts the video's length. Either the badge covers it, or a viewer reads it as a video of an hour and 47 minutes. The joke (the meeting ran long) is good, but it is in the wrong corner.

- As it is: strip reads **● Post-release sync · 1.32 … 1:47:03**, with the timer at the right end.
- As it should be: **● 1:47:03 · Post-release sync · 1.32**, with the timer moved to the left end of the strip. Nothing important should sit in the bottom-right 20 % of the frame.

## Noted, not amended
- In points.md, "Attendance is mandatory" (Cowork) contradicts the changelog's off switch (`AGENT_STANDUP_COWORK=off`). "Attendance is optional. There is a switch." is just as dry and true.
- The caption "briefs three sub-agents" is right for the call. The thumbnail shows five colleagues plus Margot, which is fine for a poster.
