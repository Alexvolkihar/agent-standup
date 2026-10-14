// The cue sheet of the first video: which real records are written again, in which order, and what the pointer does.
// The order of the records is the order they were written in. What is left out is named here: the lead's long stretch of looking around before the launch,
// its work on the recorder itself, the first sentence of each agent ("I am reading…") and the spoken report of two of them, so that the call does not fall behind its own voices.
module.exports = ({ feed, find, drop, streams, MAIN, SECOND }) => {
  const M = streams.main.rec, title = M.findIndex((r) => r.type === 'ai-title'), at = (text, from) => find('main', text, from);
  const L1 = at("I'm going to look at what the release contains"), launch = at('"name":"Bash"', at('Next, three agents will draft') ), L8 = at('The three drafts are in'), L10 = at('The critic is right'), L11 = at('The thumbnail now reads');
  const pic1 = at('"name":"Read"', at('All three agents are back')), svg = at('"name":"Edit"', L10 + 9), pic2 = at('"name":"Read"', svg + 4);
  const note = (id) => at('<task-id>' + id);   // Claude Code telling the lead that this agent has stopped
  const AG = { ines: ['a4d9', 39], annie: ['ae83', 38], thumb: ['a8e6', 70], critic: ['aea5', 30] };   // each agent's stream, and the record that hands its report back
  drop('a4d9', 13); drop('ae83', 12); drop('a8e6', 13); drop('aea5', 12);
  const spread = (steps, name, from, to, t1, t2) => { const R = streams[name].rec, ts = (i) => Date.parse(R[i].timestamp || 0) || 0; let a = 0, b = 0; for (let i = from; i <= to; i++) if (ts(i)) { a = a || ts(i); b = ts(i); } for (let i = from; i <= to; i++) { const t = ts(i) || a; steps.push([t1 + (b > a ? (t - a) / (b - a) : 0) * (t2 - t1), () => feed(name, i)]); } return steps; };
  const report = (who, said = true) => { const [name, hb] = AG[who]; if (said) feed(name, hb, streams[name].rec.length - 1); feed('main', note(streams[name].to.match(/agent-(\w+)\.jsonl/)[1])); };
  return {
    before() {},
    async run({ mark, sleep, play, seen, click, point, said, quiet, inSession, page }) {
      mark('start'); await sleep(1500);
      feed('main', 0, 2); feed('main', title); mark('order');
      await said('i just launch'); await quiet(600);

      // the launch: a second session and three agents, all at once
      mark('launch'); const t1 = Date.now(); feed('main', launch, launch + 7); for (const who of ['ines', 'annie', 'thumb']) feed(AG[who][0], 0, 11);
      feed('second', 0, 6);   // the second session starts on its first file
      await seen(() => document.querySelectorAll('#tabs .stab:not(.all)').length > 1); mark('tabs');
      await sleep(9000); await quiet(1600); mark('screens');   // the three orders have been given: each agent's work comes on screen in turn
      const second = play(spread([], 'second', 7, 15, 0.5, 9.2));
      feed('a4d9', 12, 23); await sleep(3000); feed('ae83', 12, 24); await sleep(3000); feed('a8e6', 12, 37); await sleep(3600); await second;

      // the second session ends its turn: six seconds later someone from there leans in. The call goes there, and comes back by its tab
      feed('second', 16); mark('done2'); feed('a4d9', 24, 38); await sleep(3200); feed('ae83', 25, 37);
      await seen(() => !!document.querySelector('#visit.on'), undefined, 20000); mark('knock'); await sleep(3000);
      await click('#visit .vgo'); await inSession(SECOND); mark('there');
      feed('a8e6', 38, 69); await sleep(300); report('ines', false); await sleep(400); report('annie'); await sleep(400); report('thumb', false);   // the three agents finish while the call is away. One report is read aloud, the title's; the two others are left out (the captions are on the screen, the thumbnail is shown next)
      await sleep(2000); if (await page.$('#files .sfc[data-f]')) await point('#files .sfc[data-f]', 0.5, 0.8); await sleep(3400);
      await click('#tabs .stab:not(.on):not(.all)'); await inSession(MAIN); mark('back');
      await said('The title and both'); mark('report'); await quiet(500);

      // the lead looks at the thumbnail, then brings in a critic
      feed('main', pic1, pic1 + 1); await sleep(2800);
      feed('main', L8, L8 + 1); feed('main', L8 + 3); feed('aea5', 0, 11); mark('critic');
      const reading = play(spread([], 'aea5', 12, 28, 4, 13));
      await said('The three drafts are in'); await quiet(500); await sleep(3000); await quiet(1600); await reading;
      report('critic'); mark('objection'); await said('My strongest objection'); await quiet(600);

      // the decision, on screen as the edits themselves, then the recording
      feed('main', L10, L10 + 3); feed('main', L10 + 5); feed('main', L10 + 6); feed('main', L10 + 8); mark('decision');
      await said('The critic is right'); await quiet(500);
      feed('main', svg); feed('main', svg + 3); await sleep(3000); feed('main', pic2); feed('main', pic2 + 2); await sleep(2200);
      feed('main', L11); mark('record'); await said('The thumbnail now reads'); await quiet(600); await sleep(2600); mark('end');
    },
  };
};
