// The cue sheet of the artifacts video: which real records of the session are written again, in which order, and what the pointer does in the call.
// Left out: everything before Arthur's "redo" message; the lead's own work on the recorder and its checks; the poster's second version (made by a script, the call can only
// show it with the first version's content) and the report that went with it; the message that asked for a third version, as the poster agent received it.
module.exports = ({ feed, find, drop, streams }) => {
  const M = streams.main.rec, at = (text, from = 0) => find('main', text, from);
  const redo = at("i don't like the video"), fair = at('Fair. We start over'), focus = M.findIndex((r) => r.type === 'attachment' && JSON.stringify(r).includes('focus on artifact feature'));
  const pages = at('Artifacts it is'), three = at('Three pages, live in the call'), again = at('One more version of the poster'), closing = at('That\'s artifacts in 1.32'), title = M.findIndex((r, i) => i > redo && r.type === 'ai-title');
  const note = (id, from = redo) => at('<task-id>' + id, from);
  const P = 'ae10', B = 'a138', C = 'a011', hb = (s, text) => find(s, text);
  const posterV2 = find(P, 'python3'), posterHb1 = hb(P, 'version two adds');
  for (let i = posterV2; i <= posterHb1 + 1; i++) drop(P, i);
  for (let i = posterHb1 + 2; i < streams[P].rec.length; i++) if (streams[P].rec[i].type === 'user' && typeof (streams[P].rec[i].message || {}).content === 'string') drop(P, i);   // the coordinator's message, as the agent got it
  const pub = (s, n = 1) => { let k = -1; for (let j = 0; j < n; j++) k = find(s, '"name":"Artifact"', k + 1); return k; };
  const end = (s) => streams[s].rec.length - 1;
  return {
    before() {},
    async run({ page, mark, sleep, said, quiet, seen, click, point }) {
      const pin = async () => { await seen(() => !!document.querySelector('#present [data-pin]'), undefined, 20000); await click('#present [data-pin]'); };
      const frame = async () => { for (let i = 0; i < 50; i++) { const f = page.frames().find((f) => /\/api\/artifact/.test(f.url())); if (f) return f; await sleep(100); } throw new Error('no page frame'); };
      mark('start'); await sleep(1500);
      feed('main', redo - 2, redo); feed('main', title); mark('redo');
      await page.waitForFunction(() => !!document.querySelector('#gate.on') || window.__log.length > 0, { timeout: 15000, polling: 100 }).catch(() => {}); if (await page.$('#gate.on')) await click('#gB');   // 1.32.0 asks to join again once a session appears
      await said("i don't like the video"); await quiet(500);
      feed('main', fair, fair + 6); mark('fair'); await said('Fair. We start over'); await quiet(400);   // its line, and the old video deleted on its screen
      feed('main', focus); mark('focus'); await said('focus on artifact'); await quiet(400);
      feed('main', pages, pages + 6); for (const s of [P, B, C]) feed(s, 0, 11); mark('launch');
      await said('Artifacts it is'); await sleep(6000); await quiet(1500); mark('work');

      // the three at work, in turn: the skills, the facts, the pages written
      feed(B, 12, 24); await sleep(1800); feed(P, 12, 30); await sleep(1800); feed(C, 12, 45); await sleep(1800); feed(B, 25, pub(B) - 1); await sleep(1500);

      // the bingo card goes up: pinned, played, reported
      feed(B, pub(B), hb(B, 'The bingo card is live') - 1); mark('bingo'); await sleep(2600); await pin(); mark('pinned'); await sleep(1200);
      const f = await frame(), cells = []; for (const b of await f.$$('button')) if (!(await b.evaluate((e) => e.id === 'reset'))) cells.push(b);
      for (const b of cells.slice(0, 4)) { const box = await b.boundingBox(); if (box) await page.evaluate((x, y) => { const el = document.querySelector('#vcur'); el.style.opacity = 1; el.style.left = x + 'px'; el.style.top = y + 'px'; }, box.x + box.width / 2, box.y + box.height / 2); await sleep(650); await b.click(); await sleep(500); }
      mark('bingo!'); await sleep(1600); point('');
      feed(B, hb(B, 'The bingo card is live'), end(B)); feed('main', note('a138ab0561fec381a')); await said('The bingo card is live'); await quiet(400);
      await click('#present [data-x]'); mark('unpin');

      // the poster, then the chart
      feed(P, 31, pub(P) - 1); await sleep(1500); feed(P, pub(P), posterV2 - 1); mark('poster'); await sleep(3800);
      feed(C, 46, pub(C) - 1); await sleep(1500); feed(C, pub(C), hb(C, 'This week: 167 commits') - 1); mark('chart'); await sleep(2600); await pin(); mark('pinned2'); await sleep(1500);   // pinned while it is on screen: it stays through the report
      feed(C, hb(C, 'This week: 167 commits'), end(C)); feed('main', note('a0114a02fcf2f847c')); await said('This week: 167 commits'); await quiet(400);
      feed('main', three); mark('three'); await said('Three pages, live in the call'); await quiet(400);

      // still pinned, stepped back from the chart to the poster: the third version arrives while it is pinned
      await click('#present [data-go="-1"]'); mark('stepped'); await sleep(1500);
      feed('main', again, again + 2); mark('again'); await said('One more version of the poster'); await quiet(400);
      const v3 = find(P, '"name":"Edit"', posterHb1); feed(P, v3 - 3, v3 + 3); mark('v3'); await sleep(3500);
      feed(P, hb(P, 'In version three'), end(P)); feed('main', note('ae107cc732c48ff25', again)); await said('In version three'); await quiet(400);
      feed('main', closing); mark('closing'); await said("That's artifacts in 1.32"); await quiet(600); await sleep(1500); mark('end');
    },
  };
};
