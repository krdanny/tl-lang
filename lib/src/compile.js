// Compile pipeline: .tl + tl.def -> JavaScript module (the TL counterpart of `tsc`'s per-file emit).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Parser } from './parser.js';
import { emitModule } from './emit.js';
import { parseDef } from './def.js';
import { TLError } from './errors.js';

export const RUNTIME_PATH = fileURLToPath(new URL('../runtime/tl-runtime.js', import.meta.url));
export const RUNTIME_URL = pathToFileURL(RUNTIME_PATH).href;

const defCache = new Map();    // dir -> { mtime, def }
const exportCache = new Map(); // file -> { mtime, exports }

/** Nearest tl.def: the file's directory, then its parents (stops at a tlconfig.json or package.json). */
export function findDef(dir) {
  let d = path.resolve(dir);
  for (;;) {
    const f = path.join(d, 'tl.def');
    if (fs.existsSync(f)) return f;
    if (fs.existsSync(path.join(d, 'tlconfig.json')) || fs.existsSync(path.join(d, 'package.json'))) return null;
    const up = path.dirname(d);
    if (up === d) return null;
    d = up;
  }
}

/** Every TL project has a dictionary: without tl.def nothing compiles (spec §10). It may be empty. */
function loadDef(dir) {
  const file = findDef(dir);
  if (!file) {
    throw new TLError('E260', `no tl.def found for ${dir}: a TL project needs its dictionary file next to the .tl files (run 'tl def' to create it)`, 'tl.def', 0, ['tl def']);
  }
  const mtime = fs.statSync(file).mtimeMs;
  const hit = defCache.get(file);
  if (hit && hit.mtime === mtime) return hit.def;
  const def = { ...parseDef(fs.readFileSync(file, 'utf8'), file), file };
  defCache.set(file, { mtime, def });
  return def;
}

function moduleDefs(def, moduleName) {
  const m = new Map(def.global);
  for (const [k, v] of def.mods.get(moduleName) || []) m.set(k, v);
  return m;
}

/** Parses until the declaration table is stable (forward references, error inference). */
function analyze(src, name, env) {
  let prepass = null;
  let result = null;
  for (let pass = 0; pass < 4; pass++) {
    const p = new Parser(src, name, { ...env, prepass, methodArity: prepass ? prepass.methods : null });
    let ast = null, error = null;
    try { ast = p.parseProgram(); } catch (e) { if (!(e instanceof TLError)) throw e; error = e; }
    const stable = prepass && sameDecls(prepass, p.decls);
    result = { ast, error, parser: p };
    if (stable) break;
    prepass = p.decls;
  }
  return result;
}

function sameDecls(a, b) {
  const sig = (d) => JSON.stringify({
    f: [...d.fns].map(([k, v]) => [k, v.arity, !!v.erroring, !!v.async]),
    t: [...d.types].map(([k, v]) => [k, v.init || 0]), v: [...d.variants].map(([k, v]) => [k, v.arity]), e: [...d.errors.keys()], m: [...d.methods],
  });
  return sig(a) === sig(b);
}

/** Exported symbols of a sibling TL module, for `+name` imports. */
// Any name resolves: used for the modules of an import cycle while their real exports are still being computed.
const PERMISSIVE = new Proxy(new Map(), { get: (m, k) => (k === 'get' ? (name) => ({ kind: 'jsval', js: name }) : k === 'has' ? () => true : m[k].bind(m)) });

