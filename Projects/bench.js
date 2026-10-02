// Token benchmark: the same project in JavaScript, TypeScript and TL.
// usage: node bench.js [project…] [--tests-only] [--no-tests]
// Reads <project>/bench.json, counts tokens of each implementation with two tokenizers,
// runs the shared tests, and writes results/<project>.json, results/<project>.md and results/README.md.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import { encode as o200k } from 'gpt-tokenizer/encoding/o200k_base';
import { encode as cl100k } from 'gpt-tokenizer/encoding/cl100k_base';

const root = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const chosen = args.filter((a) => !a.startsWith('--'));
const projects = (chosen.length ? chosen : fs.readdirSync(root).filter((d) => fs.existsSync(path.join(root, d, 'bench.json')))).sort();
const resultsDir = path.join(root, 'results');
fs.mkdirSync(resultsDir, { recursive: true });

// a files entry may be a glob like "lib/*.js" (one directory level, sorted)
function expand(files, dir) {
  return files.flatMap((f) => {
    if (!f.includes('*')) return [f];
    const d = path.dirname(f);
    const re = new RegExp('^' + path.basename(f).replace(/[.]/g, '\\.').replace(/\*/g, '.*') + '$');
    return fs.readdirSync(path.join(dir, d)).filter((x) => re.test(x)).sort().map((x) => path.join(d, x));
  });
}

// JavaScript with its comments removed (acorn finds them; blank lines left behind are dropped)
function stripComments(text) {
  const ranges = [];
  try { acorn.parse(text, { ecmaVersion: 'latest', sourceType: 'module', onComment: (b, t, start, end) => ranges.push([start, end]) }); } catch { return null; }
  let out = ''; let pos = 0;
  for (const [a, b] of ranges) { out += text.slice(pos, a); pos = b; }
  out += text.slice(pos);
  return out.split('\n').filter((l) => l.trim()).join('\n') + '\n';
}

function measure(files, dir, lang) {
  const rows = expand(files, dir).map((f) => {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    const row = { file: f, chars: text.length, lines: text.split('\n').filter((l) => l.trim()).length, o200k: o200k(text).length, cl100k: cl100k(text).length };
    if (/\.[mc]?js$/.test(f)) { const nc = stripComments(text); if (nc !== null) row.o200k_nocomments = o200k(nc).length; }
    return row;
  });
  const sum = (k) => rows.reduce((a, r) => a + (r[k] ?? r.o200k), 0);
  return { files: rows, chars: sum('chars'), lines: sum('lines'), o200k: sum('o200k'), cl100k: sum('cl100k'), o200k_nocomments: sum('o200k_nocomments') };
}

function runTests(cfg, cmd, dir) {
  const r = spawnSync(process.execPath, [...cfg.test.slice(1), ...cmd], { cwd: dir, encoding: 'utf8', timeout: 600000 });
  const line = (r.stdout || '').trim().split('\n').pop() || '';
  return { ok: r.status === 0, summary: line, stderr: (r.stderr || '').trim().slice(0, 500) };
}

const all = [];
for (const name of projects) {
  const dir = path.join(root, name);
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'bench.json'), 'utf8'));
  const result = { project: name, title: cfg.title || name, date: new Date().toISOString().slice(0, 10), impls: {} };
  for (const [lang, impl] of Object.entries(cfg.impls)) {
    const m = flags.has('--tests-only') ? null : measure(impl.files, dir);
    const t = flags.has('--no-tests') ? null : runTests(cfg, impl.cmd, dir);
    result.impls[lang] = { ...(m || {}), tests: t, cmd: impl.cmd.join(' ') };
  }
  all.push(result);
  if (!flags.has('--tests-only')) fs.writeFileSync(path.join(resultsDir, `${name}.json`), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(resultsDir, `${name}.md`), projectMd(result));
  console.log(projectMd(result));
}

if (!chosen.length || flags.size === 0) {
  const existing = fs.readdirSync(resultsDir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(resultsDir, f), 'utf8')));
  fs.writeFileSync(path.join(resultsDir, 'README.md'), summaryMd(existing));
}

function pct(a, b) { return b ? `${Math.round((a / b) * 100)}%` : '—'; }
function red(a, b) { return a !== undefined && b ? `${Math.round((1 - a / b) * 100)}%` : '—'; }

