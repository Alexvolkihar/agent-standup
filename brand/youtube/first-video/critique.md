# First video: the critic's objections

Read as a developer who runs coding agents all day, has never heard of Agent Standup, and gives a video three seconds. I read only `script.md`, `video-description.md`, `thumbnail.png` and `channel-description.md`. I have not seen the app or the recording.

## Objection 1: the same joke three times, and nobody says what the app is

The words concerned:

- Thumbnail: "This video made itself"
- Title: "This video was made by the Claude Code agents you see in it"
- Hook H1: "The agents in this call are making this video"

Those are the three places a stranger looks before deciding, and all three say the video is clever. None says what I would get. The script claims H1 "names the product in two words (agents, call)": it does not, because a stranger does not know that "call" is the product. The thumbnail has no word and no shape that says code: a round character with a headset could be a children's channel.

The line that would stop me is already written and was turned down: H2. Give each place its own job.

| Place | Its job | Put instead |
|-------|---------|-------------|
| Thumbnail | The joke | "Agents made this video", with "Agents" in yellow. Keep the picture inside the picture. |
| Title | What it is, in the name of the tool I run | "Claude Code agents as a live team call. They made this video" (60) |
| Hook | What I am looking at on this frame | "Your coding agents, shown as a live team call" (H2, 45) |

French title: "Vos agents Claude Code en appel d’équipe. La vidéo est d’eux" (60). French hook: the existing H2.

The same fault is in the first line of the YouTube description, the only one shown before "more": "The release video of Agent Standup 1.31.0, made by the agents you watch in it: this is the real call of the session that produced it." Put the third paragraph first: "Agent Standup shows your Claude Code, Codex and Mistral Vibe sessions as a live team call. Free and open source: https://agent-standup.com". The sentence about the video goes second.

## Objection 2: with no sound, half the captions point at things the viewer cannot identify

Five captions of fifteen are about the video (H1, A1, A2, F1, F2), and the ones about the app lean on words only the team knows.

| # | Words concerned | Why it fails silent | Put instead | Français |
|---|-----------------|---------------------|-------------|----------|
| B1 | "Margot hands the job to three agents" | Margot is never introduced. A person? The author? | "Margot, the main agent, briefs three sub-agents" (47) | "Margot, l’agent principal, lance trois sous-agents" (50) |
| D1 | "The other session is done: someone leans in" | "someone" is nobody. Who, from where, to say what? | "Second session done: its agent leans in to tell you" (51) | "Deuxième session finie : son agent vient le dire" (48) |
| D2 | "One click there: the file it made, under the call" | "there" and "it" have nothing to point at. | "One click takes you there. Its new file is listed" (49) | "Un clic vous y emmène. Son fichier est dessous" (46) |
| E1 | "The agents report back to Margot, out loud" | The viewer with no sound is told about a sound. Nothing before this says the app speaks. | "Sound on: the app reads each report aloud" (41) | "Avec le son : l’app lit chaque rapport à voix haute" (51) |
| E2 | "A critic new to the app objects. Margot decides" | Objects to what? Decides what? The whole scene is heard, not seen. | "The critic: say what the app is before the joke" (47), then a new E3 with Margot's decision in her own words | "Le critique : dire ce qu’est l’app avant la blague" (50) |

E3 cannot be written before the call: it must quote what Margot really says.

## Objection 3: four claims a reader cannot check, or can check and find false

- A2, "Nothing is staged: this call is the footage". The file it sits in is a scene-by-scene script, with a second session that starts on cue and a critic who was invited. A developer will say it is staged, and will be right. What is true is that nothing is faked. Put: "Not a mockup: a real session, recorded as it ran" (48). French: "Pas une maquette : une vraie session, telle quelle" (50).
- Thumbnail, "This video made itself". A1 says the opposite two seconds later: "One order in Claude Code". Somebody typed that order. "Agents made this video" is as short and holds.
- Title and description, "made by the agents". From these four files the agents wrote a script, a description and a thumbnail, and Margot starts a recording. I cannot tell who puts the captions on the picture, cuts it and uploads it. In "How this video was made", add one sentence that says exactly what a person did, starting with: "A person typed one order and published the result." If a person also set the captions or cut the recording, say so there.
- Channel description, "with real voices" and "No configuration, no extra tokens, no cloud". "real voices" reads as human voices; the video description says the true thing: "read aloud by the app". The three "no" come with no reason, so they read as a slogan. Put the reason first: "It reads the session files these tools already write on your computer, so there is nothing to configure and no extra tokens are spent." Keep "no cloud" only if nothing at all leaves the machine, voices included.

## Smaller points

- End card: a convinced developer runs a command, not a website. Add "npx @double_geste/agent-standup --open" (38) under G2.
- "Token counts are live again": to a newcomer, "again" announces that they were broken. Put: "Token counts move live on the tiles and in the header."
- Chapters are all "0:00" and do not follow the script: there is no chapter for the visitor (scene D), the one feature of 1.31.0 someone would jump to.
- The strongest words in the four files are "who needs your answer" (channel description) and "working, or your turn" (C2). They are in neither the title, the thumbnail nor the first line of the description. If one more line is added anywhere, it is this one.
- The thumbnail shows five small characters under Margot; the captions say "three agents". Check that the five are the cast of this call: three agents, the critic, the visitor.
- H3 says "Three agents made this video": there are four with the critic, plus a second session.
- Channel description, "Margot leads the call": same fault as B1. Put: "Margot, the main agent, leads the call".
- "turns your sessions into a live team call" (channel) against "shows your sessions as a live team call" (video). "turns into" suggests the app changes the sessions. Use "shows" in both.
- "not affiliated with" (channel) against "not affiliated with or endorsed by" (video): one sentence for both.
- Channel keywords "pair programming" and "live coding" bring the wrong searcher. "sub-agents" and "multi-agent", which are in the video tags, are missing there.

## Keep as it is

- The idea. A call that records itself is a good reason to watch to the end, once the viewer knows what the call is.
- F1 and F2, "Margot starts recording this very call" and "That recording is what you are watching". This is where the joke belongs: as the payoff, not as the opening.
- A1, "One order in Claude Code: make this video". It names the tool and says how little it took.
- C1 and C2. Plain, visible on screen, and "your turn" is the benefit.
- The nested picture of the thumbnail and the big type, readable at small size.
- The description's "Three ways to run it", with the npx line, and "It reads the session files these tools already write on your computer."
- "Nothing from 1.31.1 is announced", and the "Before publishing" list: the writer already named the chapters and the release page as open.
