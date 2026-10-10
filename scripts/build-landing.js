// Builds docs/index.html (the GitHub Pages landing page) from landing/template.html,
// pulling the character art straight out of public/index.html so the two never drift apart.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const sep = '// =====================================================================\n';
const js = app.slice(app.indexOf(sep + '//  cast: soft mascots'), app.indexOf(sep + '//  state'));
const cssStart = app.indexOf('/* character animation'), cssEndMark = '@media (prefers-reduced-motion:reduce) { .tile *, .tile { animation:none !important } }';
const css = app.slice(cssStart, app.indexOf(cssEndMark) + cssEndMark.length);
if (!js || cssStart < 0) throw new Error('art markers not found in public/index.html');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const out = fs.readFileSync(path.join(root, 'landing/template.html'), 'utf8')
  .replace('/*ART_CSS*/', () => css).replace('/*ART_JS*/', () => js).replace(/__VERSION__/g, version);
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs/index.html'), out);
fs.copyFileSync(path.join(root, 'media/icon.png'), path.join(root, 'docs/icon.png'));
console.log('docs/index.html built (' + Math.round(out.length / 1024) + ' KB, v' + version + ')');
