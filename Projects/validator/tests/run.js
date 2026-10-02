// Runs validator.js's own test cases against an implementation.
//   node run.js original        the npm package (the original JavaScript)
//   node run.js tl              TL modules in ../tl/<name>.tl
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { register } from 'node:module';

const require = createRequire(import.meta.url);
const dir = path.dirname(new URL(import.meta.url).pathname);
const which = process.argv[2] || 'original';
const only = process.argv[3];
// Some upstream cases are relative to today ("tomorrow is after now"), so the fixture is rebuilt on every run.
{
  const { execFileSync } = await import('node:child_process');
  const up = path.join(dir, 'upstream');
  const files = [path.join(up, 'validators.test.js'), ...fs.readdirSync(path.join(up, 'validators')).sort().map((f) => path.join(up, 'validators', f))];
  execFileSync(process.execPath, [path.join(dir, 'extract.js'), ...files], { stdio: 'ignore' });
}
const cases = JSON.parse(fs.readFileSync(path.join(dir, 'cases.json'), 'utf8'));
const sanitizers = JSON.parse(fs.readFileSync(path.join(dir, 'sanitizer-cases.json'), 'utf8'));

function decode(v) {
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === 'object') {
    if ('__re' in v) return new RegExp(v.__re, v.flags);
    if ('__date' in v) return new Date(v.__date);
    if ('__fn' in v) { try { return (0, eval)(`(${v.__fn})`); } catch { return (0, eval)(`({ ${v.__fn} })`)[v.__fn.split('(')[0].trim()]; } }
    if ('__num' in v) return Number(v.__num);
    if ('__undef' in v) return undefined;
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x)]));
  }
  return v;
}

let impl;
if (which === 'original') impl = (await import(pathToFileURL(path.join(dir, '../original-build/index.js')).href)).default;
else {
  register(pathToFileURL(path.join(dir, '../../../lib/src/hooks.js')).href);
  impl = {};
  const tlDir = path.join(dir, '..', which);
  for (const f of fs.readdirSync(tlDir).filter((x) => x.endsWith('.tl'))) {
    const name = f.replace(/\.tl$/, '');
    try {
      const m = await import(pathToFileURL(path.join(tlDir, f)).href);
      if (m[name]) impl[name] = m[name];
    } catch (e) { console.log(`  LOAD FAIL ${f}: ${String(e.message).split('\n')[0]}`); }
  }
}

const byValidator = new Map();
const note = (name, ok, msg) => {
  const s = byValidator.get(name) || { pass: 0, fail: 0, msgs: [] };
  if (ok) s.pass++; else { s.fail++; if (s.msgs.length < 3) s.msgs.push(msg); }
  byValidator.set(name, s);
};
const same = (a, b) => (Number.isNaN(a) && Number.isNaN(b)) || a === b || JSON.stringify(a) === JSON.stringify(b);

for (const c of cases) {
  if (only && c.validator !== only) continue;
  const fn = impl[c.validator];
  const args = decode(c.args);
  if (typeof fn !== 'function') { note(c.validator, false, 'missing'); continue; }
  for (const v of decode(c.valid)) { let r; try { r = fn(v, ...args); } catch (e) { r = `threw ${e.message}`; } note(c.validator, r === true, `valid ${JSON.stringify(v)} -> ${r}`); }
  for (const v of decode(c.invalid)) { let r; try { r = fn(v, ...args); } catch (e) { r = `threw ${e.message}`; } note(c.validator, r === false, `invalid ${JSON.stringify(v)} -> ${r}`); }
  for (const v of decode(c.error)) { let threw = false; try { fn(v, ...args); } catch { threw = true; } note(c.validator, threw, `error ${JSON.stringify(v)} did not throw`); }
}
for (const c of sanitizers) {
  if (only && c.sanitizer !== only) continue;
  const fn = impl[c.sanitizer];
  if (typeof fn !== 'function') { note(c.sanitizer, false, 'missing'); continue; }
  for (const [input, expected] of Object.entries(c.expect)) {
    let r; try { r = fn(input, ...c.args); } catch (e) { r = `threw ${e.message}`; }
    note(c.sanitizer, same(r, expected), `${JSON.stringify(input)} -> ${JSON.stringify(r)} expected ${JSON.stringify(expected)}`);
  }
}

let pass = 0, fail = 0;
for (const [name, s] of [...byValidator].sort()) {
  pass += s.pass; fail += s.fail;
  if (s.fail) console.log(`  FAIL ${name}: ${s.fail} of ${s.pass + s.fail}  e.g. ${s.msgs.join(' | ').slice(0, 300)}`);
}
console.log(`${byValidator.size} functions, ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