function projectMd(r) {
  const langs = Object.keys(r.impls);
  const js = r.impls.js;
  const lines = [`# ${r.title} — ${r.date}`, ''];
  lines.push('| | ' + langs.map((l) => l.toUpperCase()).join(' | ') + ' |');
  lines.push('|---|' + langs.map(() => '---').join('|') + '|');
  const row = (label, f) => lines.push(`| ${label} | ` + langs.map((l) => f(r.impls[l], l)).join(' | ') + ' |');
  if (js && js.o200k !== undefined) {
    row('files', (i) => (i.files.length > 8 ? `${i.files.length} files` : i.files.map((f) => f.file).join(', ')));
    row('non-empty lines', (i) => String(i.lines));
    row('characters', (i) => `${i.chars} (${pct(i.chars, js.chars)})`);
    row('tokens o200k (GPT-4o/5)', (i) => `${i.o200k} (${pct(i.o200k, js.o200k)})`);
    row('tokens cl100k (GPT-4)', (i) => `${i.cl100k} (${pct(i.cl100k, js.cl100k)})`);
    row('token reduction vs JS', (i) => (i === js ? '—' : red(i.o200k, js.o200k)));
    const defOf = (i) => i.files.find((f) => f.file.endsWith('tl.def'));
    if (langs.some((l) => defOf(r.impls[l]))) {
      row('of which the dictionary (tl.def)', (i) => (defOf(i) ? `${defOf(i).o200k} tokens` : '—'));
      row('source files only', (i) => (defOf(i) ? `${i.o200k - defOf(i).o200k} (${red(i.o200k - defOf(i).o200k, js.o200k)} less than JS)` : '—'));
    }
    if (js.o200k_nocomments !== js.o200k) {
      row('tokens o200k, JS comments removed', (i) => String(i.o200k_nocomments ?? i.o200k));
      row('token reduction vs JS without comments', (i) => (i === js ? '—' : red(i.o200k, js.o200k_nocomments)));
    }
    if (r.impls.ts) row('token reduction vs TS', (i) => (i === r.impls.ts ? '—' : red(i.o200k, r.impls.ts.o200k)));
  }
  row('shared tests', (i) => (i.tests ? (i.tests.ok ? `pass (${i.tests.summary})` : `FAIL (${i.tests.summary || i.tests.stderr})`) : 'skipped'));
  row('run', (i) => `\`${i.cmd}\``);
  lines.push('', 'Percentages in parentheses are the size relative to JavaScript; the reduction rows are how many fewer tokens (o200k) a version uses. TL counts include `tl.def` when present.');
  return lines.join('\n') + '\n';
}

function summaryMd(results) {
  const lines = ['# Token benchmark results', '', 'Same spec, same tests, several languages. Tokens counted with the o200k tokenizer (GPT-4o / GPT-5 family). "Reduction" = how many fewer tokens TL uses than that version. TL counts include the project dictionary (`tl.def`), which is mandatory.', ''];
  lines.push('| Project | JS tokens | TS tokens | TL tokens | TL reduction vs JS | TL reduction vs JS without comments | TL reduction vs TS | JS+Express | TL reduction vs Express | tests |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|');
  results.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
  const tot = { js: 0, noc: 0, tl: 0 };
  for (const r of results) {
    const { js, ts, tl } = r.impls;
    const ex = r.impls['js-express'];
    if (js && tl) { tot.js += js.o200k; tot.noc += js.o200k_nocomments ?? js.o200k; tot.tl += tl.o200k; }
    const tests = Object.entries(r.impls).map(([l, i]) => `${l}: ${i.tests ? (i.tests.ok ? '✓' : '✗') : '–'}`).join(' ');
    const noc = js && js.o200k_nocomments !== js.o200k ? `**${red(tl?.o200k, js.o200k_nocomments)}** (${js.o200k_nocomments} tokens)` : 'same';
    lines.push(`| ${r.title} | ${js?.o200k ?? '—'} | ${ts?.o200k ?? '—'} | ${tl?.o200k ?? '—'} | **${red(tl?.o200k, js?.o200k)}** | ${noc} | ${ts ? `**${red(tl?.o200k, ts.o200k)}**` : '—'} | ${ex?.o200k ?? '—'} | ${ex ? `**${red(tl?.o200k, ex.o200k)}**` : '—'} | ${tests} |`);
  }
  lines.push(`| **Total** | **${tot.js}** | | **${tot.tl}** | **${red(tot.tl, tot.js)}** | **${red(tot.tl, tot.noc)}** (${tot.noc} tokens) | | | | |`);
  lines.push('', 'Per-project details: `results/<project>.md` and `results/<project>.json`.');
  return lines.join('\n') + '\n';
}
