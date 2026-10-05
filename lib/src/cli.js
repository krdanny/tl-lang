// `tl` and `tlc` command-line interfaces.
//   tlc                      compile the project described by tlconfig.json (like `tsc`)
//   tl run app.tl [args]     compile in memory and run (like `tsx app.ts`)
//   tl test [files|dirs]     run `test"…|` blocks
//   tl check / fmt / view    diagnostics, canonical form, virtual view

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { register } from 'node:module';
import { compileFile, compileSource, formatError, inspect, RUNTIME_PATH, findDef } from './compile.js';
import { readable, longNames } from './readable.js';
import { generateDef, expandDef } from './defgen.js';
import { canonicalize, view } from './fmt.js';
import { shrinkFile } from './shrink.js';
import { parseDef } from './def.js';

const VERSION = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

// ───────────────────────── tlc ─────────────────────────
const DEFAULT_CONFIG = {
  compilerOptions: { rootDir: 'src', outDir: 'dist', runtime: 'copy' },
  include: ['src'],
};

function readConfig(configPath) {
  const file = path.resolve(configPath || 'tlconfig.json');
  if (!fs.existsSync(file)) return { base: process.cwd(), config: null };
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { base: path.dirname(file), config: { ...DEFAULT_CONFIG, ...config, compilerOptions: { ...DEFAULT_CONFIG.compilerOptions, ...(config.compilerOptions || {}) } } };
}

function tlFilesIn(p) {
  if (!fs.existsSync(p)) return [];
  if (fs.statSync(p).isFile()) return p.endsWith('.tl') ? [p] : [];
  return fs.readdirSync(p, { withFileTypes: true }).flatMap((e) => (e.name === 'node_modules' || e.name.startsWith('.') ? [] : tlFilesIn(path.join(p, e.name))));
}

function parseFlags(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) flags[k] = v;
      else if (['outDir', 'rootDir', 'project', 'runtime'].includes(k)) flags[k] = argv[++i];
      else flags[k] = true;
    } else if (a === '-p') flags.project = argv[++i];
    else if (a === '-w') flags.watch = true;
    else rest.push(a);
  }
  return { flags, rest };
}

export async function tlc(argv) {
  const { flags, rest } = parseFlags(argv);
  if (flags.version || flags.v) return console.log(`tlc ${VERSION}`);
  if (flags.help || flags.h) return console.log(TLC_HELP);
  if (flags.init) return init();
  const { base, config } = readConfig(flags.project);
  const opts = { ...(config?.compilerOptions || DEFAULT_CONFIG.compilerOptions), ...pick(flags, ['outDir', 'rootDir', 'runtime']) };
  const rootDir = path.resolve(base, opts.rootDir);
  const outDir = path.resolve(base, opts.outDir);
  const inputs = rest.length ? rest.map((r) => path.resolve(r)) : (config?.include || ['.']).map((i) => path.resolve(base, i));
  const build = () => {
    const files = inputs.flatMap(tlFilesIn);
    let errors = 0;
    for (const f of files) {
      try {
        const rel = path.relative(fs.existsSync(rootDir) && f.startsWith(rootDir) ? rootDir : path.dirname(f), f);
        const outFile = path.join(outDir, rel.replace(/\.tl$/, '.js'));
        const runtime = opts.runtime === 'package' ? 'tl-lang/runtime' : relImport(path.dirname(outFile), path.join(outDir, 'tl-runtime.js'));
        const { js } = compileFile(f, { runtime });
        if (!flags.noEmit) {
          fs.mkdirSync(path.dirname(outFile), { recursive: true });
          fs.writeFileSync(outFile, js);
        }
      } catch (e) {
        errors++;
        console.error(`${path.relative(process.cwd(), f)}: ${formatError(e, f)}`);
      }
    }
    if (!flags.noEmit && files.length) {
      fs.mkdirSync(outDir, { recursive: true });
      if (opts.runtime !== 'package') fs.copyFileSync(RUNTIME_PATH, path.join(outDir, 'tl-runtime.js'));
      // Output is ES modules; mark the directory so Node does not have to guess.
      const pkg = path.join(outDir, 'package.json');
      if (!fs.existsSync(pkg)) fs.writeFileSync(pkg, '{ "type": "module" }\n');
    }
    const summary = `${files.length} file(s), ${errors} error(s)`;
    if (errors) console.error(summary); else if (flags.verbose || flags.watch) console.log(summary);
    return errors;
  };
  const errors = build();
  if (flags.watch) {
    console.log('watching for changes…');
    let timer = null;
    for (const dir of inputs) fs.watch(dir, { recursive: true }, (_, name) => {
      if (!name || !/\.(tl|def)$/.test(name)) return;
      clearTimeout(timer);
      timer = setTimeout(() => { console.log(`\n[${new Date().toLocaleTimeString()}] ${name} changed`); build(); }, 50);
    });
    return;
  }
  process.exitCode = errors ? 1 : 0;
}