function exportsOf(file, name, shallow = false) {
  const mtime = fs.statSync(file).mtimeMs;
  const hit = exportCache.get(file);
  if (hit && hit.mtime === mtime && !hit.inProgress) return hit.exports;
  if (hit && hit.inProgress) {
    // import cycle: declare this module's own symbols from a pass whose imports resolve to anything
    if (hit.shallow) return hit.shallow;
    if (hit.shallowInProgress) return PERMISSIVE;
    hit.shallowInProgress = true;
    hit.shallow = exportsOf(file, name, true);
    return hit.shallow;
  }
  if (!shallow) exportCache.set(file, { mtime, exports: new Map(), inProgress: true });
  const dir = path.dirname(file);
  const def = loadDef(dir);
  const src = fs.readFileSync(file, 'utf8');
  const env = envFor(dir, def, name);
  const { parser, ast } = analyze(src, name, shallow ? { ...env, moduleExports: () => PERMISSIVE } : env);
  const out = new Map();
  const g = parser.scopes[0];
  const d = parser.decls;
  for (const [n, info] of d.fns) out.set(n, g.get(n) || info);
  for (const [n, info] of d.types) out.set(n, info);
  for (const [n, info] of d.variants) out.set(n, info);
  for (const [n, info] of d.errors) out.set(n, info);
  for (const [n, info] of d.traits) out.set(n, info);
  for (const [sym, e] of def.mods.get(name) || []) if (!out.has(sym) && e.kind !== 'mod') out.set(sym, g.get(sym));
  for (const s of ast ? ast.body : []) if (s.k === 'Let' && s.decl === 'const' && s.pat.k === 'PBind') out.set(s.pat.name, { kind: 'const', js: s.pat.js });
  if (!shallow) exportCache.set(file, { mtime, exports: out });
  return out;
}

function envFor(dir, def, name) {
  return {
    defs: moduleDefs(def, name),
    fields: def.fields,
    aliases: def.aliases,
    // prelude.tl next to the file is imported into every other module of the folder (`+prelude.*`)
    prelude: name !== 'prelude' && fs.existsSync(path.join(dir, 'prelude.tl')) ? 'prelude' : null,
    moduleExports: (modName) => {
      const f = path.join(dir, `${modName}.tl`);
      return fs.existsSync(f) ? exportsOf(f, modName) : null;
    },
  };
}

/**
 * Compile one .tl source.
 * @param {string} src
 * @param {{ file: string, runtime?: string }} opts  file = absolute path of the .tl file
 * @returns {{ js: string, name: string, segments: object[], ast: object }}
 */
export function compileSource(src, opts) {
  const file = path.resolve(opts.file);
  const dir = path.dirname(file);
  const name = path.basename(file, '.tl');
  const def = loadDef(dir);
  const env = envFor(dir, def, name);
  const { ast, error, parser } = analyze(src, name, env);
  if (error) throw error;
  const js = emitModule(ast, { runtime: opts.runtime || RUNTIME_URL, file: name, dir, defs: moduleDefs(def, name), fields: def.fields });
  return { js, name, segments: parser.segments, ast, src };
}

/**
 * Parse without emitting: what the readable view and editors need.
 * Never throws for TL errors: `error` holds the diagnostic and the other fields cover what was parsed before it.
 * @returns {{ src: string, tokens: object[], segments: object[], implicit: object[], ast: object|null, error: TLError|null, def: object }}
 */
export function inspect(src, opts) {
  const file = path.resolve(opts.file);
  const dir = path.dirname(file);
  const name = path.basename(file, '.tl');
  src = src.replace(/\r?\n$/, '');
  let def = { global: new Map(), mods: new Map(), fields: new Map(), aliases: new Map(), file: null };
  try {
    def = loadDef(dir);
    const { ast, error, parser } = analyze(src, name, envFor(dir, def, name));
    return { src, name, tokens: parser.toks, segments: parser.segments, implicit: parser.implicit, ast, error, def };
  } catch (e) {
    if (!(e instanceof TLError)) throw e;
    return { src, name, tokens: [], segments: [], implicit: [], ast: null, error: e, def }; // the lexer rejected the file
  }
}

export function compileFile(file, opts = {}) {
  const src = fs.readFileSync(file, 'utf8');
  return compileSource(src, { ...opts, file });
}

/** Human-readable diagnostic for a compile error (compact code line + caret), spec §59. */
export function formatError(e, file) {
  if (!(e instanceof TLError)) return e.stack || String(e);
  let src = null;
  try { if (file && e.file !== 'tl.def') src = fs.readFileSync(file, 'utf8').replace(/\r?\n$/, ''); } catch { /* ignore */ }
  return e.pretty(src);
}
