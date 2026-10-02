// Black-box test for the Todo API. Usage: node run.js <command…>   (the command must accept <port> <data-file>)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const cmd = process.argv.slice(2);
if (!cmd.length) { console.error('usage: node run.js <command…>'); process.exit(2); }
const port = await new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-'));
const data = path.join(dir, 'todos.json');
const base = `http://127.0.0.1:${port}`;
let failed = 0, passed = 0;

async function req(method, p, body) {
  const r = await fetch(base + p, { method, headers: body !== undefined ? { 'content-type': 'application/json' } : {}, body });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: r.status, json, type: r.headers.get('content-type') || '' };
}

function check(name, cond, got) {
  if (cond) passed++; else { failed++; console.log(`  FAIL ${name}: ${JSON.stringify(got)}`); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function stop(child) {
  if (child.exitCode !== null) return;
  await new Promise((resolve) => { child.once('exit', resolve); child.kill(); setTimeout(() => child.kill('SIGKILL'), 2000).unref(); });
}

async function start(args) {
  const child = spawn(args[0], [...args.slice(1), String(port), data], { stdio: ['ignore', 'pipe', 'pipe'] });
  let err = '';
  child.stderr.on('data', (d) => { err += d; });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`server did not start: ${err}`)), 8000);
    child.stdout.on('data', (d) => { if (String(d).includes('listening')) { clearTimeout(t); resolve(); } });
    child.on('exit', (c) => reject(new Error(`server exited with ${c}: ${err}`)));
  });
  return child;
}

let child = await start(cmd);
try {
  let r = await req('GET', '/todos');
  check('empty list', r.status === 200 && eq(r.json, []) && r.type.includes('application/json'), r);
  r = await req('POST', '/todos', JSON.stringify({ title: '  Buy milk ' }));
  check('create', r.status === 201 && eq(r.json, { id: 1, title: 'Buy milk', done: false }), r);
  r = await req('POST', '/todos', JSON.stringify({ title: 'Write tests', done: true }));
  check('create done', r.status === 201 && eq(r.json, { id: 2, title: 'Write tests', done: true }), r);
  r = await req('POST', '/todos', JSON.stringify({ title: '   ' }));
  check('empty title', r.status === 400 && eq(r.json, { error: 'title required' }), r);
  r = await req('POST', '/todos', JSON.stringify({ done: true }));
  check('missing title', r.status === 400 && eq(r.json, { error: 'title required' }), r);
  r = await req('POST', '/todos', '{not json');
  check('invalid json', r.status === 400 && eq(r.json, { error: 'invalid json' }), r);
  r = await req('GET', '/todos/1');
  check('get one', r.status === 200 && eq(r.json, { id: 1, title: 'Buy milk', done: false }), r);
  r = await req('GET', '/todos/99');
  check('get missing', r.status === 404 && eq(r.json, { error: 'not found' }), r);
  r = await req('GET', '/todos/abc');
  check('get bad id', r.status === 404, r);
  r = await req('PUT', '/todos/1', JSON.stringify({ done: true }));
  check('update done', r.status === 200 && eq(r.json, { id: 1, title: 'Buy milk', done: true }), r);
  r = await req('PUT', '/todos/1', JSON.stringify({ title: 'Buy oat milk' }));
  check('update title', r.status === 200 && eq(r.json, { id: 1, title: 'Buy oat milk', done: true }), r);
  r = await req('PUT', '/todos/1', JSON.stringify({ title: '' }));
  check('update bad title', r.status === 400 && eq(r.json, { error: 'title required' }), r);
  r = await req('PUT', '/todos/7', JSON.stringify({ done: true }));
  check('update missing', r.status === 404, r);
  r = await req('GET', '/todos?done=true');
  check('filter done', r.status === 200 && r.json.length === 2 && r.json.every((t) => t.done), r);
  r = await req('POST', '/todos', JSON.stringify({ title: 'Third' }));
  r = await req('GET', '/todos?done=false');
  check('filter open', r.status === 200 && eq(r.json, [{ id: 3, title: 'Third', done: false }]), r);
  r = await req('GET', '/stats');
  check('stats', r.status === 200 && eq(r.json, { total: 3, done: 2, open: 1 }), r);
  r = await req('DELETE', '/todos/2');
  check('delete', r.status === 204 && r.json === null, r);
  r = await req('DELETE', '/todos/2');
  check('delete again', r.status === 404, r);
  r = await req('GET', '/nope');
  check('unknown route', r.status === 404 && eq(r.json, { error: 'not found' }), r);
  r = await req('POST', '/todos', JSON.stringify({ title: 'Fourth' }));
  check('id not reused', r.status === 201 && r.json.id === 4, r);
} finally {
  await stop(child);
}
// persistence: restart and check the data survived
child = await start(cmd);
try {
  const r = await req('GET', '/todos');
  check('persisted', r.status === 200 && eq(r.json.map((t) => t.id), [1, 3, 4]), r);
  const s = await req('POST', '/todos', JSON.stringify({ title: 'Fifth' }));
  check('next id persisted', s.status === 201 && s.json.id === 5, s);
} finally {
  await stop(child);
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
