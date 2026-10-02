// usage: node scenario.js <appDir> <scenario.js>
// Runs one scenario file against the implementation in <appDir> (original/ or tl-build/) and prints one JSON line per
// step: what the handler did to req/res/next, what it logged and which HTTP requests it made (fetch is stubbed).
const path = require('node:path');
const appDir = path.resolve(process.argv[2]);
process.chdir(appDir);
process.loadEnvFile(path.join(appDir, 'test/.env.test'));
process.env.STRIPE_SKEY = process.env.STRIPE_SKEY || 'sk_test_x';
process.env.TWILIO_SID = process.env.TWILIO_SID || 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
process.env.TWILIO_TOKEN = process.env.TWILIO_TOKEN || 'tok';
const logs = [];
for (const k of ['log', 'warn', 'error']) console[k] = (...a) => logs.push([k, ...a.map((x) => (x instanceof Error ? 'Error:' + x.message : typeof x === 'string' ? x.replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, 'TS').replace(/\bin \d+ms\b/g, 'in Nms') : JSON.stringify(x)))]);
const realNow = Date.now;
Math.random = () => 0.5;

let routes = {};
global.fetch = async (url, opts) => {
  url = String(url);
  // OAuth 1.0a headers carry the current second and a signature over it
  logs.push(['fetch', url, opts ? JSON.stringify({ method: opts.method, headers: opts.headers, body: typeof opts.body === 'string' ? opts.body : opts.body ? String(opts.body) : undefined }).replace(/oauth_(timestamp|signature)=\\"[^"\\]*\\"/g, 'oauth_$1=X') : null]);
  for (const [k, v] of Object.entries(routes)) {
    if (url.includes(k)) {
      if (v instanceof Error) throw v;
      const r = typeof v === 'function' ? v(url, opts) : v;
      return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status || 200, statusText: r.statusText || '', headers: r.headers || { 'content-type': 'application/json' } });
    }
  }
  return new Response(JSON.stringify({}), { status: 404, statusText: 'Not Found', headers: { 'content-type': 'application/json' } });
};

function mk(reqInit = {}) {
  const rec = [];
  const ser = (x) => { try { return JSON.parse(JSON.stringify(x, (k, v) => (v instanceof Error ? 'Error:' + v.message : typeof v === 'function' ? 'fn' : v instanceof Map ? { $map: [...v] } : v))); } catch (e) { return String(x); } };
  const req = { body: {}, query: {}, params: {}, session: { save: (cb) => { rec.push(['session.save']); cb && cb(); } }, ip: '1.2.3.4', flash: (...a) => { rec.push(['flash', ...ser(a)]); }, ...reqInit };
  const res = {
    locals: {},
    render: (...a) => { rec.push(['render', ...ser(a)]); return res; },
    redirect: (...a) => { rec.push(['redirect', ...a]); return res; },
    status: (c) => { rec.push(['status', c]); return res; },
    json: (...a) => { rec.push(['json', ...ser(a)]); return res; },
    send: (...a) => { rec.push(['send', ...ser(a)]); return res; },
    write: (s) => { rec.push(['write', String(s).replace(/"timestamp":"[^"]+"/g, '"timestamp":"TS"')]); return true; },
    writeHead: (...a) => { rec.push(['writeHead', ...ser(a)]); return res; },
    end: (...a) => { rec.push(['end', ...ser(a)]); return res; },
  };
  const next = (...a) => { rec.push(['next', ...ser(a)]); };
  return { req, res, next, rec };
}
const out = [];
async function run(name, mod, fn, reqInit, fetchRoutes = {}) {
  routes = fetchRoutes;
  logs.length = 0;
  const { req, res, next, rec } = mk(reqInit);
  let thrown = null;
  try { const r = mod[fn](req, res, next); if (r && typeof r.then === 'function') await r; await new Promise((r) => setImmediate(r)); } catch (e) { thrown = (e && e.name) + ':' + (e && e.message); }
  out.push(JSON.stringify({ name, rec, thrown, logs, session: JSON.parse(JSON.stringify(req.session)) }));
}
module.exports = { run, out, mk, appDir, setRoutes: (r) => { routes = r; }, logs };
if (require.main === module) {
  (async () => {
    const which = process.argv[3];
    await require(path.join(__dirname, which))(module.exports);
    process.stdout.write(out.join('\n') + '\n');
    process.exit(0);
  })().catch((e) => { console.info('SCENARIO CRASH', e); process.exit(1); });
}
