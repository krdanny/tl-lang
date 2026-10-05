// Verifies every ```tl example in TL_INSTRUCTIONS.md and tl-dictionary/*.md:
// it must compile, run, print the ```text block that follows it (if any), and already be canonical.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalize as canon } from '../src/fmt.js';

const canonicalize = (src) => { try { return canon(src); } catch (e) { return `<<does not lex: ${e.message}>>`; } };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tl = path.join(root, 'bin/tl.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-docs-'));
fs.writeFileSync(path.join(tmp, 'tl.def'), ''); // every project has a dictionary; the examples need no entries
const files = [path.join(root, 'TL_INSTRUCTIONS.md'), ...fs.readdirSync(path.join(root, 'tl-dictionary')).filter((f) => f.endsWith('.md')).sort().map((f) => path.join(root, 'tl-dictionary', f))];
let pass = 0, fail = 0;

const report = (ok, name, detail) => {
  if (ok) pass++;
  else { fail++; console.log(`  FAIL ${name}\n${detail}`); }
};

function blocks(text) {
  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^```/.test(lines[i])) continue;
    const lang = lines[i].slice(3).trim();
    const body = [];
    let j = i + 1;
    while (j < lines.length && lines[j] !== '```') body.push(lines[j++]);
    out.push({ lang, body: body.join('\n'), line: i + 1 });
    i = j;
  }
  return out;
}

function runTl(args, cwd) {
  return spawnSync(process.execPath, [tl, ...args], { cwd, encoding: 'utf8' });
}

for (const file of files) {
  const rel = path.relative(root, file);
  const bs = blocks(fs.readFileSync(file, 'utf8'));
  const isDef = rel.endsWith('tl-def.md');
  const isTest = rel.endsWith('testing.md');
  if (isDef) {
    // project example: tl.def + users.tl + main.tl
    const dir = path.join(tmp, 'defproj');
    fs.mkdirSync(dir, { recursive: true });
    const def = bs.find((b) => b.lang === '' && /@mod users/.test(b.body));
    const tlBlocks = bs.filter((b) => b.lang === 'tl');
    // names example: `<symbol> <longName>` lines + one source that uses the symbols
    const names = bs.find((b) => b.lang === '' && /^ive isValidEmail /.test(b.body));
    const ndir = path.join(tmp, 'namesproj');
    fs.mkdirSync(ndir, { recursive: true });
    fs.writeFileSync(path.join(ndir, 'tl.def'), names.body + '\n');
    fs.writeFileSync(path.join(ndir, 'main.tl'), tlBlocks[0].body);
    const nr = runTl(['run', path.join(ndir, 'main.tl')]);
    report(nr.stdout === bs[bs.indexOf(tlBlocks[0]) + 1].body + '\n', `${rel}: names example`, nr.stdout + nr.stderr);
    const js = runTl(['compile', path.join(ndir, 'main.tl')]).stdout;
    report(/function isValidEmail\(s\)/.test(js) && /let user_id = 7/.test(js) && /"toUpperCase"/.test(js), `${rel}: names example emits long names`, js);
    fs.writeFileSync(path.join(dir, 'tl.def'), def.body + '\n');
    fs.writeFileSync(path.join(dir, 'users.tl'), tlBlocks[1].body);
    fs.writeFileSync(path.join(dir, 'main.tl'), tlBlocks[2].body);
    const expected = bs[bs.indexOf(tlBlocks[2]) + 1];
    const r = runTl(['run', path.join(dir, 'main.tl')]);
    report(r.stdout === expected.body + '\n', `${rel}: project example`, r.stdout + r.stderr);
    for (const b of tlBlocks) report(canonicalize(b.body) === b.body, `${rel}:${b.line} canonical`, canonicalize(b.body));
    continue;
  }
  bs.forEach((b, k) => {
    if (b.lang !== 'tl') return;
    const name = `${rel}:${b.line}`;
    report(!b.body.includes('\n'), `${name} one line`, b.body);
    report(canonicalize(b.body) === b.body, `${name} canonical`, `  canonical: ${canonicalize(b.body)}`);
    const f = path.join(tmp, `ex${pass + fail}.tl`);
    fs.writeFileSync(f, b.body);
    if (isTest) {
      const r = runTl(['test', f]);
      const exp = bs.find((x, i) => i > k && x.lang === 'text');
      report(r.status === 0 && r.stdout.includes(exp.body.trim().split('\n').pop()), `${name} tests`, r.stdout + r.stderr);
      return;
    }
    const r = runTl(['run', f]);
    const next = bs[k + 1];
    const expected = next && next.lang === 'text' && next.line === b.line + b.body.split('\n').length + 2 ? next.body + '\n' : null;
    report(r.status === 0 && (expected === null || r.stdout === expected), `${name} runs`, `  src: ${b.body}\n  expected:\n${expected}  got:\n${r.stdout}${r.stderr}`);
  });
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`docs: ${pass} checks passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