function relImport(fromDir, target) {
  let r = path.relative(fromDir, target).split(path.sep).join('/');
  if (!r.startsWith('.')) r = `./${r}`;
  return r;
}

function pick(o, keys) { return Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]])); }

function init() {
  if (fs.existsSync('tlconfig.json')) return console.error('tlconfig.json already exists');
  fs.writeFileSync('tlconfig.json', JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
  fs.mkdirSync('src', { recursive: true });
  if (!fs.existsSync('src/main.tl')) fs.writeFileSync('src/main.tl', 'print"Hello from TL');
  if (!fs.existsSync('src/tl.def')) fs.writeFileSync('src/tl.def', '# tl.def: the dictionary of this project. One line per compound name: <symbol> <longName>\n');
  if (!fs.existsSync('package.json')) {
    const name = path.basename(process.cwd()).toLowerCase().replace(/[^a-z0-9-]/g, '-');
    fs.writeFileSync('package.json', JSON.stringify({ name, version: '0.1.0', type: 'module', scripts: { build: 'tlc', start: 'node dist/main.js', dev: 'tl run src/main.tl', test: 'tl test src' } }, null, 2) + '\n');
  }
  console.log('created tlconfig.json, package.json, src/main.tl, src/tl.def');
}

const TLC_HELP = `tlc — the TL compiler (TL -> JavaScript)

usage: tlc [files…] [options]
  -p, --project <tlconfig.json>   project file (default ./tlconfig.json)
  --outDir <dir>                  output directory (default dist)
  --rootDir <dir>                 source root (default src)
  --runtime copy|package          copy tl-runtime.js into outDir, or import "tl-lang/runtime"
  --noEmit                        type-check only
  -w, --watch                     recompile on change
  --init                          create tlconfig.json and src/main.tl`;

// ───────────────────────── tl ─────────────────────────
export async function tl(argv) {
  const [cmd, ...args] = argv;
  switch (cmd) {
    case 'run': return run(args);
    case 'test': return testCmd(args);
    case 'check': return check(args);
    case 'fmt': return fmtCmd(args);
    case 'shrink': return shrinkCmd(args);
    case 'view': return viewCmd(args);
    case 'def': return defCmd(args);
    case 'build': return tlc(args);
    case 'compile': return compileCmd(args);
    case 'init': return init();
    case '--version': case '-v': case 'version': return console.log(`tl ${VERSION}`);
    case undefined: case 'help': case '--help': case '-h': return console.log(TL_HELP);
    default:
      if (cmd.endsWith('.tl')) return run(argv);
      console.error(`unknown command '${cmd}'\n\n${TL_HELP}`);
      process.exitCode = 1;
  }
}

const TL_HELP = `tl — TL (Token Language) for Node.js

usage:
  tl run <file.tl> [args…]     compile in memory and run (also: tl <file.tl>)
  tl test [files|dirs…]        run test"…|… blocks
  tl check <file.tl…>          report diagnostics without emitting
  tl compile <file.tl>         print the generated JavaScript
  tl fmt <file.tl…> [--check]  rewrite files in canonical form (minimal spacing and closers)
  tl shrink <file.tl|dir…>     remove tokens that do not change the program (redundant ^ and parentheses,
                               if not → guard, +npm./+node. prefixes, process.env. → env.); --check only reports
  tl def [dir] [--check]       write tl.def: give every compound name a short symbol and use it in the .tl files
                               (--expand: put the long names back into the sources, for editing)
  tl view <file.tl>            show the readable view: indented, closers restored, long names from tl.def,
                               return/import/= spelled out (--short: symbols as written, --sigils: keep ^ + !,
                               --plain: segments only)
  tl build                     same as tlc
  tl init                      create tlconfig.json and src/main.tl

run TL files directly with Node:  node --import tl-lang/register app.tl`;

function registerHooks() {
  register('./hooks.js', import.meta.url);
}

async function run(args) {
  const [file, ...rest] = args;
  if (!file) { console.error('usage: tl run <file.tl> [args…]'); process.exitCode = 1; return; }
  const abs = path.resolve(file);
  try { compileFile(abs); } catch (e) { console.error(formatError(e, abs)); process.exitCode = 1; return; }
  registerHooks();
  process.argv = [process.argv[0], abs, ...rest];
  try {
    await import(pathToFileURL(abs).href);
  } catch (e) {
    reportRuntimeError(e);
  }
}

function reportRuntimeError(e) {
  const name = e?.constructor?.$tlName;
  if (e && e.$panic) console.error(`panic: ${e.message}`);
  else if (name) console.error(`error: ${name}${e.message && e.message !== name ? `: ${e.message}` : ''}`);
  else console.error(e?.stack || String(e));
  process.exitCode = 1;
}

async function testCmd(args) {
  const { flags, rest } = parseFlags(args);
  const files = (rest.length ? rest : ['.']).flatMap((p) => tlFilesIn(path.resolve(p)));
  registerHooks();
  let ok = 0, bad = 0;
  const { runTests } = await import(pathToFileURL(RUNTIME_PATH).href);
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    if (!/(^|[|<;@])test(\s+prop)?"/.test(src)) continue;
    console.log(path.relative(process.cwd(), f));
    try { compileFile(f); } catch (e) { console.error(formatError(e, f)); bad++; continue; }
    try { await import(pathToFileURL(f).href + `?t=${Date.now()}`); } catch (e) { reportRuntimeError(e); bad++; continue; }
  }
  const r = await runTests(flags.filter);
  ok += r.passed; bad += r.failed;
  console.log(`\n${ok} passed, ${bad} failed`);
  process.exitCode = bad ? 1 : 0;
}

function check(args) {
  let errors = 0;
  for (const f of args.flatMap((a) => tlFilesIn(path.resolve(a)))) {
    try { compileFile(f); } catch (e) { errors++; console.error(`${path.relative(process.cwd(), f)}: ${formatError(e, f)}`); }
  }
  if (!errors) console.log('no errors');
  process.exitCode = errors ? 1 : 0;
}

function compileCmd(args) {
  const f = path.resolve(args[0]);
  try { process.stdout.write(compileFile(f).js); } catch (e) { console.error(formatError(e, f)); process.exitCode = 1; }
}

function fmtCmd(args) {
  const { flags, rest } = parseFlags(args);
  let changed = 0;
  for (const f of rest.flatMap((a) => tlFilesIn(path.resolve(a)))) {
    const src = fs.readFileSync(f, 'utf8');
    let out;
    try { out = canonicalize(src); } catch (e) { console.error(`${f}: ${formatError(e, f)}`); process.exitCode = 1; continue; }
    if (out === src) continue;
    changed++;
    if (flags.check) console.log(`not canonical: ${path.relative(process.cwd(), f)}`);
    else { fs.writeFileSync(f, out); console.log(`formatted ${path.relative(process.cwd(), f)}`); }
  }
  if (flags.check && changed) process.exitCode = 1;
}

function shrinkCmd(args) {
  const { flags, rest } = parseFlags(args);
  let total = 0;
  for (const f of (rest.length ? rest : ['.']).flatMap((a) => tlFilesIn(path.resolve(a)))) {
    const r = shrinkFile(f, { write: !flags.check });
    if (r.error) { console.error(`${path.relative(process.cwd(), f)}: does not compile, skipped (run tl check)`); process.exitCode = 1; continue; }
    if (!r.removed) continue;
    total += r.removed;
    console.log(`${flags.check ? 'can shrink' : 'shrunk'} ${path.relative(process.cwd(), f)}: ${r.removed} edit(s)`);
  }
  if (flags.check && total) process.exitCode = 1;
}

async function defCmd(args) {
  const { flags, rest } = parseFlags(args);
  const dir = path.resolve(rest[0] || '.');
  try {
    if (flags.expand) {
      const x = expandDef(dir);
      return console.log(`expanded symbols to long names in ${x.changed} of ${x.files} .tl file(s); run 'tl def' to put the symbols back`);
    }
    const r = await generateDef(dir, { write: !flags.check });
    for (const a of r.added) console.log(`  ${a.sym.padEnd(5)} ${a.long}  (${a.uses}x)`);
    const what = flags.check ? 'would add' : 'added';
    console.log(`${path.relative(process.cwd(), r.defFile) || 'tl.def'}: ${r.created && !flags.check ? 'created, ' : ''}${what} ${r.added.length} name(s); ${r.changed} of ${r.files} .tl file(s) rewritten`);
    if (flags.check && r.added.length) process.exitCode = 1;
  } catch (e) {
    console.error(formatError(e, null));
    process.exitCode = 1;
  }
}

function viewCmd(args) {
  const { flags, rest } = parseFlags(args);
  const f = path.resolve(rest[0]);
  try {
    const info = inspect(fs.readFileSync(f, 'utf8'), { file: f });
    const names = flags.short ? null : longNames(info.def, info.name);
    if (flags.plain) {
      if (info.error) throw info.error;
      return console.log(view(info.src, info.segments, names));
    }
    const r = readable(info, { names, keywords: !flags.sigils });
    console.log(r.text);
    if (r.error) process.exitCode = 1;
  } catch (e) {
    console.error(formatError(e, f));
    process.exitCode = 1;
  }
}
