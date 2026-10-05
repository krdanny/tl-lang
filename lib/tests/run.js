// Test suite: runs every example against its expected output, plus tlc build output,
// the Node loader, the canonicalizer and TL-level unit tests.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalize } from '../src/fmt.js';
import { inspect } from '../src/compile.js';
import { readable } from '../src/readable.js';
import { lex } from '../src/lexer.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tl = path.join(root, 'bin/tl.js');
const tlc = path.join(root, 'bin/tlc.js');
let pass = 0, fail = 0;

function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? `\n${detail}` : ''}`); }
}

function examples(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return examples(p);
    return e.name.endsWith('.tl') && fs.existsSync(p.replace(/\.tl$/, '.out')) ? [p] : [];
  });
}

const run = (args, cwd = root) => spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });

console.log('examples (tl run)');
for (const f of examples(path.join(root, 'examples'))) {
  const expected = fs.readFileSync(f.replace(/\.tl$/, '.out'), 'utf8');
  const r = run([tl, 'run', f]);
  check(path.relative(root, f), r.stdout === expected, r.stdout === expected ? '' : `--- expected\n${expected}--- got\n${r.stdout}${r.stderr}`);
}

console.log('node --import tl-lang/register');
{
  const f = path.join(root, 'examples/loops.tl');
  const r = run(['--import', path.join(root, 'src/register.js'), f]);
  check('loader runs loops.tl', r.stdout === fs.readFileSync(f.replace(/\.tl$/, '.out'), 'utf8'), r.stderr);
}

console.log('tlc build');
{
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'tlc-'));
  const r = run([tlc, path.join(root, 'examples/app'), '--outDir', out, '--rootDir', path.join(root, 'examples/app')]);
  check('tlc compiles examples/app', r.status === 0, r.stderr);
  check('tlc copies runtime', fs.existsSync(path.join(out, 'tl-runtime.js')));
  const js = run([path.join(out, 'main.js')]);
  check('compiled JS runs with plain node', js.stdout === fs.readFileSync(path.join(root, 'examples/app/main.out'), 'utf8'), js.stderr);
  fs.rmSync(out, { recursive: true, force: true });
}

console.log('tl test');
{
  const r = run([tl, 'test', path.join(root, 'examples/math.test.tl')]);
  check('TL unit tests pass', r.status === 0 && /5 passed, 0 failed/.test(r.stdout), r.stdout + r.stderr);
}

console.log('string escapes');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tlstr-'));
  fs.writeFileSync(path.join(dir, 'tl.def'), '');
  fs.writeFileSync(path.join(dir, 'cr.tl'), 's"a\\rb\\r\\nc"|print s.length(s.find"\\r")(s.split"\\r\\n").length');
  const r = run([tl, 'run', path.join(dir, 'cr.tl')]);
  check('\\r stays a carriage return in the generated JavaScript', r.stdout === '6 1 2\n', r.stdout + r.stderr);
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('canonical form');
for (const f of examples(path.join(root, 'examples'))) {
  const src = fs.readFileSync(f, 'utf8');
  const c = canonicalize(src);
  check(`fmt is stable: ${path.relative(root, f)}`, canonicalize(c) === c && c === src.replace(/\r?\n$/, ''), `canonical:\n${c}`);
}

console.log('diagnostics');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tld-'));
  fs.writeFileSync(path.join(tmp, 'tl.def'), '');
  const cases = [
    ['newline.tl', 'print 1\nprint 2', /E001/],
    ['space.tl', 'x 1 + 2', /E004|E106/],
    ['lt.tl', 'print 1<', /E104/],
    ['else.tl', 'else|print 1', /E109/],
    ['arity.tl', 'fn f a b|a<print(f 1 2 3)', /E106|E103/],
  ];
  for (const [name, src, re] of cases) {
    fs.writeFileSync(path.join(tmp, name), src);
    const r = run([tl, 'check', path.join(tmp, name)]);
    check(`diagnostic ${name}`, r.status === 1 && re.test(r.stderr), r.stderr);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('dictionary (tl.def)');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tldef-'));
  const file = (name, text) => { fs.writeFileSync(path.join(dir, name), text); return path.join(dir, name); };
  const main = file('main.tl', 'fn isLongName userId|userId*2<print(isLongName 21)');
  let r = run([tl, 'run', main]);
  check('no tl.def: nothing compiles (E260)', r.status !== 0 && /E260/.test(r.stderr), r.stderr);
  file('tl.def', '');
  r = run([tl, 'run', main]);
  check('a compound name in the source is an error (E261)', r.status !== 0 && /E261/.test(r.stderr) && /isLongName/.test(r.stderr), r.stderr);
  r = run([tl, 'def', dir]);
  const def = fs.readFileSync(path.join(dir, 'tl.def'), 'utf8');
  check('tl def writes the dictionary and rewrites the source', r.status === 0 && /^\w+ isLongName \w+ userId\n$/.test(def) && !/isLongName|userId/.test(fs.readFileSync(main, 'utf8')), r.stdout + r.stderr + def);
  r = run([tl, 'run', main]);
  check('the program runs with symbols', r.status === 0 && r.stdout === '42\n', r.stdout + r.stderr);
  r = run([tl, 'compile', main]);
  check('generated JavaScript uses the long names', /function isLongName\(userId\)/.test(r.stdout), r.stdout);
  r = run([tl, 'def', dir]);
  check('tl def is idempotent', /added 0 name/.test(r.stdout) && fs.readFileSync(path.join(dir, 'tl.def'), 'utf8') === def, r.stdout);
  r = run([tl, 'view', main]);
  check('tl view shows the long names', /fn isLongName userId/.test(r.stdout), r.stdout);
  file('tl.def', 'ab oneName\ncd twoName\n@mod main\n');
  r = run([tl, 'def', dir]);
  check('tl def puts all names on one line and keeps other entries', fs.readFileSync(path.join(dir, 'tl.def'), 'utf8') === "ab oneName cd twoName\n@mod main\n", fs.readFileSync(path.join(dir, 'tl.def'), 'utf8'));
  file('tl.def', def);
  file('tl.def', 'if someName\n');
  r = run([tl, 'check', main]);
  check('a language word cannot be a symbol (E254)', r.status === 1 && /E254/.test(r.stderr), r.stderr);
  file('tl.def', 'a someName\nb someName\n');
  r = run([tl, 'check', main]);
  check('one symbol per name (E252)', r.status === 1 && /E252/.test(r.stderr), r.stderr);
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('tl shrink');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tlshrink-'));
  fs.writeFileSync(path.join(dir, 'tl.def'), '');
  const f = path.join(dir, 's.tl');
  fs.writeFileSync(f, 'fn f x|if not x|^1<^(x+1)<print(f 0)(f 2');
  const before = run([tl, 'run', f]).stdout;
  const r = run([tl, 'shrink', f]);
  const after = fs.readFileSync(f, 'utf8');
  check('shrink keeps the program and removes tokens', r.status === 0 && after === 'fn f x|guard x|^1<x+1<print f 0(f 2' && run([tl, 'run', f]).stdout === before, after + r.stderr);
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('readable view (tl view)');
{
  // exact rendering of a small module
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tlr-'));
  fs.writeFileSync(path.join(dir, 'tl.def'), '');
  const f = path.join(dir, 'grade.tl');
  fs.writeFileSync(f, 'fn grade n|if n>=90|^"A<elif n>=80|^"B<"C<xs[95 85 10|ys xs>>map g=>|s grade g|s.lower<>>list|print(ys.join", "');
  const r = readable(inspect(fs.readFileSync(f, 'utf8'), { file: f }));
  fs.rmSync(dir, { recursive: true, force: true });
  const want = ['fn grade n', '    if n>=90', '        return "A"', '    elif n>=80', '        return "B"', '    "C"', '', 'xs = [95 85 10]', 'ys = xs >> map g =>', '    s = grade g', '    s.lower', '>> list', 'print(ys.join ", ")'].join('\n');
  check('layout, closers, words for sigils', r.text === want, r.text);
  check('outline', r.symbols.length === 1 && r.symbols[0].name === 'grade' && r.symbols[0].endLine === 5, JSON.stringify(r.symbols));

  // fidelity on every example: with sigils kept, the readable text lexes back to the tokens of the source
  const key = (t) => (t.t === 'id' ? `id:${t.short ?? t.v}` : t.t === 'str' ? 'str:' + JSON.stringify(t.v.parts.map((p) => (typeof p === 'string' ? p : p.code))) : t.t === 'raw' ? 'raw:' + t.v.text
    : t.t === 'pstr' ? `pstr:${t.v.prefix}:${t.v.lit.text ?? JSON.stringify(t.v.lit.parts)}:${t.v.flags}` : t.t === 'num' ? 'num:' + t.v.text + t.v.suffix : `${t.t}:${t.v === '|>' ? '>>' : t.v}`);
  const drop = (t) => ['|', '<', ';', 'eof'].includes(t.t) || (t.t === 'op' && [')', ']', '}'].includes(t.v));
  let same = 0, total = 0, firstBad = '';
  for (const file of examples(path.join(root, 'examples'))) {
    const info = inspect(fs.readFileSync(file, 'utf8'), { file });
    if (info.error) continue;
    total++;
    const text = readable(info, { keywords: false, unescape: false, blankLines: false }).text;
    const a = info.tokens.filter((t) => !drop(t)).map(key);
    const b = text.split('\n').flatMap((line) => lex(line.trimStart(), file)).filter((t) => !drop(t)).map(key);
    if (a.length === b.length && a.every((x, i) => x === b[i])) same++; else if (!firstBad) firstBad = file;
  }
  check(`token fidelity on ${total} examples`, total > 0 && same === total, firstBad);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
