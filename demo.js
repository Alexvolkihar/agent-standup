// A made-up session used by the built-in demo (?demo=1, "Try the demo"): a fictional team fixes a slow login page
// and flaky cart tests. No real project data. Same shape as what server.js builds from real transcripts.
// `fr` holds the French version of spoken lines, so the demo needs no translation service.
module.exports = function demoTimeline() {
  const start = Date.now() - 8 * 60 * 1000;
  let now = start, n = 0;
  const events = [];
  const agents = [
    { id: 'main', role: 'Lead', type: 'main' },
    { id: 'ada', name: 'Ada', role: 'Login profiling', roleFr: 'Profilage du login', type: 'general-purpose' },
    { id: 'remy', name: 'Remy', role: 'Flaky cart tests', roleFr: 'Tests du panier instables', type: 'general-purpose' },
    { id: 'iris', name: 'Iris', role: 'API error review', roleFr: 'Revue des erreurs API', type: 'general-purpose' },
    { id: 'hugo', name: 'Lena', role: 'Retry logic check', roleFr: 'Vérif. de la logique de retry', type: 'general-purpose' },
  ];
  const cat = (lines) => lines.map((l, i) => String(i + 1).padStart(6) + '\t' + l).join('\n');
  const ev = (gap, e) => { now += gap; events.push({ ts: now, ...e }); return now; };
  const user = (text, fr) => ev(0, { agent: 'user', kind: 'user', text, fr });
  const say = (agent, text, fr, gap = 2600) => ev(gap, { agent, kind: 'say', text, fr });
  const order = (from, to, title, text, fr, gap = 2200) => ev(gap, { agent: from, to, kind: 'order', title, text, fr });
  const report = (agent, to, text, fr, gap = 2600) => ev(gap, { agent, to, kind: 'report', text, fr });
  // one tool call + its result, `ms` later
  const use = (agent, name, arg, d, out, { err = false, ms = 400, gap = 1500 } = {}) => {
    const id = 'toolu_demo' + ++n, ts = ev(gap, { agent, kind: 'tools', tools: [{ id, name, arg, d }] });
    if (out != null) events.push({ ts: ts + ms, agent, kind: 'results', items: [{ id, err, out }] });
    events[events.findIndex((e) => e.tools && e.tools[0].id === id)].tools[0].ts = ts;
  };
  const todo = (agent, items, gap = 1200) => use(agent, 'TodoWrite', 'update todos', { kind: 'todo', items: items.map(([c, s]) => ({ c, s })) }, null, { gap });

  user('The login page is slow and the cart tests keep failing at random. Can you sort it out?',
       'La page de connexion est lente et les tests du panier échouent au hasard. Tu peux régler ça ?');
  say('main', "On it. I'll split the work: one agent profiles the login, one hunts the flaky cart tests, one reviews the API errors.",
      "Je m'en occupe. Je répartis le travail : un agent profile le login, un autre traque les tests instables du panier, un troisième passe en revue les erreurs de l'API.", 3000);
  todo('main', [['Profile the login flow', 'in_progress'], ['Fix the flaky cart tests', 'pending'], ['Review API error handling', 'pending'], ['Commit the changes', 'pending']]);
  order('main', 'ada', 'Profile the login flow', "Find out why /login takes about 3 seconds. Read-only: don't edit anything. Report what you find, with file and line.",
        "Trouve pourquoi /login prend environ 3 secondes. Lecture seule : ne modifie rien. Rapporte ce que tu trouves, avec fichier et ligne.");
  order('main', 'remy', 'Fix the flaky cart tests', 'The cart tests fail about one run in three. Find the cause, fix it, then run the suite twice to be sure.',
        'Les tests du panier échouent environ une fois sur trois. Trouve la cause, corrige, puis lance la suite deux fois pour être sûr.', 1200);
  order('main', 'iris', 'Review API error handling', 'Review how src/api handles failures. List the unhandled errors and fix the safe ones. Ask Lena to check the retry logic.',
        "Passe en revue la gestion des erreurs dans src/api. Liste celles qui ne sont pas gérées et corrige les plus sûres. Demande à Lena de vérifier la logique de retry.", 1200);

  // --- parallel work -------------------------------------------------------------
  use('ada', 'Read', 'src/pages/Login.jsx', { kind: 'read', file: 'src/pages/Login.jsx' }, cat([
    "import { useEffect, useState } from 'react';", "import { useProfile } from '../context/ProfileProvider';", "import { fetchProfile } from '../api/profile';", "import { fetchNetworks } from '../api/networks';", '',
    'export default function Login() {', '  const profile = useProfile();', '  const [networks, setNetworks] = useState(null);', '', '  useEffect(() => {', '    fetchProfile();            // <-- second call, the provider already fetched it',
    '    fetchNetworks().then(setNetworks);', '  }, []);', '', '  if (!profile || !networks) return <Spinner />;', '', '  return (', '    <main className="login">', '      <LoginForm networks={networks} />', '    </main>', '  );', '}']), { ms: 220, gap: 2400 });
  use('remy', 'Bash', 'npm test -- cart', { kind: 'cmd', text: 'npm test -- cart', note: 'Run the cart tests' },
      ' FAIL  src/cart/cart.test.js\n  ● cart › updates the total after adding an item\n\n    expect(received).toBe(expected)\n\n    Expected: 42\n    Received: 0\n\n      18 |     addItem(item);\n    > 19 |     expect(total()).toBe(42);\n\nTests: 1 failed, 11 passed, 12 total', { err: true, ms: 2600, gap: 600 });
  use('iris', 'Glob', 'src/api/**/*.js', { kind: 'glob', pattern: 'src/api/**/*.js' }, 'src/api/client.js\nsrc/api/errors.js\nsrc/api/networks.js\nsrc/api/profile.js\nsrc/api/checkout.js', { ms: 90, gap: 700 });
  use('ada', 'Grep', 'fetchProfile', { kind: 'grep', pattern: 'fetchProfile', path: 'src' }, 'src/pages/Login.jsx:10:    fetchProfile();            // <-- second call\nsrc/context/ProfileProvider.jsx:18:    fetchProfile().then(setProfile);\nsrc/api/profile.js:4:export async function fetchProfile() {', { ms: 130, gap: 1700 });
  use('remy', 'Read', 'src/cart/cart.test.js', { kind: 'read', file: 'src/cart/cart.test.js' }, cat([
    "import { addItem, total, resetCart } from './cart';", "import { waitFor } from '../test-utils';", '', 'beforeEach(() => resetCart());', '', "test('starts empty', () => {", '  expect(total()).toBe(0);', '});', '',
    "test('updates the total after adding an item', async () => {", '  const item = { id: 1, price: 42 };', '  addItem(item);', '  expect(total()).toBe(42);', '});']), { ms: 180, gap: 1800 });
  use('iris', 'Read', 'src/api/errors.js', { kind: 'read', file: 'src/api/errors.js' }, cat([
    "export async function handle(res) {", "  if (res.ok) return res.json();", "  // TODO: map status codes to friendly messages", "  throw new Error('request failed');", '}', '',
    "export async function safe(fn) {", '  try { return await fn(); } catch (e) { /* ignored */ }', '}']), { ms: 160, gap: 1200 });
  use('ada', 'Bash', 'npm run profile -- login', { kind: 'cmd', text: 'npm run profile -- login', note: 'Profile the login page' },
      'login render: 3120 ms\n  ├─ fetchProfile   2410 ms   (called 2×)\n  ├─ fetchNetworks   380 ms\n  └─ paint           330 ms', { ms: 4200, gap: 1400 });
  use('remy', 'Edit', 'src/cart/cart.test.js', { kind: 'edit', file: 'src/cart/cart.test.js', old: '  addItem(item);\n  expect(total()).toBe(42);', new: '  addItem(item);\n  await waitFor(() => expect(total()).toBe(42));' },
      'The file src/cart/cart.test.js has been updated.', { ms: 120, gap: 1500 });
  use('iris', 'Grep', 'catch', { kind: 'grep', pattern: 'catch', path: 'src/api' }, 'src/api/errors.js:8:  try { return await fn(); } catch (e) { /* ignored */ }\nsrc/api/checkout.js:22:  } catch (e) {\nsrc/api/profile.js:11:  } catch (e) {}', { ms: 110, gap: 1300 });
  say('ada', "Found it: fetchProfile runs twice and blocks the first render. That's about 2.4 seconds.", "Trouvé : fetchProfile est appelé deux fois et bloque le premier affichage. Ça fait environ 2,4 secondes.", 1700);
  use('remy', 'Bash', 'npm test -- cart', { kind: 'cmd', text: 'npm test -- cart', note: 'Run the cart tests again' },
      ' PASS  src/cart/cart.test.js\n  ✓ starts empty (3 ms)\n  ✓ updates the total after adding an item (12 ms)\n\nTests: 12 passed, 12 total\nTime:  2.1 s', { ms: 2300, gap: 1500 });
  order('iris', 'hugo', 'Retry logic check', 'Check the retry logic in src/api/client.js: any infinite retry, or no backoff?', 'Vérifie la logique de retry dans src/api/client.js : y a-t-il un retry infini, ou pas de backoff ?', 1600);
  report('ada', 'main', 'Login is slow because fetchProfile runs twice (Login.jsx:10 and ProfileProvider.jsx:18) and blocks rendering. Fix: fetch once, in the provider. Expected: 3.1 s down to under 1 s.',
         "Le login est lent car fetchProfile est appelé deux fois (Login.jsx:10 et ProfileProvider.jsx:18) et bloque l'affichage. Correctif : un seul appel, dans le provider. Attendu : de 3,1 s à moins d'une seconde.", 1400);
  use('hugo', 'Read', 'src/api/client.js', { kind: 'read', file: 'src/api/client.js' }, cat([
    "const MAX = 5;", '', 'export async function request(url, opts, attempt = 0) {', '  try {', '    return await fetch(url, opts);', '  } catch (e) {', '    if (attempt >= MAX) throw e;', '    return request(url, opts, attempt + 1);   // no delay', '  }', '}']), { ms: 140, gap: 1000 });
  say('remy', "The test didn't wait for the async total. Fixed, and green twice in a row.", "Le test n'attendait pas le total asynchrone. Corrigé, et vert deux fois de suite.", 1600);
  report('remy', 'main', 'Cause: the cart test read the total before the async update finished. Added waitFor. Two consecutive runs pass (12/12).', "Cause : le test lisait le total avant la fin de la mise à jour asynchrone. J'ai ajouté waitFor. Deux exécutions de suite passent (12/12).", 1200);
  use('iris', 'Edit', 'src/api/errors.js', { kind: 'edit', file: 'src/api/errors.js', old: "  throw new Error('request failed');", new: "  throw new ApiError(res.status, friendly(res.status));" },
      'The file src/api/errors.js has been updated.', { ms: 120, gap: 1500 });
  say('hugo', "No infinite loop, but there's no backoff: five instant retries hammer the server. And 4xx errors shouldn't retry at all.", "Pas de boucle infinie, mais aucun backoff : cinq retries immédiats martèlent le serveur. Et les erreurs 4xx ne devraient pas être retentées.", 1800);
  report('hugo', 'iris', 'Retries have no backoff and also retry on 4xx. Suggest exponential backoff and stopping on client errors.', 'Les retries n’ont pas de backoff et retentent aussi sur les 4xx. Je suggère un backoff exponentiel et un arrêt sur les erreurs client.', 1200);
  use('iris', 'Bash', 'npm test -- api', { kind: 'cmd', text: 'npm test -- api', note: 'Run the API tests' }, ' PASS  src/api/errors.test.js\n PASS  src/api/client.test.js\n\nTests: 18 passed, 18 total', { ms: 1100, gap: 1300 });
  report('iris', 'main', 'Two unhandled error paths fixed (profile load, checkout) and retries now back off and stop on 4xx. API tests: 18/18.', 'Deux chemins d’erreur non gérés corrigés (chargement du profil, paiement), et les retries ralentissent et s’arrêtent sur les 4xx. Tests API : 18/18.', 1700);

  // --- the lead wraps up ----------------------------------------------------------------
  todo('main', [['Profile the login flow', 'completed'], ['Fix the flaky cart tests', 'completed'], ['Review API error handling', 'completed'], ['Commit the changes', 'in_progress']], 2200);
  use('main', 'Edit', 'src/pages/Login.jsx', { kind: 'edit', file: 'src/pages/Login.jsx', old: '    fetchProfile();            // <-- second call, the provider already fetched it\n    fetchNetworks().then(setNetworks);', new: '    fetchNetworks().then(setNetworks);' },
      'The file src/pages/Login.jsx has been updated.', { ms: 120, gap: 1400 });
  use('main', 'Bash', 'npm run profile -- login', { kind: 'cmd', text: 'npm run profile -- login', note: 'Check the login speed after the fix' },
      'login render: 890 ms\n  ├─ fetchProfile   410 ms   (called 1×)\n  ├─ fetchNetworks  380 ms\n  └─ paint          100 ms', { ms: 900, gap: 1200 });
  use('main', 'Bash', 'git commit -am "Fix slow login and flaky cart tests"', { kind: 'cmd', text: 'git commit -am "Fix slow login and flaky cart tests"', note: 'Commit' },
      '[fix/login-and-cart 3f2a9c1] Fix slow login and flaky cart tests\n 5 files changed, 38 insertions(+), 12 deletions(-)', { ms: 300, gap: 1300 });
  say('main', 'Done. Login goes from 3.1 s to 0.9 s, the cart tests pass twice in a row, and two API error paths are handled. Everything is committed on a branch.',
      'Terminé. Le login passe de 3,1 s à 0,9 s, les tests du panier passent deux fois de suite et deux chemins d’erreur de l’API sont gérés. Tout est commité sur une branche.', 1800);

  events.sort((a, b) => a.ts - b.ts);
  const merged = [];   // same merging rule as the real timeline: nothing to merge here, each call is its own beat
  for (const e of events) merged.push(e);
  const first = merged[0].ts;
  return { id: 'demo', proj: '_demo', agents, events: merged.map((e) => ({ ...e, t: e.ts - first })), durationMs: merged[merged.length - 1].ts - first };
};
