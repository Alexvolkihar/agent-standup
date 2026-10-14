// The shop on your own machine, with a pretend Stripe: to try the purchase of a pack from the app, and for the tests. No money, no account, nothing leaves the computer.
//   node scripts/shop-dev.js <pack.zip> [port]                 then start the app with AGENT_STANDUP_STORE=http://localhost:<port>
//   node scripts/shop-dev.js <pack.zip> [port] --stripe-test   the real Stripe in TEST mode instead of the pretend one: the key of the Stripe command-line login (`stripe login`),
//                                                             never printed; a live key stops it. Pay with the test card 4242 4242 4242 4242, any date to come, any CVC
// One small server plays three parts:
//   the website     /api/checkout and /api/pack (the real functions of api/), and /thanks/ (the real page, with its picture, the fonts and the logo)
//   Stripe          the calls those functions make (sessions, payments, prices, the search by code), and a payment page with one button that "pays"
//   the file store  the zip of the pack, at an address made up at each start
//   and the rest of the built website (website/dist, after npm run website): the home page, the shop, the terms
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..');

function start({ port = 0, zip, real = false } = {}) {
  const sessions = new Map(), secret = crypto.randomBytes(12).toString('hex'), id = (p) => p + crypto.randomBytes(18).toString('hex');
  const json = (res, code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  const read = (req) => new Promise((ok) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c).toString('utf8'))); });
  const view = (s, expand) => ({ id: s.id, object: 'checkout.session', url: s.url, status: s.paid ? 'complete' : 'open', payment_status: s.paid ? 'paid' : 'unpaid', metadata: s.metadata, livemode: false,
    payment_intent: s.paid ? (expand ? intent(s) : s.pi) : null });
  const intent = (s) => ({ id: s.pi, object: 'payment_intent', status: s.paid ? 'succeeded' : 'requires_payment_method', metadata: s.metadata, latest_charge: s.paid ? { id: 'ch_' + s.pi.slice(3), refunded: !!s.refunded, amount_refunded: s.refunded ? s.amount : 0, disputed: false } : null });
  const missing = (res) => json(res, 404, { error: { code: 'resource_missing', message: 'No such object' } });
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x'), p = u.pathname, base = `http://localhost:${server.address().port}`;
    try {
      if (p === '/api/checkout' || p === '/api/pack' || p === '/api/download') return void await require(path.join(root, 'api', p.slice(5) + '.js'))(req, res);
      const asset = { '/brand/icon.png': 'media/icon.png', '/brand/favicon.svg': 'public/favicon.svg' }[p] || (/^\/(thanks|fonts)\/[\w.-]+$/.test(p) ? 'website/static' + p : (p === '/thanks/' || p === '/thanks') ? 'website/static/thanks/index.html' : '');   // what the website serves around the thank-you page
      if (asset && fs.existsSync(path.join(root, asset))) { res.writeHead(200, { 'content-type': { html: 'text/html; charset=utf-8', jpg: 'image/jpeg', png: 'image/png', svg: 'image/svg+xml', woff2: 'font/woff2' }[asset.split('.').pop()] || 'application/octet-stream' }); return res.end(fs.readFileSync(path.join(root, asset))); }
      if (p === `/file/${secret}.zip`) { res.writeHead(200, { 'content-type': 'application/zip' }); return res.end(typeof zip === 'string' ? fs.readFileSync(zip) : zip); }
      const dist = path.join(root, 'website/dist'), fp = path.normalize(path.join(dist, decodeURIComponent(p), p.endsWith('/') ? 'index.html' : ''));   // the rest of the website, once built (npm run website): home, shop, terms
      if (!p.startsWith('/v1/') && fp.startsWith(dist + path.sep) && fs.existsSync(fp) && fs.statSync(fp).isFile()) { res.writeHead(200, { 'content-type': { html: 'text/html; charset=utf-8', css: 'text/css', js: 'text/javascript', jpg: 'image/jpeg', png: 'image/png', svg: 'image/svg+xml', woff2: 'font/woff2', mp4: 'video/mp4', xml: 'application/xml', txt: 'text/plain' }[fp.split('.').pop()] || 'application/octet-stream' }); return res.end(fs.readFileSync(fp)); }
      if (real) { res.writeHead(404); return res.end('not found'); }   // with the real Stripe, nothing below: the functions call api.stripe.com
      if (p.startsWith('/v1/') && req.headers.authorization !== 'Bearer ' + process.env.STRIPE_SECRET_KEY) return json(res, 401, { error: { code: 'api_key_invalid', message: 'Invalid API Key' } });
      if (p === '/v1/checkout/sessions' && req.method === 'POST') {
        const f = new URLSearchParams(await read(req)), s = { id: id('cs_test_'), pi: id('pi_'), paid: false, refunded: false, success: f.get('success_url'), metadata: { pack: f.get('metadata[pack]'), code: f.get('metadata[code]') }, form: f, amount: +f.get('line_items[0][price_data][unit_amount]'), currency: f.get('line_items[0][price_data][currency]'), name: f.get('line_items[0][price_data][product_data][name]') };
        s.url = `${base}/pay/${s.id}`; sessions.set(s.id, s); return json(res, 200, view(s));
      }
      if (p === '/v1/prices') return json(res, 200, { object: 'list', data: [] });
      if (p === '/v1/payment_intents/search') { const q = (u.searchParams.get('query') || '').match(/^metadata\['code'\]:'([^']+)'$/), hit = q && [...sessions.values()].find((x) => x.metadata.code === q[1]); return json(res, 200, { object: 'search_result', data: hit ? [intent(hit)] : [] }); }   // Stripe's search, at once (the real one can take a minute)   // no product in the pretend account: the shop names the pack itself
      const cs = p.match(/^\/v1\/checkout\/sessions\/([\w]+)$/), pi = p.match(/^\/v1\/payment_intents\/([\w]+)$/), pay = p.match(/^\/pay\/([\w]+)$/);
      if (cs) { const s = sessions.get(cs[1]); return s ? json(res, 200, view(s, true)) : missing(res); }
      if (pi) { const s = [...sessions.values()].find((x) => x.pi === pi[1]); return s ? json(res, 200, intent(s)) : missing(res); }
      if (pay) { const s = sessions.get(pay[1]); if (!s) { res.writeHead(404); return res.end('no such payment'); }
        if (req.method === 'POST') { s.paid = true; res.writeHead(303, { location: s.success.replace('{CHECKOUT_SESSION_ID}', s.id) }); return res.end(); }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        return res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Pretend payment</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f2ea;color:#2c2f40;font:16px/1.5 system-ui,sans-serif"><form method="post" style="max-width:420px;background:#fff;border:1px solid #e4ddcf;border-radius:16px;padding:28px 24px"><p style="margin:0 0 6px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#b4472a">Pretend payment · no money moves</p><h1 style="font-size:22px;line-height:1.25;margin:0 0 6px">${String(s.name).replace(/[<&]/g, '')}</h1><p style="margin:0 0 18px">${(s.amount / 100).toFixed(2)} ${String(s.currency).toUpperCase()}. This page stands in for Stripe while the shop is tried on this computer.</p><button style="border:0;border-radius:10px;padding:12px 18px;background:#f5c04a;color:#2c2f40;font:600 15px system-ui,sans-serif;cursor:pointer">Pay (pretend)</button></form></body>`);
      }
      res.writeHead(404); res.end('not found');
    } catch (e) { if (!res.headersSent) json(res, 500, { error: { message: String(e.message || e) } }); else res.destroy(); }
  });
  const ready = new Promise((ok) => server.listen(port, '127.0.0.1', () => {
    const base = `http://localhost:${server.address().port}`;
    Object.assign(process.env, real ? { SHOP_SITE: base, PACK_HALLOWEEN_URL: `${base}/file/${secret}.zip` } : { STRIPE_API: base, STRIPE_SECRET_KEY: 'sk_test_pretend', SHOP_SITE: base, PACK_HALLOWEEN_URL: `${base}/file/${secret}.zip` }); ok(base);
  }));
  return { server, ready, sessions, pay: (code) => { sessions.get(code).paid = true; }, refund: (code) => { sessions.get(code).refunded = true; }, stop: () => server.close() };
}
module.exports = { start };

if (require.main === module) {
  const zip = process.argv[2]; if (!zip || !fs.existsSync(zip)) { console.error('usage: node scripts/shop-dev.js <pack.zip> [port]'); process.exit(1); }
  const real = process.argv.includes('--stripe-test');
  if (real) {   // the key of the command-line login, test mode only
    const conf = require('child_process').execFileSync('stripe', ['config', '--list']).toString(), key = (conf.match(/^test_mode_api_key = '([^']+)'/m) || [])[1] || '';
    if (!/^(sk|rk)_test_/.test(key)) { console.error('no TEST key from `stripe login`: stopping'); process.exit(1); }
    process.env.STRIPE_SECRET_KEY = key; delete process.env.STRIPE_API;
  }
  start({ port: +process.argv[3] || 4802, zip, real }).ready.then((base) => console.log(`${real ? 'Shop with the real Stripe, TEST mode' : 'Pretend shop'} → ${base}   (start the app with AGENT_STANDUP_STORE=${base})`));
}
