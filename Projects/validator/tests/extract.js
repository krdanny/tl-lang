// Extracts every test({...}) case from validator.js's own test suite into cases.json.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const validator = require('validator');
// argv[2] = validators.test.js, argv[3..] = test/validators/*.test.js
const files = process.argv.slice(2);
const load = (f) => fs.readFileSync(f, 'utf8')
  .replace(/^import .*$/gm, '')
  .replace(/^let validator_js = .*$/m, 'let validator_js = "";');
const cases = [];
const encode = (v) => {
  const tag = Object.prototype.toString.call(v);   // values come from another vm realm: instanceof does not work
  if (tag === '[object RegExp]') return { __re: v.source, flags: v.flags };
  if (tag === '[object Date]') return { __date: Number.isNaN(v.getTime()) ? 'invalid' : v.toISOString() };
  if (typeof v === 'function') return { __fn: v.toString() };
  if (v === undefined) return { __undef: true };
  if (Array.isArray(v)) return v.map(encode);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)]));
  if (typeof v === 'number' && !Number.isFinite(v)) return { __num: String(v) };
  return v;
};
let current = '';
const ctx = {
  describe: (name, fn) => fn(), it: (name, fn) => { current = name; try { fn(); } catch (e) { /* direct assertions on the package are not part of the fixture */ } },
  test: (o) => cases.push({ it: current, validator: o.validator, args: encode(o.args || []), valid: encode(o.valid || []), invalid: encode(o.invalid || []), error: encode(o.error || []) }),
  assert, validator, fs, vm, require, console, timezone_mock: require('timezone-mock'), Buffer, process, format: require('node:util').format,
};
for (const f of files) vm.runInNewContext(load(f), ctx, { filename: f });
fs.writeFileSync(new URL('./cases.json', import.meta.url), JSON.stringify(cases, null, 1));
const names = new Set(cases.map((c) => c.validator));
console.log(`${cases.length} cases, ${names.size} validators, ${cases.reduce((a, c) => a + c.valid.length + c.invalid.length + c.error.length, 0)} inputs`);
