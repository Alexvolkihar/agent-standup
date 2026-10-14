# First video: title and description

Release announced: Agent Standup 1.31.0. Every fact below is in `README.md` or in the `## 1.31.0` entry of `CHANGELOG.md`. Nothing from 1.31.1 is announced.
First version by the title agent of the session; revised after the critic (`critique.md`): what the app is comes first, the joke second, and the description says what a person did.

## Title

**Claude Code agents as a live team call. They made this video** (60 characters)

French: **Vos agents Claude Code en appel d’équipe. La vidéo est d’eux** (60)

The other candidates, kept for A/B tests:

1. This video was made by the Claude Code agents you see in it (59): the title agent's first pick
2. My coding agents made this video. This is their call (52)
3. Several Claude Code sessions, one team call: Agent Standup (58)
4. Agent Standup 1.31.0: a tab for each of your agent sessions (59)

## Description

```text
Agent Standup shows your Claude Code, Codex and Mistral Vibe sessions as a live team call. Free and open source: https://agent-standup.com
This is the release video of 1.31.0, and the call you watch is the real session that made it.

The lead gives orders, sub-agents join, share their screen and report back out loud. The app only reads the session files these tools already write on your computer.

New in 1.31.0
- Several sessions at once: each one has a tab under the header of the call, with its state. Click a tab to move the call there.
- A visitor: when another session has a question, waits for your go-ahead or is done, someone from there leans in at the edge of the call and says which one.
- Files made for you: when a turn ends, the files the session created for you show in one line under the call.
- Token counts move live on the tiles and in the header.

Three ways to run it
- VS Code extension: Extensions view, search "Agent Standup", Install.
- Terminal, no install and no editor (Node 18+): npx @double_geste/agent-standup --open
- Desktop app (macOS): download it from the release page.

Links
Website and download: https://agent-standup.com
Source code: https://github.com/Atoll92/agent-standup

How this video was made
A person typed one order in Claude Code and published the result. Margot, the main agent, handed the video to three sub-agents (captions, title and description, thumbnail) while a second session wrote the channel description. A fourth agent, who had never seen the app, criticised the drafts, and Margot decided.
The main agent then wrote the recording script: it replays the records of that session in the app, faster than they happened (about fourteen minutes in under three) and leaving some out: its own research and its work on the recording, and a few lines of the agents. No record was added and no text was changed. It set the captions and the music too. The voices are the app's, reading the first sentence of what each agent wrote. The short lines in between ("Got it, boss.", "Perfect, thanks Annie.") are the app's own little lines, as in every call.

Chapters
0:00 One order in Claude Code
0:10 Margot briefs three sub-agents
0:44 Each agent shares its screen
1:01 A visitor from the second session
1:14 A report, read aloud
1:35 A critic joins
2:03 The objection
2:22 Margot decides
2:33 Recording this call

Unofficial community project, not affiliated with or endorsed by Anthropic, OpenAI or Mistral AI.
```

## Description (français)

```text
Agent Standup montre vos sessions Claude Code, Codex et Mistral Vibe comme un appel d’équipe en direct. Gratuit et open source : https://agent-standup.com/fr/
Voici la vidéo de sortie de la 1.31.0, et l’appel que vous regardez est la vraie session qui l’a faite.

La lead donne les ordres, les sous-agents rejoignent l’appel, partagent leur écran et rendent compte à voix haute. L’application lit seulement les fichiers de session que ces outils écrivent déjà sur votre ordinateur.

Nouveau dans la 1.31.0
- Plusieurs sessions à la fois : chacune a son onglet sous l’en-tête de l’appel, avec son état. Un clic sur un onglet y déplace l’appel.
- Un visiteur : quand une autre session pose une question, attend votre accord ou a terminé, quelqu’un de là-bas se penche au bord de l’appel et dit laquelle.
- Les fichiers faits pour vous : à la fin d’un tour, les fichiers que la session a créés pour vous s’affichent sur une ligne sous l’appel.
- Les compteurs de tokens bougent en direct, sur les vignettes et dans l’en-tête.

Trois façons de le lancer
- Extension VS Code : vue Extensions, chercher « Agent Standup », Installer.
- Terminal, sans installation et sans éditeur (Node 18+) : npx @double_geste/agent-standup --open
- Application de bureau (macOS) : à télécharger depuis la page de la version.

Liens
Site et téléchargement : https://agent-standup.com/fr/
Code source : https://github.com/Atoll92/agent-standup

Comment cette vidéo a été faite
Une personne a tapé une consigne dans Claude Code, puis a publié le résultat. Margot, l’agent principal, a confié la vidéo à trois sous-agents (légendes, titre et description, miniature) pendant qu’une deuxième session écrivait la description de la chaîne. Un quatrième agent, qui n’avait jamais vu l’application, a critiqué les brouillons, et Margot a tranché.
L’agent principal a ensuite écrit le script d’enregistrement : il rejoue dans l’application les enregistrements de cette session, plus vite qu’ils ne se sont produits (environ quatorze minutes en moins de trois) et en en laissant de côté : ses propres recherches et son travail sur l’enregistrement, et quelques phrases des agents. Aucun enregistrement n’a été ajouté, aucun texte modifié. Il a aussi posé les légendes et la musique. Les voix sont celles de l’application, qui lit la première phrase de ce que chaque agent a écrit. Les petites phrases entre deux (« Got it, boss. ») sont celles de l’application, comme dans tout appel. L’appel est en anglais.

Chapitres
0:00 Une consigne dans Claude Code
0:10 Margot lance trois sous-agents
0:44 Chaque agent partage son écran
1:01 Un visiteur de la deuxième session
1:14 Un rapport, lu à voix haute
1:35 Un critique arrive
2:03 L’objection
2:22 Margot tranche
2:33 L’enregistrement de cet appel

Projet communautaire non officiel, ni affilié à Anthropic, OpenAI ou Mistral AI, ni approuvé par eux.
```

## Tags

Agent Standup, Claude Code, Codex, Mistral Vibe, AI coding agents, coding agents, sub-agents, multi-agent, Claude Code sub-agents, agent sessions, VS Code extension, developer tools, open source, AI agents, terminal

## Before publishing

- The video was recorded with 1.31.0 plus one fix: since Claude Code 2.1.293 a sub-agent hands its report back through a call of its own, and 1.31.0 does not read it, so its reports are not said. The fix is in the working tree, for 1.31.1. Release it before the video goes out, or a viewer who installs the app will not hear what the video lets them hear.
- The desktop app line points to "the release page": the release must carry the macOS zip when the video goes out.
- Upload `thumbnail.png` as the thumbnail.
- The chapter times are those of `agent-standup-1.31-first-video.mp4` as rendered on 2026-10-14. A new take moves them: `making-of/assemble.js` prints the new ones.
- Nobody has listened to the video yet: the sound was measured (voices near -19 dB, music 8 dB under them and stepping back while someone speaks), not heard.
