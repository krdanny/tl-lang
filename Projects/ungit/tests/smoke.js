// Compares the two implementations on what Ungit's unit tests do not load: server.js, ungit-plugin.js, sysinfo.js
// and bugtracker.js. It is not part of the benchmark (bench.json runs tests/run.js); it is a second check.
//   node tests/smoke.js          original and tl, without and with authentication
//
// For each implementation it builds the runnable tree (tests/run.js), starts the server on a free local port with
// its own HOME, a plugin folder and a small repository in the system temp folder, sends the same HTTP and socket.io
// (long polling) requests and compares the normalized answers. Nothing leaves the machine: /api/latestversion,
// which asks the npm registry, is not called, and bug tracking stays off.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); });

async function run(impl, auth) {
  const tree = path.join(root, '.run', impl);
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ungit-smoke-'));
  const home = path.join(work, 'home');
  fs.mkdirSync(home);
  fs.writeFileSync(path.join(home, '.gitconfig'), '[user]\n\tname = Ungit Bench\n\temail = bench@example.com\n[init]\n\tdefaultBranch = master\n');
  const env = { ...process.env, HOME: home, USERPROFILE: home, GIT_CONFIG_GLOBAL: path.join(home, '.gitconfig'), GIT_CONFIG_NOSYSTEM: '1' };

  // a plugin with a server part and every kind of export, a disabled plugin and a folder that is not a plugin
  const plug = path.join(work, 'plugins', 'demo');
  fs.mkdirSync(plug, { recursive: true });
  fs.writeFileSync(path.join(plug, 'ungit-plugin.json'), JSON.stringify({ server: 'server.js', exports: { raw: ['raw.html'], javascript: ['a.js', 'b.js'], knockoutTemplates: { tpl: 'tpl.html' }, css: 'style.css' } }));
  fs.writeFileSync(path.join(plug, 'server.js'), "exports.install = (env) => { env.app.get(env.httpPath + '/hello', env.ensureAuthenticated, (req, res) => res.json({ keys: Object.keys(env).sort(), httpPath: env.httpPath, api: env.pluginApiVersion, cfg: env.pluginConfig, git: typeof env.git, gitStatus: typeof env.git.status })); };\n");
  for (const [f, text] of [['raw.html', '<b>raw</b>'], ['a.js', '1'], ['b.js', '2'], ['tpl.html', '<i>tpl</i>'], ['style.css', 'b{}']]) fs.writeFileSync(path.join(plug, f), text);
  fs.mkdirSync(path.join(work, 'plugins', 'off'));
  fs.writeFileSync(path.join(work, 'plugins', 'off', 'ungit-plugin.json'), JSON.stringify({ disabled: true }));
  fs.mkdirSync(path.join(work, 'plugins', 'notaplugin'));
  const repo = path.join(work, 'repo');
  fs.mkdirSync(repo);
  execFileSync('git', ['init', '-q', repo], { env });
  fs.writeFileSync(path.join(repo, '.gitignore'), 'ignored.txt\n');

  // the frontend is not part of the benchmark: a stand-in page with the two placeholders the server fills in
  fs.mkdirSync(path.join(tree, 'components'), { recursive: true });
  fs.mkdirSync(path.join(tree, 'public'), { recursive: true });
  fs.writeFileSync(path.join(tree, 'public', 'index.html'), '<html><!-- ungit-plugins-placeholder -->|__ROOT_PATH__|__ROOT_PATH__</html>');
  fs.writeFileSync(path.join(tree, 'public', 'static.txt'), 'static file');
  fs.writeFileSync(path.join(tree, 'launch-smoke.js'), "require('./source/server');\n");

  const args = ['launch-smoke.js', `--port=${port}`, '--no-launchBrowser', '--no-bugtracking', `--pluginDirectory=${path.join(work, 'plugins')}`, '--rootPath=ug', '--logLevel=error', '--dev'];
  if (auth) args.push('--authentication', '--users.bob=secret');
  const child = spawn(process.execPath, args, { cwd: tree, env });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (out += d));

  // paths, the port and socket ids differ between runs; stack traces differ between implementations
  const norm = (s) => String(s).split(work).join('<WORK>').split(tree).join('<TREE>').split(String(port)).join('<PORT>')
    .replace(/"sid":"[^"]+"/g, '"sid":"<SID>"').replace(/"homedir":"[^"]+"/, '"homedir":"<HOME>"');
  const results = [];
  let cookie = '';
  async function hit(label, method, url, body, raw) {
    const headers = { ...(body !== undefined ? { 'content-type': raw ? 'text/plain;charset=UTF-8' : 'application/json' } : {}), ...(cookie ? { cookie } : {}) };
    const r = await fetch(base + url, { method, headers, body: body === undefined ? undefined : raw ? body : JSON.stringify(body), redirect: 'manual' });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    let text = await r.text();
    try { const j = JSON.parse(text); if (j && j.stack) { j.stack = String(j.stack).split('\n')[0]; text = JSON.stringify(j); } } catch { /* not JSON */ }
    if (text.includes('\x1e')) text = text.split('\x1e').sort().join('\x1e'); // socket.io packets of two independent watchers
    results.push({ label, status: r.status, type: (r.headers.get('content-type') || '').split(';')[0], location: r.headers.get('location') || '', cache: r.headers.get('cache-control') || '', body: norm(text) });
    return text;
  }
  const q = (p) => encodeURIComponent(p);
  try {
    for (let i = 0; i < 150 && !out.includes('## Ungit started ##'); i++) await sleep(100);
    if (!out.includes('## Ungit started ##')) throw new Error(`server did not start:\n${out}`);
    await hit('request outside the root path', 'GET', '/api/ping');
    await hit('redirect to the root path', 'GET', '/ug');
    await hit('ping', 'GET', '/ug/api/ping');
    if (auth) {
      await hit('userconfig without login', 'GET', '/ug/api/userconfig');
      await hit('loggedin before login', 'GET', '/ug/api/loggedin');
      await hit('login with a wrong password', 'POST', '/ug/api/login', { username: 'bob', password: 'nope' });
      await hit('login', 'POST', '/ug/api/login', { username: 'bob', password: 'secret' });
      await hit('loggedin after login', 'GET', '/ug/api/loggedin');
    }
    await hit('index page with plugins', 'GET', '/ug/');
    await hit('index page again', 'GET', '/ug/');
    await hit('static file', 'GET', '/ug/static.txt');
    await hit('serverdata.js', 'GET', '/ug/serverdata.js');
    await hit('gitversion', 'GET', '/ug/api/gitversion');
    await hit('userconfig, none yet', 'GET', '/ug/api/userconfig');
    await hit('userconfig write', 'POST', '/ug/api/userconfig', { a: 1, b: [2] });
    await hit('userconfig read', 'GET', '/ug/api/userconfig');
    results.push({ label: '.ungitrc written', body: fs.readFileSync(path.join(home, '.ungitrc'), 'utf8') });
    await hit('fs/exists yes', 'GET', `/ug/api/fs/exists?path=${q(repo)}`);
    await hit('fs/exists no', 'GET', `/ug/api/fs/exists?path=${q(`${repo}x`)}`);
    await hit('fs/listDirectories', 'GET', `/ug/api/fs/listDirectories?term=${q(path.join(work, 'plugins'))}`);
    await hit('fs/listDirectories of a missing folder', 'GET', `/ug/api/fs/listDirectories?term=${q(path.join(work, 'nope'))}`);
    await hit('plugin server route', 'GET', '/ug/api/plugins/demo/hello');
    await hit('plugin static file', 'GET', '/ug/plugins/demo/a.js');
    await hit('status', 'GET', `/ug/api/status?path=${q(repo)}`);
    await hit('status of a missing path', 'GET', `/ug/api/status?path=${q(`${repo}x`)}`);
    await hit('gitlog with an invalid number', 'GET', `/ug/api/gitlog?path=${q(repo)}&limit=abc`);
    await hit('gitlog', 'GET', `/ug/api/gitlog?path=${q(repo)}&limit=5`);
    await hit('quickstatus', 'GET', `/ug/api/quickstatus?path=${q(work)}`);
    await hit('fetch with an unknown socket', 'GET', `/ug/api/fetch?path=${q(repo)}&remote=origin&socketId=77`);
    await hit('credentials with an unknown socket', 'GET', '/ug/api/credentials?socketId=5&remote=origin');
    await hit('request without a path or a body', 'POST', '/ug/api/init', '{bad', true);
    await hit('unknown route', 'GET', '/ug/api/nothing');
    // socket.io over long polling (engine.io protocol 4)
    const sid = JSON.parse((await hit('socket handshake', 'GET', '/ug/socket.io/?EIO=4&transport=polling')).slice(1)).sid;
    const sio = `/ug/socket.io/?EIO=4&transport=polling&sid=${sid}`;
    await hit('socket connect', 'POST', sio, '40', true);
    await hit('socket connected event', 'GET', sio);
    await hit('socket watch', 'POST', sio, `42["watch",{"path":${JSON.stringify(repo)}}]`, true);
    await sleep(1200);
    fs.writeFileSync(path.join(repo, 'ignored.txt'), 'x'); // ignored by .gitignore: no event
    await sleep(300);
    fs.writeFileSync(path.join(repo, 'file.txt'), 'x');
    execFileSync('git', ['add', '-A'], { cwd: repo, env });
    await sleep(1500);
    await hit('socket events after a change', 'GET', sio);
    await hit('fetch with a known socket', 'GET', `/ug/api/fetch?path=${q(repo)}&remote=origin&socketId=0`);
    const cred = hit('credentials answered over the socket', 'GET', '/ug/api/credentials?socketId=0&remote=origin');
    await sleep(300);
    await hit('socket request-credentials event', 'GET', sio);
    await hit('socket credentials reply', 'POST', sio, '42["credentials",{"username":"u","password":"p"}]', true);
    await cred;
    await hit('socket close', 'POST', sio, '1', true);
    if (auth) await hit('logout', 'GET', '/ug/api/logout');
    await hit('cleanup', 'POST', '/ug/api/testing/cleanup');
  } catch (e) {
    results.push({ label: 'HARNESS ERROR', body: String(e.stack) });
  }
  child.kill('SIGTERM');
  await sleep(200);
  fs.rmSync(work, { recursive: true, force: true });
  return results.sort((a, b) => a.label.localeCompare(b.label));
}

(async () => {
  let compared = 0;
  const different = [];
  for (const impl of ['original', 'tl']) execFileSync(process.execPath, [path.join(__dirname, 'run.js'), impl, 'file-type'], { cwd: root });
  for (const auth of [false, true]) {
    const a = await run('original', auth);
    const b = await run('tl', auth);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      compared++;
      if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) {
        different.push(`${auth ? 'auth: ' : ''}${(a[i] || b[i]).label}`);
        console.log(`DIFFERENT ${auth ? '(with authentication) ' : ''}${(a[i] || b[i]).label}\n  original ${JSON.stringify(a[i]).slice(0, 400)}\n  tl       ${JSON.stringify(b[i]).slice(0, 400)}`);
      }
    }
  }
  console.log(`${compared} answers compared, ${different.length} different`);
  process.exit(0);
})();
