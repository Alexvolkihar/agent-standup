// The edit of the artifacts video: the lines kept (each whole), the moments in between and how fast they run, where the frame zooms on the page, and the captions.
// Left out of the take: the three agents' quick replies to their orders, and the app's "Perfect, that took 47s. Thanks Iris." and "Nice, we are done."
const path = require('path'), here = __dirname;
module.exports = ({ line, marks: m }) => {
  const PAGE = [364, 40, 1500];   // the page window of the call, pinned
  const L = (text, caps, o = {}) => ({ line: line(text), caps, ...o }), look = (from, to, speed, caps, o = {}) => ({ from, to, speed, caps, ...o });
  const shots = [
    L("i don't like the video", [[0, -1, 'Your coding agents, as a live team call']], { section: 1, name: 'The request' }),
    L('Fair. We start over', [[0, -1, 'This video is a real session']]),
    L('focus on artifact feature', [[0, -1, 'New in 1.32: artifacts in the call']], { section: 1, name: 'Artifacts' }),
    L('Artifacts it is', [[0, -1, 'New in 1.32: artifacts in the call']]),
    L('Dennis, Make a one-page release poster', [[0, -1, 'Three agents, three pages']], { section: 1, name: 'Three agents, three pages' }),
    L('Also Iris on', [[0, -1, 'Three agents, three pages']]),
    look(m.work, m.bingo, 3, [[0, -1, 'Each one writes a real page']]),
    look(m.bingo, m.pinned, 1.2, [[0, -1, 'Published? It is shared in the call']], { section: 1, name: 'Shared in the call' }),
    look(m.pinned, line('The bingo card is live').on - 0.2, 1.2, [[0, -1, 'Click it: full size, and it works']], { zoom: PAGE, section: 1, name: 'Click it: it works' }),
    L('The bingo card is live', [[0, -1, 'Click it: full size, and it works']], { zoom: PAGE }),
    look(m.unpin, m.chart, 2, [[0, -1, 'Every page they publish shows up']], { section: 1, name: 'The poster and the chart' }),
    look(m.chart, line('This week: 167 commits').on - 0.2, 1.5, [[0, -1, 'Real data: this week’s commits']], { zoom: PAGE }),
    L('This week: 167 commits', [[0, -1, 'Real data: this week’s commits']], { zoom: PAGE }),
    L('Three pages, live in the call', []),
    look(line('Three pages, live in the call').end + 0.3, m.again + 0.1, 1, [[0, -1, '‹ › step through the session’s pages']], { zoom: PAGE, section: 1, name: 'One page after another' }),
    L('Still on it: asking the poster agent', [[0, -1, 'A new version is on its way']], { section: 1, name: 'The next version' }),
    look(line('Still on it: asking the poster agent').end + 0.3, line('In version three').on - 0.2, 1, [[0, -1, 'The pinned page follows its new versions']], { zoom: PAGE }),
    L('In version three', [[0, -1, 'The pinned page follows its new versions']], { zoom: PAGE }),
    L('Version three reads', [[0, -1, 'Agent Standup 1.32 · free and open source']], { section: 1, name: 'Artifacts in 1.32' }),
  ];
  return { shots, OPEN: 2.2, END: 4.5, open: path.join(here, 'poster-1920.png'), card: path.join(here, '../../making-of/endcard.png') };
};
