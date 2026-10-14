// The people who bought the dev a coffee, shown in the coffee block of the website and of the landing page: name, picture, number of coffees, message.
//   node scripts/supporters.js     fetches them again from Buy Me a Coffee into website/supporters/ (list.json and the pictures), to commit
// The website's build runs it on the host before building (scripts/build-website.js), so each deployment is up to date; when Buy Me a Coffee
// does not answer, the files already there are kept. Only what the public page of Buy Me a Coffee shows: supports made public, and a message
// only when its writer did not hide it. Pictures are copied here so the pages load nothing from Buy Me a Coffee (see PRIVACY.md).
const fs = require('fs'), path = require('path');
const SLUG = 'bored_dev_and_his_robots', PAGE = 'https://www.buymeacoffee.com/' + SLUG;
const dir = path.join(__dirname, '..', 'website', 'supporters'), listFile = path.join(dir, 'list.json');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const read = () => { try { return JSON.parse(fs.readFileSync(listFile, 'utf8')).supporters || []; } catch { return []; } };

async function refresh() {
  const get = async (url) => { const r = await fetch(url, { headers: { 'user-agent': 'agent-standup-site' }, signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error(url + ': ' + r.status); return r; };
  const rows = [];
  for (let url = `https://app.buymeacoffee.com/api/creators/slug/${SLUG}/coffees?web=1&per_page=20&page=1`; url && rows.length < 1000;) {
    const d = await (await get(url)).json(); if (!Array.isArray(d.data)) throw new Error('unexpected answer from Buy Me a Coffee');
    rows.push(...d.data); url = d.links && d.links.next;
  }
  // one card per person: someone who came back has their coffees added up and their latest message (the list comes newest first)
  const people = new Map();
  for (const s of rows) {
    if (s.support_visibility !== 1) continue;
    const name = String(s.supporter_name || s.profile_full_name || 'Someone').trim().slice(0, 40), key = s.fk_user_id ? 'u' + s.fk_user_id : 'n' + name;
    const note = !s.msg_hidden && s.support_note ? String(s.support_note).trim().slice(0, 160) : '';
    const p = people.get(key);
    if (p) { p.coffees += s.support_coffees || 1; if (!p.note) p.note = note; continue; }
    // a picture Buy Me a Coffee drew from the initials (…/default/v2/EFC16D/SO.png) is drawn by the page instead; a real one is copied
    const pic = String(s.profile_picture_url || ''), drawn = /\/default\/v2\/([0-9a-f]{6})\/([^/.]+)\.png$/i.exec(pic);
    people.set(key, { id: s.support_id, name, coffees: s.support_coffees || 1, note, date: String(s.support_created_on || '').slice(0, 10), picture: drawn || !/^https:\/\/cdn\.buymeacoffee\.com\//.test(pic) ? null : pic, initials: drawn ? drawn[2].slice(0, 2).toUpperCase() : name.slice(0, 2).toUpperCase(), color: drawn ? '#' + drawn[1] : '#f5c04a' });
  }
  const list = [...people.values()];
  fs.mkdirSync(dir, { recursive: true });
  for (const p of list) {
    if (!p.picture) continue;
    const file = p.id + '.jpg';
    if (!fs.existsSync(path.join(dir, file))) { try { fs.writeFileSync(path.join(dir, file), Buffer.from(await (await get(p.picture)).arrayBuffer())); } catch { p.picture = null; continue; } }
    p.picture = file;
  }
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.jpg') && !list.some((p) => p.picture === f)) fs.rmSync(path.join(dir, f));   // someone who left the list takes their picture with them
  fs.writeFileSync(listFile, JSON.stringify({ source: PAGE, supporters: list }, null, 1) + '\n');
  return list;
}

// The block's parts: the cards (pictures under <base>supporters/), and the numbers for the line that thanks them.
function cards(list, base = '') {
  return list.map((p) => `<figure class="backer">${p.picture ? `<img src="${base}supporters/${esc(p.picture)}" alt="" width="44" height="44" loading="lazy">` : `<span class="av" style="background:${esc(p.color)}">${esc(p.initials)}</span>`}<figcaption><b>${esc(p.name)}</b><span class="cups">☕ ×${p.coffees}</span>${p.note ? `<q>${esc(p.note)}</q>` : ''}</figcaption></figure>`);
}
// In a page, the block sits between <!--SUPPORTERS--> and <!--/SUPPORTERS--> and its moving strip between <!--BACKERS--> and <!--/BACKERS-->, which holds the
// "your name here" card. The cards are repeated until there are enough to fill the widest screen, and the strip is written twice so that it slides
// round without a gap; every repeat is hidden from screen readers and the keyboard.
// With nobody yet, the block goes.
function fill(html, list, base = '') {
  if (!list.length) return html.replace(/<!--SUPPORTERS-->[\s\S]*?<!--\/SUPPORTERS-->\n?/g, '');
  const coffees = list.reduce((n, p) => n + p.coffees, 0);
  return html.replace(/<!--\/?SUPPORTERS-->/g, '').replace(/<!--BACKERS-->([\s\S]*?)<!--\/BACKERS-->/, (m, you) => {
    const one = [...cards(list, base), you.trim()], times = Math.ceil(8 / one.length), n = one.length * times;
    const hide = (h) => h.replace(/^<(figure|a) /, '<$1 aria-hidden="true" ').replace(/<a /g, '<a tabindex="-1" ');
    const extra = Array(times - 1).fill(one.map(hide).join('')).join('');
    return `<div class="group">${one.join('')}${extra}</div><div class="group" aria-hidden="true">${one.map(hide).join('')}${extra}</div>`;
  }).replace(/(class="track")/, () => `class="track" style="--n:${Math.ceil(8 / (list.length + 1)) * (list.length + 1)}"`).replace(/data-people="0" data-coffees="0"/g, `data-people="${list.length}" data-coffees="${coffees}"`);
}

module.exports = { read, refresh, fill, PAGE };

if (require.main === module) {
  refresh().then((list) => console.log(`${list.length} supporter(s), ${list.reduce((n, p) => n + p.coffees, 0)} coffee(s) → website/supporters/`))
    .catch((e) => { console.log(`supporters: Buy Me a Coffee did not answer (${e.message}); kept the ${read().length} already in website/supporters/`); });
}
