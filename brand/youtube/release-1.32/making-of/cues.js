// The cue sheet of the 1.32.0 release video: which real records of the session that made it are written again, in which order, and what the pointer does.
// The order of the records is the order they were written in. Left out: the lead's work on the recorder itself, a second session that Claude Code refused to start, the skill and page rules the lead
// loaded before writing the agenda, the messages the harness writes around a sub-agent's report, all but one line of progress per agent, and the second round of fixes after the critic
// (the thumbnail's timer, a caption, and a back-and-forth about "(Mac)" that ended where it started).
module.exports = ({ feed, find, drop, streams, MAIN, SECOND }) => {
  const at = (text, from) => find('main', text, from), after = (text, from) => { const i = at(text, from); return i; };
  const ask = at('make a video same as the others'), think1 = at('Good morning', ask), launch = at('"Talking points"', ask);
  const TP = 'a004', SW = 'a8c4', TH = 'a180', CR = 'a429';   // the four sub-agents: talking points, scriptwriter, thumbnail, critic
  const AG = { [TP]: 'a004886b17240988b', [SW]: 'a8c4f679140f8151d', [TH]: 'a180fd2a0533ce54e', [CR]: 'a4293ac5d593f572a' };
  for (const k of [TP, SW, TH, CR]) drop(k, 2);
  const says = (k, from, to) => { const out = []; for (let i = from; i <= to; i++) { const c = streams[k].rec[i] && streams[k].rec[i].message && streams[k].rec[i].message.content; if (Array.isArray(c) && c.some((b) => b.type === 'text')) out.push(i); } return out; };
  const keepOne = (k, from, to, keep = 1) => says(k, from, to).slice(keep).forEach((i) => drop(k, i));   // one line of progress per agent: everyone speaks in turn, and the call would fall behind its own voices
  keepOne(TP, 13, 23); keepOne(SW, 13, 39, 1); keepOne(TH, 13, 48); keepOne('second', 4, 22); keepOne(CR, 13, 38);   // the harness's reminder of how to report, written as a second order
  drop(TH, 80);   // the harness asking for the report again
  const note = (k) => at('<task-id>' + AG[k]);   // Claude Code telling the lead that this agent has stopped
  const hb = (k, from = 0) => { const R = streams[k].rec; for (let i = from; i < R.length; i++) if (JSON.stringify(R[i].message || '').includes('"name":"SubagentHandback"')) return i; throw new Error('no report in ' + k); };
  const L = {
    prep: at('While the team works'), second: at('env -u CLAUDECODE', ask), points: at('Seven talking points, a joke each'), release: at('goes in the video as it is'),
    more: at('also demonstrate new features'), good: at('Good idea: nothing says corporate'), readPts: at('release-1.32/points.md', at('Good idea: nothing says corporate')), write: at('"name":"Write"', at('Good idea: nothing says corporate')),
    shipped: at('is the most honest thing'), think2: at('The thumbnail checks out'), critic: at('"description":"Critic"'), reading: at('The critic is reading the drafts'), cat: at('cat /private/tmp', at('The critic is reading the drafts')), back: at('The second session is back'),
    right: at('The critic is right about four'), client: at('The client has spoken'), send1: at('"to":"a180fd2a0533ce54e"', at('The client has spoken')), again: at('publish it again'), caption: at('That caption goes in'), timer: at('The meeting timer has moved out'),
    close: at('Recording starts now: this call'),
  };
  const res = (i, n = 1) => { const ids = []; for (const b of streams.main.rec[i].message.content) if (b.type === 'tool_use') ids.push(b.id); const out = []; for (let j = i + 1; j < streams.main.rec.length && out.length < (n || ids.length); j++) { const c = streams.main.rec[j].message && streams.main.rec[j].message.content; if (Array.isArray(c) && c.some((b) => b.type === 'tool_result' && ids.includes(b.tool_use_id))) out.push(j); } return out; };
  const both = (i) => { feed('main', i); for (const j of res(i, 0)) feed('main', j); };   // a call and its answer
  const spread = (steps, name, from, to, t1, t2) => { const R = streams[name].rec, ts = (i) => Date.parse(R[i].timestamp || 0) || 0; let a = 0, b = 0; for (let i = from; i <= to; i++) if (ts(i)) { a = a || ts(i); b = ts(i); } for (let i = from; i <= to; i++) { const t = ts(i) || a; steps.push([t1 + (b > a ? (t - a) / (b - a) : 0) * (t2 - t1), () => feed(name, i)]); } return steps; };
  return {
    before() {},
    async run({ mark, sleep, play, seen, click, point, said, quiet, inSession, page }) {
      mark('start'); await sleep(1500);
      feed('main', ask); mark('order');
      await page.waitForFunction(() => !!document.querySelector('#gate.on') || window.__log.length > 0, { timeout: 15000, polling: 100 }).catch(() => {}); if (await page.$('#gate.on')) await click('#gB');   // 1.32.0 asks to join again once a session appears
      await said('make a video'); await quiet(500);
      feed('main', think1); await sleep(2200);   // the lead's opening line is on record as a thought only: shown, not said

      // the launch: three agents, then a second session
      mark('launch'); for (const i of [launch, launch + 1, launch + 2]) feed('main', i); for (const j of res(launch + 2, 0).concat(res(launch + 1, 0), res(launch, 0)).sort((a, b) => a - b)) feed('main', j);
      for (const k of [TP, SW, TH]) feed(k, 0);
      await sleep(2500); await quiet(800);
      feed('main', L.prep); await said('While the team works'); await quiet(400);
      both(L.second); feed('second', 0, 4);
      await seen(() => document.querySelectorAll('#tabs .stab:not(.all)').length > 1); mark('tabs'); await sleep(2600);
      await click('#tabs .stab:not(.all)[data-k$="' + MAIN + '"]'); mark('pin'); await sleep(2600);   // a click on the tab of the meeting pins the call there

      // everyone at work, each on a real screen
      mark('screens');
      await play(spread(spread(spread(spread([], TP, 13, 23, 0, 7), SW, 13, 39, 1, 17), TH, 13, 48, 2, 21), 'second', 5, 22, 3, 18));
      feed(TP, hb(TP), hb(TP) + 1); feed('main', note(TP)); feed('main', L.points); mark('report1'); await said('Seven talking points'); await quiet(500);
      feed(SW, hb(SW), hb(SW) + 1); feed('main', note(SW)); feed('main', L.release); mark('report2'); await said('This meeting could have been'); await quiet(500);
      feed('second', 23, 25); mark('done2');   // the second session ends its turn: someone from there leans in, while the call stays pinned
      await seen(() => !!document.querySelector('#visit.on'), undefined, 25000).catch(() => {}); mark('knock'); await sleep(3200);

      // the person asks for more; the agenda becomes an artifact
      feed('main', L.more); mark('more'); await said('demonstrate'); await quiet(400);
      feed('main', L.good); await said('Good idea'); await quiet(300); both(L.readPts); await sleep(1500); both(L.write); mark('write'); await sleep(3800);
      feed(TH, hb(TH), hb(TH) + 1); feed('main', note(TH)); feed('main', L.shipped); mark('agenda'); await said('most honest'); await quiet(300);
      both(L.shipped + 1); await seen(() => !!document.querySelector('#present.on .pwin.web iframe'), undefined, 20000).catch(() => {}); mark('artifact'); await sleep(3500);
      if (await page.$('#present.on .pwin.web')) { await click('#present.on .pwin.web'); mark('pinpage'); await sleep(4500); await page.keyboard.press('Escape'); await sleep(900); }
      both(L.shipped + 2); await sleep(3200);   // the thumbnail, on the lead's screen

      // the critic
      feed('main', L.think2); both(L.critic); feed(CR, 0); mark('critic'); feed('main', L.reading); await said('The critic is reading'); await quiet(400);
      const reading = play(spread([], CR, 13, 38, 0, 9));
      both(L.cat); feed('main', L.back); await said('The second session is back'); await quiet(400); await reading;
      feed(CR, hb(CR), hb(CR) + 1); feed('main', note(CR)); feed('main', L.right); mark('objection'); await said('The critic is right'); await quiet(500);
      feed('main', L.right + 1); mark('question'); await sleep(3600);   // the question to the person, on screen
      for (const j of res(L.right + 1, 0)) feed('main', j); feed('main', L.client); mark('decision'); await said('The client has spoken'); await quiet(400);
      feed('main', L.again); await said('publish it again'); both(L.again + 1); both(L.again + 2); both(L.again + 3); mark('v2');
      await seen(() => !!document.querySelector('#present.on .pwin.web iframe'), undefined, 15000).catch(() => {}); await sleep(4000); await quiet(400);
      feed('main', L.close); mark('record'); await said('Recording starts now'); await quiet(600); await sleep(2200); mark('end');
    },
  };
};
